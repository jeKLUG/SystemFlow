import { desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { assets, customers } from "../db/schema.js";
import { createId } from "../lib/id.js";
import { requireAuth } from "../plugins/auth.js";
import { addActivity } from "./activities.js";

const assetBody = z.object({
  name: z.string().min(1).max(200),
  kind: z.enum(["pc", "server", "firewall", "license", "network", "other"]).optional(),
  manufacturer: z.string().max(200).optional().or(z.literal("")),
  model: z.string().max(200).optional().or(z.literal("")),
  serialNumber: z.string().max(200).optional().or(z.literal("")),
  warrantyUntil: z.string().max(40).optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
});

/**
 * Registriert Anlagen-/Geräte-Routen.
 */
export async function assetRoutes(app: FastifyInstance, db: Db) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/customers/:customerId/assets", async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    const customer = await db.select().from(customers).where(eq(customers.id, customerId)).get();
    if (!customer) return reply.code(404).send({ error: "Kunde nicht gefunden" });

    return await db
      .select()
      .from(assets)
      .where(eq(assets.customerId, customerId))
      .orderBy(desc(assets.updatedAt))
      .all();
  });

  app.post("/api/customers/:customerId/assets", async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    const customer = await db.select().from(customers).where(eq(customers.id, customerId)).get();
    if (!customer) return reply.code(404).send({ error: "Kunde nicht gefunden" });

    const parsed = assetBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }

    const now = new Date();
    const row = {
      id: createId("ast"),
      customerId,
      name: parsed.data.name.trim(),
      kind: parsed.data.kind ?? ("other" as const),
      manufacturer: parsed.data.manufacturer || null,
      model: parsed.data.model || null,
      serialNumber: parsed.data.serialNumber || null,
      warrantyUntil: parsed.data.warrantyUntil || null,
      notes: parsed.data.notes || null,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(assets).values(row);
    await addActivity(db, customerId, `Anlage hinzugefügt: ${row.name}`, row.kind);
    return reply.code(201).send(row);
  });

  app.put("/api/assets/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(assets).where(eq(assets.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Anlage nicht gefunden" });

    const parsed = assetBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }

    const updated = {
      name: parsed.data.name.trim(),
      kind: parsed.data.kind ?? existing.kind,
      manufacturer: parsed.data.manufacturer || null,
      model: parsed.data.model || null,
      serialNumber: parsed.data.serialNumber || null,
      warrantyUntil: parsed.data.warrantyUntil || null,
      notes: parsed.data.notes || null,
      updatedAt: new Date(),
    };

    await db.update(assets).set(updated).where(eq(assets.id, id));
    return { ...existing, ...updated };
  });

  app.delete("/api/assets/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(assets).where(eq(assets.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Anlage nicht gefunden" });
    await db.delete(assets).where(eq(assets.id, id));
    return { ok: true };
  });
}
