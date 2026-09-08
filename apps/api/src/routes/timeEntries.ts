import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import {
  customers,
  orgSettings,
  priceItems,
  projects,
  timeEntries,
  timeEntryLines,
} from "../db/schema.js";
import { createId } from "../lib/id.js";
import { nowTime, todayIso } from "../lib/dates.js";
import { hoursFromRange } from "../lib/time.js";
import { requireAuth } from "../plugins/auth.js";
import { addActivity } from "./activities.js";
import { resolveHourlyRate } from "./pricing.js";

const timeStr = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Uhrzeit als HH:mm");

/** Virtuelle Positions-IDs für Standard-/Projekt-Stundensatz (kein Katalog-Eintrag). */
export const RATE_LINE_ORG = "__org_hourly__";
export const RATE_LINE_PROJECT = "__project_hourly__";

const SETTINGS_ID = "default";

const lineInput = z.object({
  priceItemId: z.string().min(1),
  quantity: z.number().positive().max(10000).optional(),
});

function isVirtualRateLine(priceItemId: string) {
  return priceItemId === RATE_LINE_ORG || priceItemId === RATE_LINE_PROJECT;
}

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
    /** 1–n Katalog-Positionen (Stunden/Pauschale/Stück). */
    lines: z.array(lineInput).max(20).optional(),
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

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

type BuiltLine = {
  id: string;
  timeEntryId: string;
  priceItemId: string;
  nameSnapshot: string;
  kindSnapshot: "hourly" | "fixed" | "unit";
  unitLabelSnapshot: string | null;
  quantity: number;
  unitPriceSnapshot: number;
  amountSnapshot: number | null;
  sortOrder: number;
};

/**
 * Baut Snapshot-Zeilen aus Katalog- und virtuellen Stundensatz-Positionen.
 * Virtuelle IDs: `__org_hourly__` (Standard), `__project_hourly__` (Projekt).
 */
async function buildCatalogLines(
  db: Db,
  timeEntryId: string,
  input: { priceItemId: string; quantity?: number }[],
  entryHours: number,
  billable: boolean,
  projectId: string | null,
): Promise<{
  lines: BuiltLine[];
  amountSnapshot: number | null;
  rateSnapshot: number | null;
  priceItemId: string | null;
}> {
  const catalogIds = [
    ...new Set(input.map((l) => l.priceItemId).filter((id) => !isVirtualRateLine(id))),
  ];
  const items =
    catalogIds.length > 0
      ? await db.select().from(priceItems).where(inArray(priceItems.id, catalogIds)).all()
      : [];
  const map = new Map(items.map((i) => [i.id, i]));

  let orgRate: number | null | undefined;
  let projectRate: number | null | undefined;
  let projectName: string | undefined;

  async function resolveOrgRate() {
    if (orgRate !== undefined) return orgRate;
    const settings = await db
      .select()
      .from(orgSettings)
      .where(eq(orgSettings.id, SETTINGS_ID))
      .get();
    orgRate = settings?.defaultHourlyRate ?? null;
    return orgRate;
  }

  async function resolveProjectRate() {
    if (projectRate !== undefined) return { rate: projectRate, name: projectName ?? "Projekt" };
    if (!projectId) {
      throw new Error("Projekt-Stundensatz erfordert ein gewähltes Projekt");
    }
    const project = await db.select().from(projects).where(eq(projects.id, projectId)).get();
    if (!project || project.hourlyRate == null) {
      throw new Error("Gewähltes Projekt hat keinen Stundensatz");
    }
    projectRate = project.hourlyRate;
    projectName = project.name;
    return { rate: projectRate, name: projectName };
  }

  const lines: BuiltLine[] = [];
  let total = 0;
  let rateSnapshot: number | null = null;
  let primaryPriceId: string | null = null;

  for (let i = 0; i < input.length; i++) {
    const raw = input[i]!;
    let name: string;
    let kind: "hourly" | "fixed" | "unit";
    let unitLabel: string | null;
    let unitPrice: number;
    let linePriceId: string;

    if (raw.priceItemId === RATE_LINE_ORG) {
      const rate = await resolveOrgRate();
      if (rate == null) {
        throw new Error("Kein Standard-Stundensatz hinterlegt");
      }
      name = "Standard-Stundensatz";
      kind = "hourly";
      unitLabel = "h";
      unitPrice = rate;
      linePriceId = RATE_LINE_ORG;
    } else if (raw.priceItemId === RATE_LINE_PROJECT) {
      const { rate, name: pName } = await resolveProjectRate();
      name = `Projekt-Stundensatz (${pName})`;
      kind = "hourly";
      unitLabel = "h";
      unitPrice = rate!;
      linePriceId = RATE_LINE_PROJECT;
    } else {
      const item = map.get(raw.priceItemId);
      if (!item) {
        throw new Error(`Unbekannte Preisposition: ${raw.priceItemId}`);
      }
      name = item.name;
      kind = item.kind;
      unitLabel = item.unitLabel;
      unitPrice = item.unitPrice;
      linePriceId = item.id;
    }

    const quantity =
      raw.quantity != null && Number.isFinite(raw.quantity)
        ? roundMoney(raw.quantity)
        : kind === "hourly"
          ? entryHours > 0
            ? entryHours
            : 1
          : 1;
    const amount = billable ? roundMoney(quantity * unitPrice) : null;
    if (amount != null) total += amount;
    if (kind === "hourly" && primaryPriceId == null) {
      primaryPriceId = linePriceId;
      rateSnapshot = unitPrice;
    }
    lines.push({
      id: createId("tline"),
      timeEntryId,
      priceItemId: linePriceId,
      nameSnapshot: name,
      kindSnapshot: kind,
      unitLabelSnapshot: unitLabel,
      quantity,
      unitPriceSnapshot: unitPrice,
      amountSnapshot: amount,
      sortOrder: i,
    });
  }

  return {
    lines,
    amountSnapshot: billable && lines.length ? roundMoney(total) : null,
    rateSnapshot,
    priceItemId: primaryPriceId ?? lines[0]?.priceItemId ?? null,
  };
}

async function replaceLines(db: Db, timeEntryId: string, lines: BuiltLine[]) {
  await db.delete(timeEntryLines).where(eq(timeEntryLines.timeEntryId, timeEntryId));
  if (lines.length) await db.insert(timeEntryLines).values(lines);
}

async function loadLinesForEntries(db: Db, entryIds: string[]) {
  if (!entryIds.length) return new Map<string, BuiltLine[]>();
  const rows = await db
    .select()
    .from(timeEntryLines)
    .where(inArray(timeEntryLines.timeEntryId, entryIds))
    .orderBy(asc(timeEntryLines.sortOrder))
    .all();
  const map = new Map<string, BuiltLine[]>();
  for (const row of rows) {
    const list = map.get(row.timeEntryId) ?? [];
    list.push(row as BuiltLine);
    map.set(row.timeEntryId, list);
  }
  return map;
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

    const lineMap = await loadLinesForEntries(
      db,
      filtered.map((r) => r.id),
    );
    const entries = filtered.map((r) => {
      const lines = lineMap.get(r.id) ?? [];
      // Legacy: einzelner priceItemId ohne Zeilen → für die UI als eine Position spiegeln
      const legacyLines =
        lines.length === 0 && r.priceItemId
          ? [
              {
                id: `legacy-${r.id}`,
                timeEntryId: r.id,
                priceItemId: r.priceItemId,
                nameSnapshot: r.priceItemName ?? "Leistung",
                kindSnapshot: "hourly" as const,
                unitLabelSnapshot: "Stunde",
                quantity: r.hours,
                unitPriceSnapshot: r.rateSnapshot ?? 0,
                amountSnapshot: r.amountSnapshot,
                sortOrder: 0,
              },
            ]
          : lines;
      return { ...r, lines: legacyLines };
    });

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
      entries,
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

    const billable = parsed.data.billable ?? true;
    const billed = parsed.data.billed ?? false;
    const now = new Date();
    const id = createId("time");

    let priceItemId: string | null = emptyToNull(parsed.data.priceItemId);
    let rateSnapshot: number | null = null;
    let amountSnapshot: number | null = null;
    let lines: BuiltLine[] = [];

    if (parsed.data.lines && parsed.data.lines.length > 0) {
      try {
        const built = await buildCatalogLines(
          db,
          id,
          parsed.data.lines,
          resolved.hours,
          billable,
          projectId,
        );
        lines = built.lines;
        priceItemId = built.priceItemId;
        rateSnapshot = built.rateSnapshot;
        amountSnapshot = built.amountSnapshot;
      } catch (err) {
        return reply
          .code(400)
          .send({ error: err instanceof Error ? err.message : "Ungültige Katalog-Positionen" });
      }
    } else if (priceItemId) {
      // Legacy: einzelne Katalog-Position ohne lines[]
      const resolvedRate = await resolveHourlyRate(db, { priceItemId, projectId });
      priceItemId = resolvedRate.priceItemId;
      const money = amountFrom(resolved.hours, resolvedRate.rate, billable);
      rateSnapshot = money.rateSnapshot;
      amountSnapshot = money.amountSnapshot;
    } else {
      // Kein automatischer Stundensatz – Leistungen explizit über lines hinzufügen
      priceItemId = null;
      rateSnapshot = null;
      amountSnapshot = null;
    }

    const row = {
      id,
      customerId,
      projectId,
      priceItemId,
      workDate: parsed.data.workDate,
      startTime: resolved.startTime,
      endTime: resolved.endTime,
      hours: resolved.hours,
      description: emptyToNull(parsed.data.description),
      billable,
      billed,
      rateSnapshot,
      amountSnapshot,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(timeEntries).values(row);
    await replaceLines(db, id, lines);
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
    return reply.code(201).send({ ...row, lines });
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
    const startTime = body.startTime ?? nowTime();
    const workDate = body.workDate ?? todayIso();

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
    const billable = body.billable ?? true;
    // Stempeluhr startet ohne Betrag; Sätze beim Bearbeiten/Ausstempeln über Positionen
    let rateSnapshot: number | null = null;
    let amountSnapshot: number | null = null;
    let resolvedPriceId: string | null = priceItemId;
    if (priceItemId) {
      const resolvedRate = await resolveHourlyRate(db, { priceItemId, projectId });
      resolvedPriceId = resolvedRate.priceItemId;
      const money = amountFrom(0, resolvedRate.rate, billable);
      rateSnapshot = money.rateSnapshot;
      amountSnapshot = money.amountSnapshot;
    }

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
      rateSnapshot,
      amountSnapshot,
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(timeEntries).values(row);
    await addActivity(db, customerId, `Eingestempelt um ${startTime}`, row.description, now);
    return reply.code(201).send(row);
  });

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
    const endTime = body.endTime ?? nowTime();
    const hours = hoursFromRange(open.startTime, endTime);
    if (hours == null) {
      return reply.code(400).send({ error: "Ungültiger Zeitraum beim Ausstempeln" });
    }

    const existingLines = await db
      .select()
      .from(timeEntryLines)
      .where(eq(timeEntryLines.timeEntryId, open.id))
      .orderBy(asc(timeEntryLines.sortOrder))
      .all();

    let rateSnapshot = open.rateSnapshot;
    let amountSnapshot: number | null = null;
    let priceItemId = open.priceItemId;

    if (existingLines.length > 0) {
      const rebuilt = await buildCatalogLines(
        db,
        open.id,
        existingLines.map((l) => ({
          priceItemId: l.priceItemId,
          quantity: l.kindSnapshot === "hourly" ? hours : l.quantity,
        })),
        hours,
        open.billable,
        open.projectId,
      );
      await replaceLines(db, open.id, rebuilt.lines);
      rateSnapshot = rebuilt.rateSnapshot;
      amountSnapshot = rebuilt.amountSnapshot;
      priceItemId = rebuilt.priceItemId;
    } else {
      const money = amountFrom(hours, open.rateSnapshot, open.billable);
      rateSnapshot = money.rateSnapshot;
      amountSnapshot = money.amountSnapshot;
    }

    const description =
      body.description !== undefined ? emptyToNull(body.description) : open.description;

    const updated = {
      endTime,
      hours,
      description,
      priceItemId,
      rateSnapshot,
      amountSnapshot,
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
    const lines = await db
      .select()
      .from(timeEntryLines)
      .where(eq(timeEntryLines.timeEntryId, open.id))
      .orderBy(asc(timeEntryLines.sortOrder))
      .all();
    return { ...open, ...updated, lines };
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
      lines: z.array(lineInput).max(20).optional(),
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

    const billable = parsed.data.billable ?? existing.billable;
    const billed = parsed.data.billed ?? existing.billed;

    let priceItemId =
      parsed.data.priceItemId !== undefined
        ? emptyToNull(parsed.data.priceItemId)
        : existing.priceItemId;
    let rateSnapshot: number | null = null;
    let amountSnapshot: number | null = null;
    let lines: BuiltLine[] = [];

    if (parsed.data.lines !== undefined) {
      if (parsed.data.lines.length > 0) {
        try {
          const built = await buildCatalogLines(
            db,
            id,
            parsed.data.lines,
            resolved.hours,
            billable,
            projectId,
          );
          lines = built.lines;
          priceItemId = built.priceItemId;
          rateSnapshot = built.rateSnapshot;
          amountSnapshot = built.amountSnapshot;
        } catch (err) {
          return reply
            .code(400)
            .send({ error: err instanceof Error ? err.message : "Ungültige Katalog-Positionen" });
        }
      } else {
        priceItemId = null;
        rateSnapshot = null;
        amountSnapshot = null;
        lines = [];
      }
      await replaceLines(db, id, lines);
    } else {
      const existingLines = await db
        .select()
        .from(timeEntryLines)
        .where(eq(timeEntryLines.timeEntryId, id))
        .orderBy(asc(timeEntryLines.sortOrder))
        .all();
      if (existingLines.length > 0) {
        const rebuilt = await buildCatalogLines(
          db,
          id,
          existingLines.map((l) => ({
            priceItemId: l.priceItemId,
            quantity: l.kindSnapshot === "hourly" ? resolved.hours : l.quantity,
          })),
          resolved.hours,
          billable,
          projectId,
        );
        await replaceLines(db, id, rebuilt.lines);
        lines = rebuilt.lines;
        priceItemId = rebuilt.priceItemId;
        rateSnapshot = rebuilt.rateSnapshot;
        amountSnapshot = rebuilt.amountSnapshot;
      } else if (priceItemId) {
        const resolvedRate = await resolveHourlyRate(db, { priceItemId, projectId });
        priceItemId = resolvedRate.priceItemId;
        const money = amountFrom(resolved.hours, resolvedRate.rate, billable);
        rateSnapshot = money.rateSnapshot;
        amountSnapshot = money.amountSnapshot;
      } else {
        // Bestehenden Snapshot bei Stundenänderung behalten (Legacy ohne Positionen)
        const money = amountFrom(resolved.hours, existing.rateSnapshot, billable);
        rateSnapshot = money.rateSnapshot;
        amountSnapshot = money.amountSnapshot;
      }
    }

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
      priceItemId,
      billable,
      billed,
      rateSnapshot,
      amountSnapshot,
      updatedAt: new Date(),
    };

    await db.update(timeEntries).set(updated).where(eq(timeEntries.id, id));
    const finalLines =
      lines.length > 0
        ? lines
        : await db
            .select()
            .from(timeEntryLines)
            .where(eq(timeEntryLines.timeEntryId, id))
            .orderBy(asc(timeEntryLines.sortOrder))
            .all();
    return { ...existing, ...updated, lines: finalLines };
  });

  app.delete("/api/time-entries/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(timeEntries).where(eq(timeEntries.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Zeiteintrag nicht gefunden" });
    await db.delete(timeEntryLines).where(eq(timeEntryLines.timeEntryId, id));
    await db.delete(timeEntries).where(eq(timeEntries.id, id));
    return { ok: true };
  });
}
