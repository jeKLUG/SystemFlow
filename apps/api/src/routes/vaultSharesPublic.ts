import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { vaultShares } from "../db/schema.js";
import { decryptSharePayload } from "../lib/vaultShareCrypto.js";
import {
  checkUnlockAllowed,
  clearUnlockFailures,
  registerUnlockFailure,
  shareFailureKey,
} from "../lib/vaultSession.js";

type ShareStatus = "ok" | "expired" | "consumed" | "revoked" | "not_found";

function classifyShare(row: {
  revokedAt: Date | null;
  consumedAt: Date | null;
  expiresAt: Date;
  viewCount: number;
  maxViews: number;
  payloadEnc: string;
}): ShareStatus {
  if (row.revokedAt) return "revoked";
  if (row.consumedAt || !row.payloadEnc || row.viewCount >= row.maxViews) return "consumed";
  if (Date.now() > row.expiresAt.getTime()) return "expired";
  return "ok";
}

/**
 * Öffentliche Endpunkte für Einweg-Vault-Shares (ohne Login).
 */
export async function vaultSharesPublicRoutes(app: FastifyInstance, db: Db) {
  app.get("/api/public/vault-shares/:token", async (request, reply) => {
    const { token } = request.params as { token: string };
    if (!token || token.length < 16 || token.length > 80) {
      return reply.code(404).send({ status: "not_found" as ShareStatus });
    }

    const row = await db.select().from(vaultShares).where(eq(vaultShares.id, token)).get();
    if (!row) return { status: "not_found" as ShareStatus };

    const status = classifyShare(row);
    return {
      status,
      expiresAt: row.expiresAt.toISOString(),
      maxViews: row.maxViews,
      viewCount: row.viewCount,
      viewsRemaining: Math.max(0, row.maxViews - row.viewCount),
    };
  });

  app.post("/api/public/vault-shares/:token/open", async (request, reply) => {
    const { token } = request.params as { token: string };
    if (!token || token.length < 16 || token.length > 80) {
      return reply.code(404).send({ error: "Link nicht gefunden", status: "not_found" });
    }

    const failKey = shareFailureKey(token);
    const gate = checkUnlockAllowed(failKey);
    if (gate.locked) {
      return reply
        .code(429)
        .send({ error: `Zu viele Fehlversuche. Warte ${gate.retryAfterSec}s.` });
    }

    const parsed = z
      .object({ pin: z.string().regex(/^\d{6}$/) })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "PIN muss 6 Ziffern haben" });
    }

    const row = await db.select().from(vaultShares).where(eq(vaultShares.id, token)).get();
    if (!row) {
      return reply.code(404).send({ error: "Link nicht gefunden", status: "not_found" });
    }

    const status = classifyShare(row);
    if (status === "revoked") {
      return reply.code(410).send({ error: "Link wurde widerrufen", status });
    }
    if (status === "consumed") {
      return reply.code(410).send({ error: "Link wurde bereits genutzt", status });
    }
    if (status === "expired") {
      return reply.code(410).send({ error: "Link ist abgelaufen", status });
    }

    let payload;
    try {
      payload = await decryptSharePayload(parsed.data.pin, row.saltB64, row.payloadEnc);
    } catch {
      const fail = registerUnlockFailure(failKey);
      if (fail.locked) {
        return reply
          .code(429)
          .send({ error: `Zu viele Fehlversuche. Warte ${fail.retryAfterSec}s.` });
      }
      return reply.code(401).send({ error: "Falsche PIN" });
    }

    clearUnlockFailures(failKey);

    const nextViews = row.viewCount + 1;
    const exhausted = nextViews >= row.maxViews;
    const now = new Date();
    await db
      .update(vaultShares)
      .set({
        viewCount: nextViews,
        consumedAt: exhausted ? now : row.consumedAt,
        payloadEnc: exhausted ? "" : row.payloadEnc,
        saltB64: exhausted ? "" : row.saltB64,
      })
      .where(eq(vaultShares.id, token));

    return {
      status: "ok" as const,
      title: payload.title,
      username: payload.username,
      password: payload.password,
      url: payload.url,
      notes: payload.notes,
      totpSecret: payload.totpSecret,
      viewsRemaining: Math.max(0, row.maxViews - nextViews),
      expiresAt: row.expiresAt.toISOString(),
    };
  });
}