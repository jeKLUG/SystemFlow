import { asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { appointments, customers } from "../db/schema.js";
import { todayIso } from "../lib/dates.js";
import { createId } from "../lib/id.js";
import { requireAuth } from "../plugins/auth.js";
import { addActivity } from "./activities.js";

const kindEnum = z.enum(["customer", "internal", "personal", "other"]);
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeStr = z
  .string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/)
  .optional()
  .nullable()
  .or(z.literal(""));

const appointmentBody = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(10000).optional().or(z.literal("")),
  kind: kindEnum.optional(),
  customerId: z.string().optional().nullable().or(z.literal("")),
  startDate: dateStr,
  startTime: timeStr,
  endDate: dateStr.optional().nullable().or(z.literal("")),
  endTime: timeStr,
  allDay: z.boolean().optional(),
  location: z.string().max(500).optional().or(z.literal("")),
});

function emptyToNull(value: string | null | undefined) {
  if (!value || !value.trim()) return null;
  return value.trim();
}

/**
 * Normalisiert Kind/Kunde: Kundentermin braucht customerId.
 */
async function normalizeAppointment(
  db: Db,
  data: z.infer<typeof appointmentBody>,
): Promise<
  | { ok: true; kind: z.infer<typeof kindEnum>; customerId: string | null }
  | { ok: false; error: string }
> {
  const customerId = emptyToNull(data.customerId);
  let kind = data.kind ?? (customerId ? "customer" : "other");

  if (customerId) {
    const customer = await db.select().from(customers).where(eq(customers.id, customerId)).get();
    if (!customer) return { ok: false, error: "Kunde nicht gefunden" };
    if (kind !== "customer") kind = "customer";
  } else if (kind === "customer") {
    return { ok: false, error: "Kundentermin braucht einen Kunden" };
  }

  return { ok: true, kind, customerId };
}

/**
 * Registriert Termin-/Kalender-Routen.
 */
export async function appointmentRoutes(app: FastifyInstance, db: Db) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/appointments", async (request) => {
    const q = z
      .object({
        from: dateStr.optional(),
        to: dateStr.optional(),
        customerId: z.string().optional(),
        kind: kindEnum.optional(),
        upcoming: z.coerce.boolean().optional(),
        limit: z.coerce.number().int().positive().max(500).optional(),
      })
      .parse(request.query);

    const today = todayIso();
    const from = q.from ?? (q.upcoming ? today : undefined);
    const to = q.to;

    let rows = await db
      .select({
        id: appointments.id,
        title: appointments.title,
        description: appointments.description,
        kind: appointments.kind,
        customerId: appointments.customerId,
        customerName: customers.name,
        customerCompany: customers.company,
        startDate: appointments.startDate,
        startTime: appointments.startTime,
        endDate: appointments.endDate,
        endTime: appointments.endTime,
        allDay: appointments.allDay,
        location: appointments.location,
        createdAt: appointments.createdAt,
        updatedAt: appointments.updatedAt,
      })
      .from(appointments)
      .leftJoin(customers, eq(appointments.customerId, customers.id))
      .orderBy(asc(appointments.startDate), asc(appointments.startTime))
      .limit(q.limit ?? 300)
      .all();

    if (from) {
      rows = rows.filter((r) => {
        const end = r.endDate || r.startDate;
        return end >= from;
      });
    }
    if (to) {
      rows = rows.filter((r) => r.startDate <= to);
    }
    if (q.customerId) rows = rows.filter((r) => r.customerId === q.customerId);
    if (q.kind) rows = rows.filter((r) => r.kind === q.kind);

    return rows;
  });

  app.get("/api/customers/:customerId/appointments", async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    const customer = await db.select().from(customers).where(eq(customers.id, customerId)).get();
    if (!customer) return reply.code(404).send({ error: "Kunde nicht gefunden" });

    return await db
      .select({
        id: appointments.id,
        title: appointments.title,
        description: appointments.description,
        kind: appointments.kind,
        customerId: appointments.customerId,
        customerName: customers.name,
        customerCompany: customers.company,
        startDate: appointments.startDate,
        startTime: appointments.startTime,
        endDate: appointments.endDate,
        endTime: appointments.endTime,
        allDay: appointments.allDay,
        location: appointments.location,
        createdAt: appointments.createdAt,
        updatedAt: appointments.updatedAt,
      })
      .from(appointments)
      .leftJoin(customers, eq(appointments.customerId, customers.id))
      .where(eq(appointments.customerId, customerId))
      .orderBy(asc(appointments.startDate), asc(appointments.startTime))
      .all();
  });

  app.get("/api/appointments/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await db
      .select({
        id: appointments.id,
        title: appointments.title,
        description: appointments.description,
        kind: appointments.kind,
        customerId: appointments.customerId,
        customerName: customers.name,
        customerCompany: customers.company,
        startDate: appointments.startDate,
        startTime: appointments.startTime,
        endDate: appointments.endDate,
        endTime: appointments.endTime,
        allDay: appointments.allDay,
        location: appointments.location,
        createdAt: appointments.createdAt,
        updatedAt: appointments.updatedAt,
      })
      .from(appointments)
      .leftJoin(customers, eq(appointments.customerId, customers.id))
      .where(eq(appointments.id, id))
      .get();
    if (!row) return reply.code(404).send({ error: "Termin nicht gefunden" });
    return row;
  });

  app.post("/api/appointments", async (request, reply) => {
    const parsed = appointmentBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }

    const normalized = await normalizeAppointment(db, parsed.data);
    if (!normalized.ok) return reply.code(400).send({ error: normalized.error });

    const allDay = parsed.data.allDay ?? !parsed.data.startTime;
    const now = new Date();
    const row = {
      id: createId("apt"),
      title: parsed.data.title.trim(),
      description: emptyToNull(parsed.data.description),
      kind: normalized.kind,
      customerId: normalized.customerId,
      startDate: parsed.data.startDate,
      startTime: allDay ? null : emptyToNull(parsed.data.startTime),
      endDate: emptyToNull(parsed.data.endDate) ?? parsed.data.startDate,
      endTime: allDay ? null : emptyToNull(parsed.data.endTime),
      allDay,
      location: emptyToNull(parsed.data.location),
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(appointments).values(row);

    if (normalized.customerId) {
      await addActivity(
        db,
        normalized.customerId,
        `Termin: ${row.title}`,
        `${row.startDate}${row.startTime ? ` ${row.startTime}` : ""}`,
        now,
      );
    }

    return reply.code(201).send(row);
  });

  app.put("/api/appointments/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(appointments).where(eq(appointments.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Termin nicht gefunden" });

    const parsed = appointmentBody.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }

    const merged = {
      title: parsed.data.title ?? existing.title,
      description:
        parsed.data.description !== undefined
          ? (parsed.data.description ?? "")
          : (existing.description ?? ""),
      kind: parsed.data.kind ?? existing.kind,
      customerId:
        parsed.data.customerId !== undefined
          ? (parsed.data.customerId ?? "")
          : (existing.customerId ?? ""),
      startDate: parsed.data.startDate ?? existing.startDate,
      startTime:
        parsed.data.startTime !== undefined
          ? (parsed.data.startTime ?? "")
          : (existing.startTime ?? ""),
      endDate:
        parsed.data.endDate !== undefined ? (parsed.data.endDate ?? "") : (existing.endDate ?? ""),
      endTime:
        parsed.data.endTime !== undefined ? (parsed.data.endTime ?? "") : (existing.endTime ?? ""),
      allDay: parsed.data.allDay ?? existing.allDay,
      location:
        parsed.data.location !== undefined
          ? (parsed.data.location ?? "")
          : (existing.location ?? ""),
    };

    const normalized = await normalizeAppointment(db, merged);
    if (!normalized.ok) return reply.code(400).send({ error: normalized.error });

    const allDay = merged.allDay ?? !merged.startTime;
    const updated = {
      title: merged.title.trim(),
      description: emptyToNull(merged.description),
      kind: normalized.kind,
      customerId: normalized.customerId,
      startDate: merged.startDate,
      startTime: allDay ? null : emptyToNull(merged.startTime),
      endDate: emptyToNull(merged.endDate) ?? merged.startDate,
      endTime: allDay ? null : emptyToNull(merged.endTime),
      allDay,
      location: emptyToNull(merged.location),
      updatedAt: new Date(),
    };

    await db.update(appointments).set(updated).where(eq(appointments.id, id));
    return { ...existing, ...updated };
  });

  app.delete("/api/appointments/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(appointments).where(eq(appointments.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Termin nicht gefunden" });
    await db.delete(appointments).where(eq(appointments.id, id));
    return { ok: true };
  });
}
