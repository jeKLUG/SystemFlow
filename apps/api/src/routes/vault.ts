import { desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { customers, vaultEntries, vaultMeta } from "../db/schema.js";
import { createId } from "../lib/id.js";
import {
  decryptText,
  encryptText,
  rewrapDek,
  setupVault,
  unlockVault,
  wipe,
  type VaultMetaPayload,
} from "../lib/vaultCrypto.js";
import {
  checkUnlockAllowed,
  clearUnlockFailures,
  clearVaultDek,
  getVaultDek,
  isVaultUnlocked,
  putVaultDek,
  registerUnlockFailure,
  vaultExpiresAt,
} from "../lib/vaultSession.js";
import { requireAuth } from "../plugins/auth.js";

const META_ID = "default";
const MIN_PASS = 12;

const categoryEnum = z.enum([
  "vpn",
  "admin",
  "hosting",
  "email",
  "firewall",
  "remote",
  "wifi",
  "database",
  "cloud",
  "license",
  "office",
  "isp",
  "other",
]);

function emptyToNull(value: string | null | undefined) {
  if (!value || !value.trim()) return null;
  return value.trim();
}

function requireUserId(request: { session: { get: (k: "userId") => string | undefined } }) {
  return request.session.get("userId")!;
}

async function loadMeta(db: Db): Promise<VaultMetaPayload | null> {
  const row = await db.select().from(vaultMeta).where(eq(vaultMeta.id, META_ID)).get();
  if (!row) return null;
  return {
    saltB64: row.saltB64,
    wrappedDekB64: row.wrappedDekB64,
    canaryB64: row.canaryB64,
    kdf: JSON.parse(row.kdfJson),
  };
}

function requireDek(userId: string) {
  const dek = getVaultDek(userId);
  if (!dek) return null;
  return dek;
}

function parseTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const t = item.trim().toLowerCase().slice(0, 40);
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= 12) break;
  }
  return out;
}

function tagsFromJson(json: string | null | undefined): string[] {
  try {
    return parseTags(JSON.parse(json || "[]"));
  } catch {
    return [];
  }
}

function tagsToJson(tags: string[]): string {
  return JSON.stringify(tags);
}

function mapEntryMeta(r: {
  id: string;
  customerId: string | null;
  customerName?: string | null;
  customerCompany?: string | null;
  title: string;
  category: string;
  favorite: boolean;
  tagsJson: string;
  createdAt: Date;
  updatedAt: Date;
  hasUsername: string | null;
  hasPassword: string | null;
  hasUrl: string | null;
  hasNotes: string | null;
}) {
  return {
    id: r.id,
    customerId: r.customerId,
    customerName: r.customerName ?? null,
    customerCompany: r.customerCompany ?? null,
    title: r.title,
    category: r.category,
    favorite: Boolean(r.favorite),
    tags: tagsFromJson(r.tagsJson),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    hasUsername: Boolean(r.hasUsername),
    hasPassword: Boolean(r.hasPassword),
    hasUrl: Boolean(r.hasUrl),
    hasNotes: Boolean(r.hasNotes),
  };
}

/**
 * Passworttresor: AES-256-GCM, eigene Passphrase, DEK nur im RAM.
 */
export async function vaultRoutes(app: FastifyInstance, db: Db) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/vault/status", async (request) => {
    const userId = requireUserId(request);
    const configured = (await loadMeta(db)) != null;
    const unlocked = configured && isVaultUnlocked(userId);
    return {
      configured,
      unlocked,
      expiresAt: unlocked ? vaultExpiresAt(userId) : null,
    };
  });

  app.post("/api/vault/setup", async (request, reply) => {
    const userId = requireUserId(request);
    if (await loadMeta(db)) {
      return reply.code(400).send({ error: "Tresor ist bereits eingerichtet" });
    }

    const parsed = z
      .object({
        passphrase: z.string().min(MIN_PASS).max(200),
        confirm: z.string().min(MIN_PASS).max(200),
      })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: `Vault-Passphrase mindestens ${MIN_PASS} Zeichen` });
    }
    if (parsed.data.passphrase !== parsed.data.confirm) {
      return reply.code(400).send({ error: "Passphrasen stimmen nicht überein" });
    }

    const { meta, dek } = await setupVault(parsed.data.passphrase);
    const now = new Date();
    await db.insert(vaultMeta).values({
      id: META_ID,
      saltB64: meta.saltB64,
      wrappedDekB64: meta.wrappedDekB64,
      canaryB64: meta.canaryB64,
      kdfJson: JSON.stringify(meta.kdf),
      createdAt: now,
      updatedAt: now,
    });
    putVaultDek(userId, dek);
    wipe(dek);

    return { ok: true, configured: true, unlocked: true, expiresAt: vaultExpiresAt(userId) };
  });

  app.post("/api/vault/unlock", async (request, reply) => {
    const userId = requireUserId(request);
    const gate = checkUnlockAllowed(userId);
    if (gate.locked) {
      return reply
        .code(429)
        .send({ error: `Zu viele Fehlversuche. Warte ${gate.retryAfterSec}s.` });
    }

    const meta = await loadMeta(db);
    if (!meta) return reply.code(400).send({ error: "Tresor noch nicht eingerichtet" });

    const parsed = z.object({ passphrase: z.string().min(1).max(200) }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Passphrase erforderlich" });

    const dek = await unlockVault(parsed.data.passphrase, meta);
    if (!dek) {
      const fail = registerUnlockFailure(userId);
      if (fail.locked) {
        return reply
          .code(429)
          .send({ error: `Zu viele Fehlversuche. Warte ${fail.retryAfterSec}s.` });
      }
      return reply.code(401).send({ error: "Falsche Vault-Passphrase" });
    }

    clearUnlockFailures(userId);
    putVaultDek(userId, dek);
    wipe(dek);
    return { ok: true, unlocked: true, expiresAt: vaultExpiresAt(userId) };
  });

  app.post("/api/vault/lock", async (request) => {
    const userId = requireUserId(request);
    clearVaultDek(userId);
    return { ok: true, unlocked: false };
  });

  app.post("/api/vault/change-passphrase", async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = z
      .object({
        currentPassphrase: z.string().min(1).max(200),
        newPassphrase: z.string().min(MIN_PASS).max(200),
        confirm: z.string().min(MIN_PASS).max(200),
      })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: `Neue Passphrase mindestens ${MIN_PASS} Zeichen` });
    }
    if (parsed.data.newPassphrase !== parsed.data.confirm) {
      return reply.code(400).send({ error: "Passphrasen stimmen nicht überein" });
    }

    const meta = await loadMeta(db);
    if (!meta) return reply.code(400).send({ error: "Tresor noch nicht eingerichtet" });

    const dek = await unlockVault(parsed.data.currentPassphrase, meta);
    if (!dek) return reply.code(401).send({ error: "Aktuelle Passphrase falsch" });

    try {
      const next = await rewrapDek(dek, parsed.data.newPassphrase);
      await db
        .update(vaultMeta)
        .set({
          saltB64: next.saltB64,
          wrappedDekB64: next.wrappedDekB64,
          canaryB64: next.canaryB64,
          kdfJson: JSON.stringify(next.kdf),
          updatedAt: new Date(),
        })
        .where(eq(vaultMeta.id, META_ID));
      putVaultDek(userId, dek);
      return { ok: true };
    } finally {
      wipe(dek);
    }
  });

  app.get("/api/vault/entries", async (request, reply) => {
    const userId = requireUserId(request);
    if (!(await loadMeta(db))) {
      return reply.code(400).send({ error: "Tresor noch nicht eingerichtet" });
    }
    if (!isVaultUnlocked(userId)) {
      return reply.code(403).send({ error: "Tresor ist gesperrt", code: "VAULT_LOCKED" });
    }

    const q = z
      .object({ customerId: z.string().optional() })
      .parse(request.query);

    let rows = await db
      .select({
        id: vaultEntries.id,
        customerId: vaultEntries.customerId,
        customerName: customers.name,
        customerCompany: customers.company,
        title: vaultEntries.title,
        category: vaultEntries.category,
        favorite: vaultEntries.favorite,
        tagsJson: vaultEntries.tagsJson,
        createdAt: vaultEntries.createdAt,
        updatedAt: vaultEntries.updatedAt,
        hasUsername: vaultEntries.usernameEnc,
        hasPassword: vaultEntries.passwordEnc,
        hasUrl: vaultEntries.urlEnc,
        hasNotes: vaultEntries.notesEnc,
      })
      .from(vaultEntries)
      .leftJoin(customers, eq(vaultEntries.customerId, customers.id))
      .orderBy(desc(vaultEntries.updatedAt))
      .all();

    if (q.customerId) rows = rows.filter((r) => r.customerId === q.customerId);

    return rows.map((r) => mapEntryMeta(r));
  });

  app.post("/api/vault/entries", async (request, reply) => {
    const userId = requireUserId(request);
    const dek = requireDek(userId);
    if (!dek) return reply.code(403).send({ error: "Tresor ist gesperrt", code: "VAULT_LOCKED" });

    const parsed = z
      .object({
        title: z.string().min(1).max(200),
        category: categoryEnum.optional(),
        favorite: z.boolean().optional(),
        tags: z.array(z.string()).optional(),
        customerId: z.string().optional().nullable().or(z.literal("")),
        username: z.string().max(500).optional().or(z.literal("")),
        password: z.string().max(2000).optional().or(z.literal("")),
        url: z.string().max(2000).optional().or(z.literal("")),
        notes: z.string().max(10000).optional().or(z.literal("")),
      })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }

    const customerId = emptyToNull(parsed.data.customerId);
    if (customerId) {
      const c = await db.select().from(customers).where(eq(customers.id, customerId)).get();
      if (!c) return reply.code(400).send({ error: "Kunde nicht gefunden" });
    }

    const tags = parseTags(parsed.data.tags ?? []);
    const now = new Date();
    const row = {
      id: createId("sec"),
      customerId,
      title: parsed.data.title.trim(),
      category: parsed.data.category ?? "other",
      favorite: parsed.data.favorite ?? false,
      tagsJson: tagsToJson(tags),
      usernameEnc: emptyToNull(parsed.data.username)
        ? encryptText(dek, parsed.data.username!.trim())
        : null,
      passwordEnc: emptyToNull(parsed.data.password)
        ? encryptText(dek, parsed.data.password!)
        : null,
      urlEnc: emptyToNull(parsed.data.url) ? encryptText(dek, parsed.data.url!.trim()) : null,
      notesEnc: emptyToNull(parsed.data.notes) ? encryptText(dek, parsed.data.notes!) : null,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(vaultEntries).values(row);
    return reply.code(201).send(
      mapEntryMeta({
        ...row,
        customerName: null,
        customerCompany: null,
        hasUsername: row.usernameEnc,
        hasPassword: row.passwordEnc,
        hasUrl: row.urlEnc,
        hasNotes: row.notesEnc,
      }),
    );
  });

  app.get("/api/vault/entries/:id/reveal", async (request, reply) => {
    const userId = requireUserId(request);
    const dek = requireDek(userId);
    if (!dek) return reply.code(403).send({ error: "Tresor ist gesperrt", code: "VAULT_LOCKED" });

    const { id } = request.params as { id: string };
    const row = await db.select().from(vaultEntries).where(eq(vaultEntries.id, id)).get();
    if (!row) return reply.code(404).send({ error: "Eintrag nicht gefunden" });

    try {
      return {
        id: row.id,
        title: row.title,
        category: row.category,
        favorite: Boolean(row.favorite),
        tags: tagsFromJson(row.tagsJson),
        customerId: row.customerId,
        username: row.usernameEnc ? decryptText(dek, row.usernameEnc) : null,
        password: row.passwordEnc ? decryptText(dek, row.passwordEnc) : null,
        url: row.urlEnc ? decryptText(dek, row.urlEnc) : null,
        notes: row.notesEnc ? decryptText(dek, row.notesEnc) : null,
      };
    } catch {
      return reply.code(500).send({ error: "Entschlüsselung fehlgeschlagen" });
    }
  });

  app.put("/api/vault/entries/:id", async (request, reply) => {
    const userId = requireUserId(request);
    const dek = requireDek(userId);
    if (!dek) return reply.code(403).send({ error: "Tresor ist gesperrt", code: "VAULT_LOCKED" });

    const { id } = request.params as { id: string };
    const existing = await db.select().from(vaultEntries).where(eq(vaultEntries.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Eintrag nicht gefunden" });

    const parsed = z
      .object({
        title: z.string().min(1).max(200).optional(),
        category: categoryEnum.optional(),
        favorite: z.boolean().optional(),
        tags: z.array(z.string()).optional(),
        customerId: z.string().optional().nullable().or(z.literal("")),
        username: z.string().max(500).optional().nullable(),
        password: z.string().max(2000).optional().nullable(),
        url: z.string().max(2000).optional().nullable(),
        notes: z.string().max(10000).optional().nullable(),
      })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }

    let customerId = existing.customerId;
    if (parsed.data.customerId !== undefined) {
      customerId = emptyToNull(parsed.data.customerId);
      if (customerId) {
        const c = await db.select().from(customers).where(eq(customers.id, customerId)).get();
        if (!c) return reply.code(400).send({ error: "Kunde nicht gefunden" });
      }
    }

    const encOrKeep = (value: string | null | undefined, previous: string | null) => {
      if (value === undefined) return previous;
      if (value === null || value === "") return null;
      return encryptText(dek, value);
    };

    const tagsJson =
      parsed.data.tags !== undefined
        ? tagsToJson(parseTags(parsed.data.tags))
        : existing.tagsJson;

    const updated = {
      title: parsed.data.title?.trim() ?? existing.title,
      category: parsed.data.category ?? existing.category,
      favorite: parsed.data.favorite ?? existing.favorite,
      tagsJson,
      customerId,
      usernameEnc: encOrKeep(parsed.data.username, existing.usernameEnc),
      passwordEnc: encOrKeep(parsed.data.password, existing.passwordEnc),
      urlEnc: encOrKeep(parsed.data.url, existing.urlEnc),
      notesEnc: encOrKeep(parsed.data.notes, existing.notesEnc),
      updatedAt: new Date(),
    };

    await db.update(vaultEntries).set(updated).where(eq(vaultEntries.id, id));
    return mapEntryMeta({
      id,
      customerId: updated.customerId,
      title: updated.title,
      category: updated.category,
      favorite: updated.favorite,
      tagsJson: updated.tagsJson,
      createdAt: existing.createdAt,
      updatedAt: updated.updatedAt,
      hasUsername: updated.usernameEnc,
      hasPassword: updated.passwordEnc,
      hasUrl: updated.urlEnc,
      hasNotes: updated.notesEnc,
    });
  });

  app.delete("/api/vault/entries/:id", async (request, reply) => {
    const userId = requireUserId(request);
    if (!isVaultUnlocked(userId)) {
      return reply.code(403).send({ error: "Tresor ist gesperrt", code: "VAULT_LOCKED" });
    }
    const { id } = request.params as { id: string };
    const existing = await db.select().from(vaultEntries).where(eq(vaultEntries.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Eintrag nicht gefunden" });
    await db.delete(vaultEntries).where(eq(vaultEntries.id, id));
    return { ok: true };
  });
}
