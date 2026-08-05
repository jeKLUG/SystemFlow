import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { users } from "../db/schema.js";
import { requireAuth } from "../plugins/auth.js";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

/**
 * Registriert Auth-Routen (Login, Logout, Session).
 */
export async function authRoutes(app: FastifyInstance, db: Db) {
  app.post("/api/auth/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe" });
    }

    const { username, password } = parsed.data;
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
    return { user: { id: user.id, username: user.username } };
  });

  app.post("/api/auth/logout", async (request) => {
    request.session.delete();
    return { ok: true };
  });

  app.get("/api/auth/me", { preHandler: requireAuth }, async (request) => {
    return {
      user: {
        id: request.session.get("userId"),
        username: request.session.get("username"),
      },
    };
  });
}
