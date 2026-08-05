import { desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { assets, customers } from "../db/schema.js";
import { createId } from "../lib/id.js";
import { requireAuth } from "../plugins/auth.js";
import { addActivity } from "./activities.js";

const kindEnum = z.enum([
  "pc",
  "laptop",
  "server",
  "firewall",
  "switch",
  "router",
  "access_point",
  "printer",
  "nas",
  "ups",
  "phone",
  "license",
  "network",
  "other",
]);

const statusEnum = z.enum(["active", "spare", "retired"]);

const assetBody = z.object({
  name: z.string().min(1).max(200),
  kind: kindEnum.optional(),
  status: statusEnum.optional(),
  manufacturer: z.string().max(200).optional().or(z.literal("")),
  model: z.string().max(200).optional().or(z.literal("")),
  serialNumber: z.string().max(200).optional().or(z.literal("")),
  hostname: z.string().max(200).optional().or(z.literal("")),
  ipAddress: z.string().max(80).optional().or(z.literal("")),
  macAddress: z.string().max(80).optional().or(z.literal("")),
  location: z.string().max(200).optional().or(z.literal("")),
  vlan: z.string().max(80).optional().or(z.literal("")),
  os: z.string().max(200).optional().or(z.literal("")),
  managementUrl: z.string().max(500).optional().or(z.literal("")),
  warrantyUntil: z.string().max(40).optional().or(z.literal("")),
  notes: z.string().max(5000).optional().or(z.literal("")),
});

function emptyToNull(value: string | null | undefined) {
  if (!value || !value.trim()) return null;
  return value.trim();
}

function mapAssetFields(data: z.infer<typeof assetBody>, existingKind?: string, existingStatus?: string) {
  return {
    name: data.name.trim(),
    kind: data.kind ?? (existingKind as z.infer<typeof kindEnum> | undefined) ?? ("other" as const),
    status:
      data.status ??
      (existingStatus as z.infer<typeof statusEnum> | undefined) ??
      ("active" as const),
    manufacturer: emptyToNull(data.manufacturer),
    model: emptyToNull(data.model),
    serialNumber: emptyToNull(data.serialNumber),
    hostname: emptyToNull(data.hostname),
    ipAddress: emptyToNull(data.ipAddress),
    macAddress: emptyToNull(data.macAddress),
    location: emptyToNull(data.location),
    vlan: emptyToNull(data.vlan),
    os: emptyToNull(data.os),
    managementUrl: emptyToNull(data.managementUrl),
    warrantyUntil: emptyToNull(data.warrantyUntil),
    notes: emptyToNull(data.notes),
  };
}

/**
 * Registriert Anlagen-/Inventar-Routen inkl. Netzwerkfeldern.
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
    const fields = mapAssetFields(parsed.data);
    const row = {
      id: createId("ast"),
      customerId,
      ...fields,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(assets).values(row);
    await addActivity(
      db,
      customerId,
      `Anlage hinzugefügt: ${row.name}`,
      [row.kind, row.ipAddress, row.hostname].filter(Boolean).join(" · ") || null,
    );
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
      ...mapAssetFields(parsed.data, existing.kind, existing.status),
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
