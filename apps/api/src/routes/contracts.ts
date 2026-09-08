import { desc, eq, like } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { contractStatuses, contracts, customers } from "../db/schema.js";
import { buildContractPdf } from "../lib/contract-pdf.js";
import { createId } from "../lib/id.js";
import { requireAuth } from "../plugins/auth.js";

const optionalText = (max: number) => z.string().max(max).optional().or(z.literal(""));
const optionalHours = z.coerce.number().positive().max(8760).optional().nullable();

const contractBody = z
  .object({
    title: z.string().min(1).max(300),
    contractNumber: optionalText(80),
    status: z.enum(contractStatuses).optional(),
    description: optionalText(5000),
    startDate: optionalText(40),
    endDate: optionalText(40),
    coverageHours: optionalText(200),
    coverageNote: optionalText(1000),
    includedHoursMonth: z.coerce.number().nonnegative().max(10000).optional().nullable(),
    priceMonthly: z.coerce.number().nonnegative().max(1_000_000).optional().nullable(),
    priceYearly: z.coerce.number().nonnegative().max(10_000_000).optional().nullable(),
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
  })
  .superRefine((data, ctx) => {
    const monthly = data.priceMonthly != null && !Number.isNaN(data.priceMonthly);
    const yearly = data.priceYearly != null && !Number.isNaN(data.priceYearly);
    if (monthly && yearly) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Nur monatlicher oder jährlicher Preis, nicht beides",
        path: ["priceYearly"],
      });
    }
  });

function emptyToNull(value: string | undefined): string | null {
  const t = value?.trim();
  return t ? t : null;
}

function hoursOrNull(value: number | null | undefined): number | null {
  return value == null || Number.isNaN(value) ? null : value;
}

/**
 * Nächste freie Vertragsnummer im Format `SLA-YYYY-NNN`.
 */
async function nextContractNumber(db: Db): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `SLA-${year}-`;
  const rows = await db
    .select({ contractNumber: contracts.contractNumber })
    .from(contracts)
    .where(like(contracts.contractNumber, `${prefix}%`))
    .all();

  let max = 0;
  for (const row of rows) {
    const raw = row.contractNumber ?? "";
    const seq = Number(raw.slice(prefix.length));
    if (Number.isFinite(seq) && seq > max) max = seq;
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
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

  const priceMonthly = hoursOrNull(data.priceMonthly);
  const priceYearly = hoursOrNull(data.priceYearly);

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
    priceMonthly: priceMonthly != null ? priceMonthly : null,
    priceYearly: priceMonthly != null ? null : priceYearly,
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

    const fields = mapContractFields(parsed.data);
    const now = new Date();
    const row = {
      id: createId("ctr"),
      customerId,
      ...fields,
      contractNumber: fields.contractNumber ?? (await nextContractNumber(db)),
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(contracts).values(row);
    return reply.code(201).send(row);
  });

  /** Einzelnen SLA-/Vertrag als PDF. */
  app.get("/api/contracts/:id/pdf", async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await db.select().from(contracts).where(eq(contracts.id, id)).get();
    if (!row) return reply.code(404).send({ error: "Vertrag nicht gefunden" });

    const customer = await db
      .select()
      .from(customers)
      .where(eq(customers.id, row.customerId))
      .get();
    if (!customer) return reply.code(404).send({ error: "Kunde nicht gefunden" });

    const buffer = await buildContractPdf(customer, row);
    const base = (row.contractNumber || row.title)
      .replace(/[^\w\-äöüÄÖÜß]+/gi, "_")
      .replace(/_+/g, "_")
      .slice(0, 80);
    return reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `attachment; filename="SLA_${base || "Vertrag"}.pdf"`)
      .send(buffer);
  });

  app.put("/api/contracts/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(contracts).where(eq(contracts.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Vertrag nicht gefunden" });

    const parsed = contractBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }

    const fields = mapContractFields({
      ...parsed.data,
      status: parsed.data.status ?? existing.status,
    });
    const updated = {
      ...fields,
      contractNumber:
        fields.contractNumber ?? existing.contractNumber ?? (await nextContractNumber(db)),
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
