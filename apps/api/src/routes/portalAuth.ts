import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { customerUsers, customers } from "../db/schema.js";
import { applySessionTtl, requirePortal } from "../plugins/auth.js";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  rememberMe: z.boolean().optional().default(true),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

/**
 * Portal-Login für Kunden (getrennt vom Staff-Login).
 */
export async function portalAuthRoutes(app: FastifyInstance, db: Db) {
  app.post("/api/portal/auth/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe" });
    }

    const { username, password, rememberMe } = parsed.data;
    const portalUser = await db
      .select()
      .from(customerUsers)
      .where(eq(customerUsers.username, username))
      .get();
    if (!portalUser || !portalUser.enabled) {
      return reply.code(401).send({ error: "Benutzername oder Passwort falsch" });
    }

    const customer = await db
      .select()
      .from(customers)
      .where(eq(customers.id, portalUser.customerId))
      .get();
    if (!customer || customer.status !== "active" || customer.kind !== "customer") {
      return reply.code(401).send({ error: "Benutzername oder Passwort falsch" });
    }

    const ok = await bcrypt.compare(password, portalUser.passwordHash);
    if (!ok) {
      return reply.code(401).send({ error: "Benutzername oder Passwort falsch" });
    }

    const now = new Date();
    await db
      .update(customerUsers)
      .set({ lastLoginAt: now, updatedAt: now })
      .where(eq(customerUsers.id, portalUser.id));

    request.session.set("userId", portalUser.id);
    request.session.set("username", portalUser.username);
    request.session.set("rememberMe", rememberMe ? "1" : "0");
    request.session.set("role", "customer");
    request.session.set("customerId", customer.id);
    applySessionTtl(request, rememberMe);

    return {
      user: {
        id: portalUser.id,
        username: portalUser.username,
        role: "customer" as const,
        customerId: customer.id,
        customerName: customer.company || customer.name,
      },
    };
  });

  app.post("/api/portal/auth/logout", async (request) => {
    request.session.delete();
    return { ok: true };
  });

  app.get("/api/portal/auth/me", { preHandler: requirePortal(db) }, async (request) => {
    const remember = request.session.get("rememberMe") !== "0";
    applySessionTtl(request, remember);
    request.session.touch();
    const portal = request.portal!;
    const customer = await db.select().from(customers).where(eq(customers.id, portal.customerId)).get();
    return {
      user: {
        id: portal.userId,
        username: portal.username,
        role: "customer" as const,
        customerId: portal.customerId,
        customerName: customer?.company || customer?.name || portal.username,
      },
    };
  });

  app.post(
    "/api/portal/auth/change-password",
    { preHandler: requirePortal(db) },
    async (request, reply) => {
      const parsed = passwordSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "Neues Passwort mindestens 8 Zeichen",
          details: parsed.error.flatten(),
        });
      }

      const portal = request.portal!;
      const portalUser = await db
        .select()
        .from(customerUsers)
        .where(eq(customerUsers.id, portal.userId))
        .get();
      if (!portalUser) return reply.code(401).send({ error: "Nicht angemeldet" });

      const ok = await bcrypt.compare(parsed.data.currentPassword, portalUser.passwordHash);
      if (!ok) {
        return reply.code(400).send({ error: "Aktuelles Passwort ist falsch" });
      }

      const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
      await db
        .update(customerUsers)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(customerUsers.id, portalUser.id));

      return { ok: true };
    },
  );
}
