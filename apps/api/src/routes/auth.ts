import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { users } from "../db/schema.js";
import { clearVaultDek } from "../lib/vaultSession.js";
import { requireAuth } from "../plugins/auth.js";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  /** Längere Session (30 Tage); sonst nur bis Browser-Ende / kurze Laufzeit. */
  rememberMe: z.boolean().optional().default(true),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

const SESSION_LONG_SEC = 60 * 60 * 24 * 30;
const SESSION_SHORT_SEC = 60 * 60 * 12;

/**
 * Registriert Auth-Routen (Login, Logout, Session, Passwort ändern).
 */
export async function authRoutes(app: FastifyInstance, db: Db) {
  app.post("/api/auth/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe" });
    }

    const { username, password, rememberMe } = parsed.data;
    const user = await db.select().from(users).where(eq(users.username, username)).get();
    if (!user) {
      return reply.code(401).send({ error: "Benutzername oder Passwort falsch" });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return reply.code(401).send({ error: "Benutzername oder Passwort falsch" });
    }

    request.session.set("userId", user.id);
    request.session.set("username", user.username);
    request.session.set("rememberMe", rememberMe ? "1" : "0");
    request.session.options({
      maxAge: rememberMe ? SESSION_LONG_SEC : SESSION_SHORT_SEC,
    });

    return { user: { id: user.id, username: user.username } };
  });

  app.post("/api/auth/logout", async (request) => {
    const userId = request.session.get("userId");
    if (userId) clearVaultDek(userId);
    request.session.delete();
    return { ok: true };
  });

  app.get("/api/auth/me", { preHandler: requireAuth }, async (request) => {
    // Cookie-Ablauf bei Nutzung verlängern (Sliding)
    const remember = request.session.get("rememberMe") !== "0";
    request.session.options({
      maxAge: remember ? SESSION_LONG_SEC : SESSION_SHORT_SEC,
    });
    request.session.touch();

    return {
      user: {
        id: request.session.get("userId"),
        username: request.session.get("username"),
      },
    };
  });

  app.post("/api/auth/change-password", { preHandler: requireAuth }, async (request, reply) => {
    const parsed = passwordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Neues Passwort mindestens 8 Zeichen",
        details: parsed.error.flatten(),
      });
    }

    const userId = request.session.get("userId");
    if (!userId) return reply.code(401).send({ error: "Nicht angemeldet" });

    const user = await db.select().from(users).where(eq(users.id, userId)).get();
    if (!user) return reply.code(401).send({ error: "Nicht angemeldet" });

    const ok = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
    if (!ok) {
      return reply.code(400).send({ error: "Aktuelles Passwort ist falsch" });
    }

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
    await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));

    // Session behalten – eingeloggt bleiben
    return { ok: true };
  });
}
