import { desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { contracts, customers } from "../db/schema.js";
import { createId } from "../lib/id.js";
import { requireAuth } from "../plugins/auth.js";

const contractBody = z.object({
  title: z.string().min(1).max(300),
  startDate: z.string().max(40).optional().or(z.literal("")),
  endDate: z.string().max(40).optional().or(z.literal("")),
  slaResponseHours: z.coerce.number().int().positive().max(8760).optional().nullable(),
  contactPerson: z.string().max(200).optional().or(z.literal("")),
  notes: z.string().max(5000).optional().or(z.literal("")),
});

/**
 * Registriert Vertrags-/SLA-Routen (ohne Rechnungsfunktionen).
 */
export async function contractRoutes(app: FastifyInstance, db: Db) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/customers/:customerId/contracts", async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    const customer = await db.select().from(customers).where(eq(customers.id, customerId)).get();
    if (!customer) return reply.code(404).send({ error: "Kunde nicht gefunden" });

    return await db
      .select()
      .from(contracts)
      .where(eq(contracts.customerId, customerId))
      .orderBy(desc(contracts.updatedAt))
      .all();
  });

  app.post("/api/customers/:customerId/contracts", async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    const customer = await db.select().from(customers).where(eq(customers.id, customerId)).get();
    if (!customer) return reply.code(404).send({ error: "Kunde nicht gefunden" });

    const parsed = contractBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }

    const now = new Date();
    const row = {
      id: createId("ctr"),
      customerId,
      title: parsed.data.title.trim(),
      startDate: parsed.data.startDate || null,
      endDate: parsed.data.endDate || null,
      slaResponseHours: parsed.data.slaResponseHours ?? null,
      contactPerson: parsed.data.contactPerson || null,
      notes: parsed.data.notes || null,
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(contracts).values(row);
    return reply.code(201).send(row);
  });

  app.put("/api/contracts/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(contracts).where(eq(contracts.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Vertrag nicht gefunden" });

    const parsed = contractBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }

    const updated = {
      title: parsed.data.title.trim(),
      startDate: parsed.data.startDate || null,
      endDate: parsed.data.endDate || null,
      slaResponseHours: parsed.data.slaResponseHours ?? null,
      contactPerson: parsed.data.contactPerson || null,
      notes: parsed.data.notes || null,
      updatedAt: new Date(),
    };
    await db.update(contracts).set(updated).where(eq(contracts.id, id));
    return { ...existing, ...updated };
  });

  app.delete("/api/contracts/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(contracts).where(eq(contracts.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Vertrag nicht gefunden" });
    await db.delete(contracts).where(eq(contracts.id, id));
    return { ok: true };
  });
}
