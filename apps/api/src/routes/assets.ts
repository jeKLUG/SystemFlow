import { desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { assets, customers, networkSegments } from "../db/schema.js";
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
  segmentId: z.string().optional().nullable().or(z.literal("")),
  role: z.string().max(200).optional().or(z.literal("")),
  manufacturer: z.string().max(200).optional().or(z.literal("")),
  model: z.string().max(200).optional().or(z.literal("")),
  serialNumber: z.string().max(200).optional().or(z.literal("")),
  hostname: z.string().max(200).optional().or(z.literal("")),
  ipAddress: z.string().max(80).optional().or(z.literal("")),
  secondaryIp: z.string().max(80).optional().or(z.literal("")),
  macAddress: z.string().max(80).optional().or(z.literal("")),
  location: z.string().max(200).optional().or(z.literal("")),
  rack: z.string().max(120).optional().or(z.literal("")),
  vlan: z.string().max(80).optional().or(z.literal("")),
  os: z.string().max(200).optional().or(z.literal("")),
  firmware: z.string().max(200).optional().or(z.literal("")),
  cpu: z.string().max(200).optional().or(z.literal("")),
  ramGb: z.union([z.number(), z.string()]).optional().nullable(),
  diskGb: z.union([z.number(), z.string()]).optional().nullable(),
  ports: z.string().max(200).optional().or(z.literal("")),
  managementUrl: z.string().max(500).optional().or(z.literal("")),
  purchaseDate: z.string().max(40).optional().or(z.literal("")),
  installedAt: z.string().max(40).optional().or(z.literal("")),
  responsiblePerson: z.string().max(200).optional().or(z.literal("")),
  warrantyUntil: z.string().max(40).optional().or(z.literal("")),
  notes: z.string().max(10000).optional().or(z.literal("")),
});

function emptyToNull(value: string | null | undefined) {
  if (!value || !value.trim()) return null;
  return value.trim();
}

function toNumberOrNull(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapAssetFields(
  data: z.infer<typeof assetBody>,
  existing?: { kind: string; status: string; segmentId: string | null },
) {
  return {
    name: data.name.trim(),
    kind: data.kind ?? (existing?.kind as z.infer<typeof kindEnum> | undefined) ?? ("other" as const),
    status:
      data.status ??
      (existing?.status as z.infer<typeof statusEnum> | undefined) ??
      ("active" as const),
    segmentId:
      data.segmentId !== undefined ? emptyToNull(data.segmentId) : (existing?.segmentId ?? null),
    role: emptyToNull(data.role),
    manufacturer: emptyToNull(data.manufacturer),
    model: emptyToNull(data.model),
    serialNumber: emptyToNull(data.serialNumber),
    hostname: emptyToNull(data.hostname),
    ipAddress: emptyToNull(data.ipAddress),
    secondaryIp: emptyToNull(data.secondaryIp),
    macAddress: emptyToNull(data.macAddress),
    location: emptyToNull(data.location),
    rack: emptyToNull(data.rack),
    vlan: emptyToNull(data.vlan),
    os: emptyToNull(data.os),
    firmware: emptyToNull(data.firmware),
    cpu: emptyToNull(data.cpu),
    ramGb: toNumberOrNull(data.ramGb),
    diskGb: toNumberOrNull(data.diskGb),
    ports: emptyToNull(data.ports),
    managementUrl: emptyToNull(data.managementUrl),
    purchaseDate: emptyToNull(data.purchaseDate),
    installedAt: emptyToNull(data.installedAt),
    responsiblePerson: emptyToNull(data.responsiblePerson),
    warrantyUntil: emptyToNull(data.warrantyUntil),
    notes: emptyToNull(data.notes),
  };
}

/**
 * Geräte- & Netzwerk-Inventar pro Kunde.
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

  app.get("/api/assets/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await db.select().from(assets).where(eq(assets.id, id)).get();
    if (!row) return reply.code(404).send({ error: "Gerät nicht gefunden" });
    return row;
  });

  app.post("/api/customers/:customerId/assets", async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    const customer = await db.select().from(customers).where(eq(customers.id, customerId)).get();
    if (!customer) return reply.code(404).send({ error: "Kunde nicht gefunden" });

    const parsed = assetBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }

    const fields = mapAssetFields(parsed.data);
    if (fields.segmentId) {
      const seg = await db
        .select()
        .from(networkSegments)
        .where(eq(networkSegments.id, fields.segmentId))
        .get();
      if (!seg || seg.customerId !== customerId) {
        return reply.code(400).send({ error: "Netzsegment nicht gefunden" });
      }
    }

    const now = new Date();
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
      `Gerät hinzugefügt: ${row.name}`,
      [row.kind, row.ipAddress, row.hostname].filter(Boolean).join(" · ") || null,
    );
    return reply.code(201).send(row);
  });

  app.put("/api/assets/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(assets).where(eq(assets.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Gerät nicht gefunden" });

    const parsed = assetBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }

    const fields = mapAssetFields(parsed.data, existing);
    if (fields.segmentId) {
      const seg = await db
        .select()
        .from(networkSegments)
        .where(eq(networkSegments.id, fields.segmentId))
        .get();
      if (!seg || seg.customerId !== existing.customerId) {
        return reply.code(400).send({ error: "Netzsegment nicht gefunden" });
      }
    }

    const updated = { ...fields, updatedAt: new Date() };
    await db.update(assets).set(updated).where(eq(assets.id, id));
    return { ...existing, ...updated };
  });

  app.delete("/api/assets/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(assets).where(eq(assets.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Gerät nicht gefunden" });
    await db.delete(assets).where(eq(assets.id, id));
    return { ok: true };
  });
}
