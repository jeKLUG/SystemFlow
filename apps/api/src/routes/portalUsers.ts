import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { customerUsers, customers, orgSettings, users } from "../db/schema.js";
import { createId } from "../lib/id.js";
import { isEmail } from "../lib/mail.js";
import {
  mailCustomerKinds,
  parseCustomerMailNotify,
  parseMailNotify,
  type CustomerMailNotify,
} from "../lib/mailNotify.js";
import { requireAdmin } from "../plugins/auth.js";

const upsertBody = z.object({
  username: z.string().min(2).max(80).optional(),
  password: z.string().min(8).max(200).optional(),
  enabled: z.boolean().optional(),
  email: z.string().max(200).optional().nullable(),
  notify: z.record(z.boolean()).optional(),
});

function mergeNotify(raw: string | null | undefined, patch?: Record<string, boolean>): CustomerMailNotify {
  const next = parseCustomerMailNotify(raw);
  if (!patch) return next;
  for (const kind of mailCustomerKinds) {
    if (typeof patch[kind] === "boolean") next[kind] = patch[kind]!;
  }
  return next;
}

function publicPortalUser(row: typeof customerUsers.$inferSelect) {
  return {
    id: row.id,
    customerId: row.customerId,
    username: row.username,
    email: row.email,
    enabled: row.enabled,
    notify: parseCustomerMailNotify(row.mailNotifyJson),
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function customerMailAllowed(db: Db): Promise<CustomerMailNotify> {
  const org = await db.select().from(orgSettings).where(eq(orgSettings.id, "default")).get();
  return parseMailNotify(org?.mailNotifyJson).customer;
}

/**
 * Staff: Portal-Zugang je Kundenakte anlegen, Passwort setzen, aktivieren, Mail-Typen setzen.
 */
export async function portalUserRoutes(app: FastifyInstance, db: Db) {
  app.addHook("preHandler", requireAdmin);

  app.get("/api/customers/:customerId/portal-user", async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    const customer = await db.select().from(customers).where(eq(customers.id, customerId)).get();
    if (!customer) return reply.code(404).send({ error: "Kunde nicht gefunden" });

    const row = await db
      .select()
      .from(customerUsers)
      .where(eq(customerUsers.customerId, customerId))
      .get();
    return { portalUser: row ? publicPortalUser(row) : null, kind: customer.kind, allowed: await customerMailAllowed(db) };
  });

  app.put("/api/customers/:customerId/portal-user", async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    const customer = await db.select().from(customers).where(eq(customers.id, customerId)).get();
    if (!customer) return reply.code(404).send({ error: "Kunde nicht gefunden" });
    if (customer.kind !== "customer") {
      return reply.code(400).send({ error: "Portal-Zugang nur für Kunden, nicht für Kontakte" });
    }

    const parsed = upsertBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }

    const existing = await db
      .select()
      .from(customerUsers)
      .where(eq(customerUsers.customerId, customerId))
      .get();

    const username = (parsed.data.username ?? existing?.username ?? "").trim();
    if (!username) {
      return reply.code(400).send({ error: "Benutzername erforderlich" });
    }

    if (!existing && !parsed.data.password) {
      return reply.code(400).send({ error: "Passwort beim Anlegen erforderlich (mind. 8 Zeichen)" });
    }

    const takenByAdmin = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).get();
    if (takenByAdmin) {
      return reply.code(400).send({ error: "Benutzername bereits vergeben" });
    }
    const takenByPortal = await db
      .select()
      .from(customerUsers)
      .where(eq(customerUsers.username, username))
      .get();
    if (takenByPortal && takenByPortal.customerId !== customerId) {
      return reply.code(400).send({ error: "Benutzername bereits vergeben" });
    }

    const emailRaw = parsed.data.email !== undefined ? parsed.data.email : existing?.email;
    const email = emailRaw?.trim() || customer.email?.trim() || null;
    if (email && !isEmail(email)) {
      return reply.code(400).send({ error: "E-Mail-Adresse ungültig" });
    }

    const now = new Date();
    const notify = mergeNotify(existing?.mailNotifyJson, parsed.data.notify);
    const mailNotifyJson = JSON.stringify(notify);
    if (!existing) {
      const passwordHash = await bcrypt.hash(parsed.data.password!, 12);
      const row = {
        id: createId("cusu"),
        customerId,
        username,
        passwordHash,
        email,
        mailNotifyJson,
        enabled: parsed.data.enabled ?? true,
        lastLoginAt: null,
        createdAt: now,
        updatedAt: now,
      };
      await db.insert(customerUsers).values(row);
      return reply.code(201).send({
        portalUser: publicPortalUser(row),
        allowed: await customerMailAllowed(db),
      });
    }

    const passwordHash = parsed.data.password
      ? await bcrypt.hash(parsed.data.password, 12)
      : existing.passwordHash;
    const updated = {
      username,
      passwordHash,
      email: parsed.data.email !== undefined ? email : existing.email,
      mailNotifyJson: parsed.data.notify ? mailNotifyJson : existing.mailNotifyJson,
      enabled: parsed.data.enabled ?? existing.enabled,
      updatedAt: now,
    };
    await db.update(customerUsers).set(updated).where(eq(customerUsers.id, existing.id));
    return {
      portalUser: publicPortalUser({ ...existing, ...updated }),
      allowed: await customerMailAllowed(db),
    };
  });

  app.delete("/api/customers/:customerId/portal-user", async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    const existing = await db
      .select()
      .from(customerUsers)
      .where(eq(customerUsers.customerId, customerId))
      .get();
    if (!existing) return reply.code(404).send({ error: "Kein Portal-Zugang" });
    await db.delete(customerUsers).where(eq(customerUsers.id, existing.id));
    return { ok: true };
  });
}
