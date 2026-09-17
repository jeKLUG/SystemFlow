import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { users } from "../db/schema.js";
import { clearVaultDek } from "../lib/vaultSession.js";
import { applySessionTtl, requireAdmin } from "../plugins/auth.js";

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

/**
 * Registriert Staff-Auth-Routen (Login, Logout, Session, Passwort ändern).
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
    request.session.set("role", "admin");
    request.session.set("customerId", "");
    applySessionTtl(request, rememberMe);

    return { user: { id: user.id, username: user.username, role: "admin" as const } };
  });

  app.post("/api/auth/logout", async (request) => {
    const userId = request.session.get("userId");
    if (userId && request.session.get("role") !== "customer") clearVaultDek(userId);
    request.session.delete();
    return { ok: true };
  });

  app.get("/api/auth/me", { preHandler: requireAdmin }, async (request) => {
    const remember = request.session.get("rememberMe") !== "0";
    applySessionTtl(request, remember);
    request.session.touch();

    return {
      user: {
        id: request.session.get("userId"),
        username: request.session.get("username"),
        role: "admin" as const,
      },
    };
  });

  app.post("/api/auth/change-password", { preHandler: requireAdmin }, async (request, reply) => {
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

    return { ok: true };
  });
}
