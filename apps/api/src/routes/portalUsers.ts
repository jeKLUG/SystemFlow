import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { customerUsers, customers, users } from "../db/schema.js";
import { createId } from "../lib/id.js";
import { requireAdmin } from "../plugins/auth.js";

const upsertBody = z.object({
  username: z.string().min(2).max(80).optional(),
  password: z.string().min(8).max(200).optional(),
  enabled: z.boolean().optional(),
});

function publicPortalUser(row: typeof customerUsers.$inferSelect) {
  return {
    id: row.id,
    customerId: row.customerId,
    username: row.username,
    enabled: row.enabled,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Staff: Portal-Zugang je Kundenakte anlegen, Passwort setzen, aktivieren.
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
    return { portalUser: row ? publicPortalUser(row) : null, kind: customer.kind };
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

    const now = new Date();
    if (!existing) {
      const passwordHash = await bcrypt.hash(parsed.data.password!, 12);
      const row = {
        id: createId("cusu"),
        customerId,
        username,
        passwordHash,
        enabled: parsed.data.enabled ?? true,
        lastLoginAt: null,
        createdAt: now,
        updatedAt: now,
      };
      await db.insert(customerUsers).values(row);
      return reply.code(201).send({ portalUser: publicPortalUser(row) });
    }

    const passwordHash = parsed.data.password
      ? await bcrypt.hash(parsed.data.password, 12)
      : existing.passwordHash;
    const updated = {
      username,
      passwordHash,
      enabled: parsed.data.enabled ?? existing.enabled,
      updatedAt: now,
    };
    await db.update(customerUsers).set(updated).where(eq(customerUsers.id, existing.id));
    return { portalUser: publicPortalUser({ ...existing, ...updated }) };
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
