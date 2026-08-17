import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { customers, priceItems, projects, timeEntries } from "../db/schema.js";
import { createId } from "../lib/id.js";
import { hoursFromRange } from "../lib/time.js";
import { requireAuth } from "../plugins/auth.js";
import { addActivity } from "./activities.js";
import { resolveHourlyRate } from "./pricing.js";

const timeStr = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Uhrzeit als HH:mm");

const entryBody = z
  .object({
    workDate: z.string().min(1).max(40),
    startTime: timeStr.optional(),
    endTime: timeStr.optional(),
    hours: z.number().positive().max(24).optional(),
    /** Laufende Stempeluhr: nur Startzeit, Stunden = 0 bis Ausstempeln. */
    running: z.boolean().optional(),
    description: z.string().max(5000).optional().or(z.literal("")),
    projectId: z.string().optional().nullable().or(z.literal("")),
    priceItemId: z.string().optional().nullable().or(z.literal("")),
    billable: z.boolean().optional(),
    billed: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.running) {
      if (!data.startTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Startzeit für Einstempeln erforderlich",
          path: ["startTime"],
        });
      }
      return;
    }
    const hasStart = Boolean(data.startTime);
    const hasEnd = Boolean(data.endTime);
    if (hasStart !== hasEnd) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Start- und Endzeit gemeinsam angeben",
        path: hasStart ? ["endTime"] : ["startTime"],
      });
      return;
    }
    if (hasStart && hasEnd) {
      if (hoursFromRange(data.startTime!, data.endTime!) == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Ungültiger Zeitraum",
          path: ["endTime"],
        });
      }
      return;
    }
    if (data.hours == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Start-/Endzeit oder Stunden erforderlich",
        path: ["startTime"],
      });
    }
  });

function emptyToNull(value: string | null | undefined) {
  if (!value || !value.trim()) return null;
  return value.trim();
}

function resolveHours(data: {
  startTime?: string | null;
  endTime?: string | null;
  hours?: number;
  running?: boolean;
}): { hours: number; startTime: string | null; endTime: string | null } | null {
  const start = data.startTime || undefined;
  const end = data.endTime || undefined;

  if (data.running && start && !end) {
    return { hours: 0, startTime: start, endTime: null };
  }
  if (start && end) {
    const hours = hoursFromRange(start, end);
    if (hours == null) return null;
    return { hours, startTime: start, endTime: end };
  }
  if (start && !end) {
    // Laufender Eintrag beibehalten
    return { hours: data.hours ?? 0, startTime: start, endTime: null };
  }
  if (data.hours != null && data.hours > 0) {
    return { hours: data.hours, startTime: null, endTime: null };
  }
  return null;
}

function amountFrom(hours: number, rate: number | null, billable: boolean) {
  if (!billable || rate == null) return { rateSnapshot: rate, amountSnapshot: null as number | null };
  return {
    rateSnapshot: rate,
    amountSnapshot: Math.round(hours * rate * 100) / 100,
  };
}

/**
 * Registriert Zeiterfassungs-Routen pro Kunde.
 */
export async function timeEntryRoutes(app: FastifyInstance, db: Db) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/customers/:customerId/time-entries", async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    const customer = await db.select().from(customers).where(eq(customers.id, customerId)).get();
    if (!customer) return reply.code(404).send({ error: "Kunde nicht gefunden" });

    const q = z
      .object({
        projectId: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
      })
      .parse(request.query);

    const rows = await db
      .select({
        id: timeEntries.id,
        customerId: timeEntries.customerId,
        projectId: timeEntries.projectId,
        projectName: projects.name,
        priceItemId: timeEntries.priceItemId,
        priceItemName: priceItems.name,
        workDate: timeEntries.workDate,
        startTime: timeEntries.startTime,
        endTime: timeEntries.endTime,
        hours: timeEntries.hours,
        description: timeEntries.description,
        billable: timeEntries.billable,
        billed: timeEntries.billed,
        rateSnapshot: timeEntries.rateSnapshot,
        amountSnapshot: timeEntries.amountSnapshot,
        createdAt: timeEntries.createdAt,
        updatedAt: timeEntries.updatedAt,
      })
      .from(timeEntries)
      .leftJoin(projects, eq(timeEntries.projectId, projects.id))
      .leftJoin(priceItems, eq(timeEntries.priceItemId, priceItems.id))
      .where(eq(timeEntries.customerId, customerId))
      .orderBy(desc(timeEntries.workDate), desc(timeEntries.createdAt))
      .all();

    let filtered = rows;
    if (q.projectId) filtered = filtered.filter((r) => r.projectId === q.projectId);
    if (q.from) filtered = filtered.filter((r) => r.workDate >= q.from!);
    if (q.to) filtered = filtered.filter((r) => r.workDate <= q.to!);

    const totalHours = filtered.reduce((sum, r) => sum + (Number(r.hours) || 0), 0);
    const billableHours = filtered
      .filter((r) => r.billable)
      .reduce((sum, r) => sum + (Number(r.hours) || 0), 0);
    const billableAmount = filtered
      .filter((r) => r.billable && r.amountSnapshot != null)
      .reduce((sum, r) => sum + (Number(r.amountSnapshot) || 0), 0);
    const unbilledHours = filtered
      .filter((r) => r.billable && !r.billed)
      .reduce((sum, r) => sum + (Number(r.hours) || 0), 0);
    const unbilledAmount = filtered
      .filter((r) => r.billable && !r.billed && r.amountSnapshot != null)
      .reduce((sum, r) => sum + (Number(r.amountSnapshot) || 0), 0);

    return {
      entries: filtered,
      summary: {
        totalHours: Math.round(totalHours * 100) / 100,
        billableHours: Math.round(billableHours * 100) / 100,
        billableAmount: Math.round(billableAmount * 100) / 100,
        unbilledHours: Math.round(unbilledHours * 100) / 100,
        unbilledAmount: Math.round(unbilledAmount * 100) / 100,
        entryCount: filtered.length,
      },
    };
  });

  app.get("/api/customers/:customerId/time-summary", async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    const customer = await db.select().from(customers).where(eq(customers.id, customerId)).get();
    if (!customer) return reply.code(404).send({ error: "Kunde nicht gefunden" });

    const totals = await db
      .select({
        totalHours: sql<number>`coalesce(sum(${timeEntries.hours}), 0)`,
        billableHours: sql<number>`coalesce(sum(case when ${timeEntries.billable} = 1 then ${timeEntries.hours} else 0 end), 0)`,
        entryCount: sql<number>`count(*)`,
      })
      .from(timeEntries)
      .where(eq(timeEntries.customerId, customerId))
      .get();

    return {
      totalHours: Math.round(Number(totals?.totalHours ?? 0) * 100) / 100,
      billableHours: Math.round(Number(totals?.billableHours ?? 0) * 100) / 100,
      entryCount: Number(totals?.entryCount ?? 0),
    };
  });

  app.post("/api/customers/:customerId/time-entries", async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    const customer = await db.select().from(customers).where(eq(customers.id, customerId)).get();
    if (!customer) return reply.code(404).send({ error: "Kunde nicht gefunden" });

    const parsed = entryBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }

    const resolved = resolveHours(parsed.data);
    if (!resolved) {
      return reply.code(400).send({ error: "Ungültiger Zeitraum" });
    }

    // Nur ein laufender Timer pro Kunde
    if (parsed.data.running) {
      const open = await db
        .select({ id: timeEntries.id })
        .from(timeEntries)
        .where(
          and(
            eq(timeEntries.customerId, customerId),
            isNotNull(timeEntries.startTime),
            isNull(timeEntries.endTime),
          ),
        )
        .get();
      if (open) {
        return reply
          .code(409)
          .send({ error: "Es läuft bereits eine Stempeluhr für diesen Kunden", runningId: open.id });
      }
    }

    const projectId = emptyToNull(parsed.data.projectId);
    if (projectId) {
      const project = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.customerId, customerId)))
        .get();
      if (!project) return reply.code(400).send({ error: "Projekt gehört nicht zu diesem Kunden" });
    }

    const priceItemId = emptyToNull(parsed.data.priceItemId);
    const { rate, priceItemId: resolvedPriceId } = await resolveHourlyRate(db, {
      priceItemId,
      projectId,
    });
    const billable = parsed.data.billable ?? true;
    const billed = parsed.data.billed ?? false;
    const money = amountFrom(resolved.hours, rate, billable);

    const now = new Date();
    const row = {
      id: createId("time"),
      customerId,
      projectId,
      priceItemId: resolvedPriceId,
      workDate: parsed.data.workDate,
      startTime: resolved.startTime,
      endTime: resolved.endTime,
      hours: resolved.hours,
      description: emptyToNull(parsed.data.description),
      billable,
      billed,
      rateSnapshot: money.rateSnapshot,
      amountSnapshot: money.amountSnapshot,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(timeEntries).values(row);
    await addActivity(
      db,
      customerId,
      parsed.data.running
        ? `Eingestempelt um ${resolved.startTime}`
        : `Zeit erfasst: ${resolved.hours}h (${
            resolved.startTime && resolved.endTime
              ? `${resolved.startTime}–${resolved.endTime}`
              : `${resolved.hours}h`
          }) am ${row.workDate}`,
      row.description,
      now,
    );
    return reply.code(201).send(row);
  });

  /**
   * Einstempeln: startet laufenden Zeiteintrag (startTime jetzt, endTime leer).
   */
  app.post("/api/customers/:customerId/time-clock/in", async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    const customer = await db.select().from(customers).where(eq(customers.id, customerId)).get();
    if (!customer) return reply.code(404).send({ error: "Kunde nicht gefunden" });

    const body = z
      .object({
        startTime: timeStr.optional(),
        workDate: z.string().min(1).max(40).optional(),
        description: z.string().max(5000).optional().or(z.literal("")),
        projectId: z.string().optional().nullable().or(z.literal("")),
        priceItemId: z.string().optional().nullable().or(z.literal("")),
        billable: z.boolean().optional(),
      })
      .parse(request.body ?? {});

    const open = await db
      .select()
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.customerId, customerId),
          isNotNull(timeEntries.startTime),
          isNull(timeEntries.endTime),
        ),
      )
      .get();
    if (open) {
      return reply.code(409).send({ error: "Stempeluhr läuft bereits", entry: open });
    }

    const now = new Date();
    const startTime =
      body.startTime ??
      `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const workDate =
      body.workDate ??
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    const projectId = emptyToNull(body.projectId);
    if (projectId) {
      const project = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.customerId, customerId)))
        .get();
      if (!project) return reply.code(400).send({ error: "Projekt gehört nicht zu diesem Kunden" });
    }

    const priceItemId = emptyToNull(body.priceItemId);
    const { rate, priceItemId: resolvedPriceId } = await resolveHourlyRate(db, {
      priceItemId,
      projectId,
    });
    const billable = body.billable ?? true;

    const row = {
      id: createId("time"),
      customerId,
      projectId,
      priceItemId: resolvedPriceId,
      workDate,
      startTime,
      endTime: null as string | null,
      hours: 0,
      description: emptyToNull(body.description),
      billable,
      billed: false,
      rateSnapshot: billable ? rate : null,
      amountSnapshot: null as number | null,
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(timeEntries).values(row);
    await addActivity(db, customerId, `Eingestempelt um ${startTime}`, row.description, now);
    return reply.code(201).send(row);
  });

  /**
   * Ausstempeln: setzt Endzeit und berechnet Stunden.
   */
  app.post("/api/customers/:customerId/time-clock/out", async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    const customer = await db.select().from(customers).where(eq(customers.id, customerId)).get();
    if (!customer) return reply.code(404).send({ error: "Kunde nicht gefunden" });

    const body = z
      .object({
        endTime: timeStr.optional(),
        description: z.string().max(5000).optional().or(z.literal("")),
        entryId: z.string().optional(),
      })
      .parse(request.body ?? {});

    const open = body.entryId
      ? await db.select().from(timeEntries).where(eq(timeEntries.id, body.entryId)).get()
      : await db
          .select()
          .from(timeEntries)
          .where(
            and(
              eq(timeEntries.customerId, customerId),
              isNotNull(timeEntries.startTime),
              isNull(timeEntries.endTime),
            ),
          )
          .get();

    if (!open || open.customerId !== customerId || !open.startTime || open.endTime) {
      return reply.code(404).send({ error: "Keine laufende Stempeluhr gefunden" });
    }

    const now = new Date();
    const endTime =
      body.endTime ??
      `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const hours = hoursFromRange(open.startTime, endTime);
    if (hours == null) {
      return reply.code(400).send({ error: "Ungültiger Zeitraum beim Ausstempeln" });
    }

    const billable = open.billable;
    const money = amountFrom(hours, open.rateSnapshot, billable);
    const description =
      body.description !== undefined ? emptyToNull(body.description) : open.description;

    const updated = {
      endTime,
      hours,
      description,
      rateSnapshot: money.rateSnapshot,
      amountSnapshot: money.amountSnapshot,
      updatedAt: now,
    };
    await db.update(timeEntries).set(updated).where(eq(timeEntries.id, open.id));
    await addActivity(
      db,
      customerId,
      `Ausgestempelt: ${hours}h (${open.startTime}–${endTime})`,
      description,
      now,
    );
    return { ...open, ...updated };
  });

  app.put("/api/time-entries/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(timeEntries).where(eq(timeEntries.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Zeiteintrag nicht gefunden" });

    const updateBody = z.object({
      workDate: z.string().min(1).max(40).optional(),
      startTime: timeStr.optional().nullable(),
      endTime: timeStr.optional().nullable(),
      hours: z.number().min(0.01).max(24).optional(),
      description: z.string().max(5000).optional().or(z.literal("")),
      projectId: z.string().optional().nullable().or(z.literal("")),
      priceItemId: z.string().optional().nullable().or(z.literal("")),
      billable: z.boolean().optional(),
      billed: z.boolean().optional(),
    });

    const parsed = updateBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }

    let projectId = existing.projectId;
    if (parsed.data.projectId !== undefined) {
      projectId = emptyToNull(parsed.data.projectId);
      if (projectId) {
        const project = await db
          .select()
          .from(projects)
          .where(and(eq(projects.id, projectId), eq(projects.customerId, existing.customerId)))
          .get();
        if (!project) {
          return reply.code(400).send({ error: "Projekt gehört nicht zu diesem Kunden" });
        }
      }
    }

    const startTime =
      parsed.data.startTime !== undefined ? parsed.data.startTime : existing.startTime;
    const endTime = parsed.data.endTime !== undefined ? parsed.data.endTime : existing.endTime;

    // Explizite Stunden ohne Zeiten → nur Stunden speichern
    const hoursOnly =
      parsed.data.hours != null &&
      parsed.data.startTime === null &&
      parsed.data.endTime === null;

    const resolved = hoursOnly
      ? { hours: parsed.data.hours!, startTime: null, endTime: null }
      : resolveHours({
          startTime,
          endTime,
          hours: parsed.data.hours ?? existing.hours,
          running: Boolean(startTime && !endTime),
        });
    if (!resolved) {
      return reply.code(400).send({ error: "Ungültiger Zeitraum" });
    }

    const priceItemId =
      parsed.data.priceItemId !== undefined
        ? emptyToNull(parsed.data.priceItemId)
        : existing.priceItemId;
    const billable = parsed.data.billable ?? existing.billable;
    const billed = parsed.data.billed ?? existing.billed;
    const { rate, priceItemId: resolvedPriceId } = await resolveHourlyRate(db, {
      priceItemId,
      projectId,
    });
    const money = amountFrom(resolved.hours, rate, billable);

    const updated = {
      workDate: parsed.data.workDate ?? existing.workDate,
      startTime: resolved.startTime,
      endTime: resolved.endTime,
      hours: resolved.hours,
      description:
        parsed.data.description !== undefined
          ? emptyToNull(parsed.data.description)
          : existing.description,
      projectId,
      priceItemId: resolvedPriceId,
      billable,
      billed,
      rateSnapshot: money.rateSnapshot,
      amountSnapshot: money.amountSnapshot,
      updatedAt: new Date(),
    };

    await db.update(timeEntries).set(updated).where(eq(timeEntries.id, id));
    return { ...existing, ...updated };
  });

  app.delete("/api/time-entries/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(timeEntries).where(eq(timeEntries.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Zeiteintrag nicht gefunden" });
    await db.delete(timeEntries).where(eq(timeEntries.id, id));
    return { ok: true };
  });
}
