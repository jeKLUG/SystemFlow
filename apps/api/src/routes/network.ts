import { asc, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { customers, networkPlans, networkSegments } from "../db/schema.js";
import { createId } from "../lib/id.js";
import { requireAuth } from "../plugins/auth.js";

function emptyToNull(value: string | null | undefined) {
  if (!value || !value.trim()) return null;
  return value.trim();
}

const segmentBody = z.object({
  name: z.string().min(1).max(200),
  cidr: z.string().max(80).optional().or(z.literal("")),
  vlan: z.string().max(80).optional().or(z.literal("")),
  gateway: z.string().max(80).optional().or(z.literal("")),
  dns: z.string().max(200).optional().or(z.literal("")),
  dhcpRange: z.string().max(200).optional().or(z.literal("")),
  purpose: z.string().max(200).optional().or(z.literal("")),
  color: z.string().max(40).optional().or(z.literal("")),
  sortOrder: z.number().int().optional(),
  notes: z.string().max(5000).optional().or(z.literal("")),
});

const planBody = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional().or(z.literal("")),
  diagramJson: z.string().max(500_000).optional(),
});

/**
 * Netzsegmente und visuelle Netzwerkpläne pro Kunde.
 */
export async function networkRoutes(app: FastifyInstance, db: Db) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/customers/:customerId/network-segments", async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    const customer = await db.select().from(customers).where(eq(customers.id, customerId)).get();
    if (!customer) return reply.code(404).send({ error: "Kunde nicht gefunden" });
    return await db
      .select()
      .from(networkSegments)
      .where(eq(networkSegments.customerId, customerId))
      .orderBy(asc(networkSegments.sortOrder), asc(networkSegments.name))
      .all();
  });

  app.post("/api/customers/:customerId/network-segments", async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    const customer = await db.select().from(customers).where(eq(customers.id, customerId)).get();
    if (!customer) return reply.code(404).send({ error: "Kunde nicht gefunden" });

    const parsed = segmentBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }

    const now = new Date();
    const row = {
      id: createId("seg"),
      customerId,
      name: parsed.data.name.trim(),
      cidr: emptyToNull(parsed.data.cidr),
      vlan: emptyToNull(parsed.data.vlan),
      gateway: emptyToNull(parsed.data.gateway),
      dns: emptyToNull(parsed.data.dns),
      dhcpRange: emptyToNull(parsed.data.dhcpRange),
      purpose: emptyToNull(parsed.data.purpose),
      color: emptyToNull(parsed.data.color) ?? "#2f7cf6",
      sortOrder: parsed.data.sortOrder ?? 0,
      notes: emptyToNull(parsed.data.notes),
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(networkSegments).values(row);
    return reply.code(201).send(row);
  });

  app.put("/api/network-segments/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(networkSegments).where(eq(networkSegments.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Segment nicht gefunden" });

    const parsed = segmentBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }

    const updated = {
      name: parsed.data.name.trim(),
      cidr: emptyToNull(parsed.data.cidr),
      vlan: emptyToNull(parsed.data.vlan),
      gateway: emptyToNull(parsed.data.gateway),
      dns: emptyToNull(parsed.data.dns),
      dhcpRange: emptyToNull(parsed.data.dhcpRange),
      purpose: emptyToNull(parsed.data.purpose),
      color: emptyToNull(parsed.data.color) ?? existing.color,
      sortOrder: parsed.data.sortOrder ?? existing.sortOrder,
      notes: emptyToNull(parsed.data.notes),
      updatedAt: new Date(),
    };
    await db.update(networkSegments).set(updated).where(eq(networkSegments.id, id));
    return { ...existing, ...updated };
  });

  app.delete("/api/network-segments/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(networkSegments).where(eq(networkSegments.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Segment nicht gefunden" });
    await db.delete(networkSegments).where(eq(networkSegments.id, id));
    return { ok: true };
  });

  app.get("/api/customers/:customerId/network-plans", async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    const customer = await db.select().from(customers).where(eq(customers.id, customerId)).get();
    if (!customer) return reply.code(404).send({ error: "Kunde nicht gefunden" });
    return await db
      .select()
      .from(networkPlans)
      .where(eq(networkPlans.customerId, customerId))
      .orderBy(desc(networkPlans.updatedAt))
      .all();
  });

  app.post("/api/customers/:customerId/network-plans", async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    const customer = await db.select().from(customers).where(eq(customers.id, customerId)).get();
    if (!customer) return reply.code(404).send({ error: "Kunde nicht gefunden" });

    const parsed = planBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }

    const now = new Date();
    const row = {
      id: createId("npl"),
      customerId,
      title: parsed.data.title.trim(),
      description: emptyToNull(parsed.data.description),
      diagramJson: parsed.data.diagramJson?.trim() || '{"nodes":[],"edges":[]}',
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(networkPlans).values(row);
    return reply.code(201).send(row);
  });

  app.put("/api/network-plans/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(networkPlans).where(eq(networkPlans.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Netzwerkplan nicht gefunden" });

    const parsed = planBody.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }

    const updated = {
      title: parsed.data.title?.trim() ?? existing.title,
      description:
        parsed.data.description !== undefined
          ? emptyToNull(parsed.data.description)
          : existing.description,
      diagramJson: parsed.data.diagramJson?.trim() || existing.diagramJson,
      updatedAt: new Date(),
    };
    await db.update(networkPlans).set(updated).where(eq(networkPlans.id, id));
    return { ...existing, ...updated };
  });

  app.delete("/api/network-plans/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(networkPlans).where(eq(networkPlans.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Netzwerkplan nicht gefunden" });
    await db.delete(networkPlans).where(eq(networkPlans.id, id));
    return { ok: true };
  });
}
