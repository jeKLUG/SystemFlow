import { desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { contractStatuses, contracts, customers } from "../db/schema.js";
import { createId } from "../lib/id.js";
import { requireAuth } from "../plugins/auth.js";

const optionalText = (max: number) => z.string().max(max).optional().or(z.literal(""));
const optionalHours = z.coerce.number().positive().max(8760).optional().nullable();

const contractBody = z.object({
  title: z.string().min(1).max(300),
  contractNumber: optionalText(80),
  status: z.enum(contractStatuses).optional(),
  description: optionalText(5000),
  startDate: optionalText(40),
  endDate: optionalText(40),
  coverageHours: optionalText(200),
  coverageNote: optionalText(1000),
  includedHoursMonth: z.coerce.number().nonnegative().max(10000).optional().nullable(),
  /** Legacy-Feld; wird aus responseNormalHours abgeleitet, wenn gesetzt. */
  slaResponseHours: z.coerce.number().int().positive().max(8760).optional().nullable(),
  responseCriticalHours: optionalHours,
  responseHighHours: optionalHours,
  responseNormalHours: optionalHours,
  responseLowHours: optionalHours,
  resolveCriticalHours: optionalHours,
  resolveHighHours: optionalHours,
  resolveNormalHours: optionalHours,
  resolveLowHours: optionalHours,
  onsiteHours: optionalHours,
  contactPerson: optionalText(200),
  contactPhone: optionalText(80),
  contactEmail: optionalText(200),
  escalationContact: optionalText(200),
  escalationPhone: optionalText(80),
  escalationEmail: optionalText(200),
  notes: optionalText(5000),
});

function emptyToNull(value: string | undefined): string | null {
  const t = value?.trim();
  return t ? t : null;
}

function hoursOrNull(value: number | null | undefined): number | null {
  return value == null || Number.isNaN(value) ? null : value;
}

/**
 * Mappt Request-Body auf Vertrags-/SLA-Felder inkl. Legacy-Sync.
 */
function mapContractFields(data: z.infer<typeof contractBody>) {
  const responseNormal =
    hoursOrNull(data.responseNormalHours) ??
    hoursOrNull(data.slaResponseHours);

  const slaLegacy =
    responseNormal != null ? Math.max(1, Math.round(responseNormal)) : hoursOrNull(data.slaResponseHours);

  return {
    title: data.title.trim(),
    contractNumber: emptyToNull(data.contractNumber),
    status: data.status ?? "active",
    description: emptyToNull(data.description),
    startDate: emptyToNull(data.startDate),
    endDate: emptyToNull(data.endDate),
    coverageHours: emptyToNull(data.coverageHours),
    coverageNote: emptyToNull(data.coverageNote),
    includedHoursMonth: hoursOrNull(data.includedHoursMonth),
    slaResponseHours: slaLegacy,
    responseCriticalHours: hoursOrNull(data.responseCriticalHours),
    responseHighHours: hoursOrNull(data.responseHighHours),
    responseNormalHours: responseNormal,
    responseLowHours: hoursOrNull(data.responseLowHours),
    resolveCriticalHours: hoursOrNull(data.resolveCriticalHours),
    resolveHighHours: hoursOrNull(data.resolveHighHours),
    resolveNormalHours: hoursOrNull(data.resolveNormalHours),
    resolveLowHours: hoursOrNull(data.resolveLowHours),
    onsiteHours: hoursOrNull(data.onsiteHours),
    contactPerson: emptyToNull(data.contactPerson),
    contactPhone: emptyToNull(data.contactPhone),
    contactEmail: emptyToNull(data.contactEmail),
    escalationContact: emptyToNull(data.escalationContact),
    escalationPhone: emptyToNull(data.escalationPhone),
    escalationEmail: emptyToNull(data.escalationEmail),
    notes: emptyToNull(data.notes),
  };
}

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
      ...mapContractFields(parsed.data),
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
      ...mapContractFields({ ...parsed.data, status: parsed.data.status ?? existing.status }),
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
