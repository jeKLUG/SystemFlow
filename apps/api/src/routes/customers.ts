import { desc, eq, like, or, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { customers } from "../db/schema.js";
import { createId } from "../lib/id.js";
import { requireAuth } from "../plugins/auth.js";

const customerBody = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(80).optional().or(z.literal("")),
  address: z.string().max(500).optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
  status: z.enum(["active", "inactive"]).optional(),
});

/**
 * Registriert Kunden-CRUD-Routen.
 */
export async function customerRoutes(app: FastifyInstance, db: Db) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/customers", async (request) => {
    const q = z
      .object({ q: z.string().optional() })
      .parse(request.query);

    const term = q.q?.trim();
    if (term) {
      const pattern = `%${term}%`;
      return await db
        .select()
        .from(customers)
        .where(
          or(
            like(customers.name, pattern),
            like(customers.email, pattern),
            like(customers.phone, pattern),
          ),
        )
        .orderBy(desc(customers.updatedAt))
        .all();
    }

    return await db.select().from(customers).orderBy(desc(customers.updatedAt)).all();
  });

  app.get("/api/customers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await db.select().from(customers).where(eq(customers.id, id)).get();
    if (!row) return reply.code(404).send({ error: "Kunde nicht gefunden" });
    return row;
  });

  app.post("/api/customers", async (request, reply) => {
    const parsed = customerBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }

    const now = new Date();
    const row = {
      id: createId("cus"),
      name: parsed.data.name.trim(),
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      address: parsed.data.address || null,
      notes: parsed.data.notes || null,
      status: parsed.data.status ?? ("active" as const),
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(customers).values(row);
    return reply.code(201).send(row);
  });

  app.put("/api/customers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(customers).where(eq(customers.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Kunde nicht gefunden" });

    const parsed = customerBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }

    const updated = {
      name: parsed.data.name.trim(),
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      address: parsed.data.address || null,
      notes: parsed.data.notes || null,
      status: parsed.data.status ?? existing.status,
      updatedAt: new Date(),
    };

    await db.update(customers).set(updated).where(eq(customers.id, id));
    return { ...existing, ...updated };
  });

  app.delete("/api/customers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(customers).where(eq(customers.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Kunde nicht gefunden" });
    await db.delete(customers).where(eq(customers.id, id));
    return { ok: true };
  });

  app.get("/api/stats", async () => {
    const customerCount =
      (await db.select({ count: sql<number>`count(*)` }).from(customers).get())?.count ?? 0;

    const activeCount =
      (
        await db
          .select({ count: sql<number>`count(*)` })
          .from(customers)
          .where(eq(customers.status, "active"))
          .get()
      )?.count ?? 0;

    return { customerCount, activeCount };
  });
}
