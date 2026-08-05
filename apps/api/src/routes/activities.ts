import { desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { activities, customers } from "../db/schema.js";
import { createId } from "../lib/id.js";
import { requireAuth } from "../plugins/auth.js";

const activityBody = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional().or(z.literal("")),
  occurredAt: z.string().datetime().optional(),
});

/**
 * Erzeugt einen Historie-Eintrag für einen Kunden.
 */
export async function addActivity(
  db: Db,
  customerId: string,
  title: string,
  description?: string | null,
  occurredAt?: Date,
) {
  const now = new Date();
  const row = {
    id: createId("act"),
    customerId,
    title,
    description: description ?? null,
    occurredAt: occurredAt ?? now,
    createdAt: now,
  };
  await db.insert(activities).values(row);
  return row;
}

/**
 * Registriert Einsatz-Historie-Routen.
 */
export async function activityRoutes(app: FastifyInstance, db: Db) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/customers/:customerId/activities", async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    const customer = await db.select().from(customers).where(eq(customers.id, customerId)).get();
    if (!customer) return reply.code(404).send({ error: "Kunde nicht gefunden" });

    return await db
      .select()
      .from(activities)
      .where(eq(activities.customerId, customerId))
      .orderBy(desc(activities.occurredAt))
      .all();
  });

  app.post("/api/customers/:customerId/activities", async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    const customer = await db.select().from(customers).where(eq(customers.id, customerId)).get();
    if (!customer) return reply.code(404).send({ error: "Kunde nicht gefunden" });

    const parsed = activityBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }

    const row = await addActivity(
      db,
      customerId,
      parsed.data.title.trim(),
      parsed.data.description || null,
      parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : undefined,
    );
    return reply.code(201).send(row);
  });

  app.delete("/api/activities/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(activities).where(eq(activities.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Eintrag nicht gefunden" });
    await db.delete(activities).where(eq(activities.id, id));
    return { ok: true };
  });
}
