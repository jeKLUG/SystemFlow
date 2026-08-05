import { asc, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { orgSettings, priceItems, projects, timeEntries } from "../db/schema.js";
import { createId } from "../lib/id.js";
import { requireAuth } from "../plugins/auth.js";

const SETTINGS_ID = "default";

const settingsBody = z.object({
  defaultHourlyRate: z.number().nonnegative().nullable().optional(),
  currency: z.string().min(1).max(8).optional(),
  defaultVatPercent: z.number().min(0).max(100).nullable().optional(),
  invoiceNote: z.string().max(5000).optional().or(z.literal("")),
});

const priceBody = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional().or(z.literal("")),
  kind: z.enum(["hourly", "fixed", "unit"]).optional(),
  unitLabel: z.string().max(40).optional().or(z.literal("")),
  unitPrice: z.number().nonnegative(),
  sku: z.string().max(80).optional().or(z.literal("")),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

function emptyToNull(value: string | null | undefined) {
  if (!value || !value.trim()) return null;
  return value.trim();
}

async function ensureSettings(db: Db) {
  const existing = await db.select().from(orgSettings).where(eq(orgSettings.id, SETTINGS_ID)).get();
  if (existing) return existing;
  const now = new Date();
  const row = {
    id: SETTINGS_ID,
    defaultHourlyRate: null as number | null,
    currency: "EUR",
    defaultVatPercent: 19 as number | null,
    invoiceNote: null as string | null,
    updatedAt: now,
  };
  await db.insert(orgSettings).values(row);
  return row;
}

/**
 * Löst den anzuwendenden Stundensatz für eine Zeitbuchung auf.
 */
export async function resolveHourlyRate(
  db: Db,
  opts: { priceItemId?: string | null; projectId?: string | null },
): Promise<{ rate: number | null; priceItemId: string | null }> {
  if (opts.priceItemId) {
    const item = await db
      .select()
      .from(priceItems)
      .where(eq(priceItems.id, opts.priceItemId))
      .get();
    if (item && item.kind === "hourly" && item.active) {
      return { rate: item.unitPrice, priceItemId: item.id };
    }
  }
  if (opts.projectId) {
    const project = await db.select().from(projects).where(eq(projects.id, opts.projectId)).get();
    if (project?.hourlyRate != null) {
      return { rate: project.hourlyRate, priceItemId: opts.priceItemId ?? null };
    }
  }
  const settings = await ensureSettings(db);
  return {
    rate: settings.defaultHourlyRate,
    priceItemId: opts.priceItemId ?? null,
  };
}

/**
 * Registriert Preis-/Konto-Einstellungen und Preiskatalog.
 */
export async function pricingRoutes(app: FastifyInstance, db: Db) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/settings/org", async () => {
    return await ensureSettings(db);
  });

  app.put("/api/settings/org", async (request, reply) => {
    const parsed = settingsBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }
    const existing = await ensureSettings(db);
    const updated = {
      defaultHourlyRate:
        parsed.data.defaultHourlyRate !== undefined
          ? parsed.data.defaultHourlyRate
          : existing.defaultHourlyRate,
      currency: parsed.data.currency?.trim().toUpperCase() || existing.currency,
      defaultVatPercent:
        parsed.data.defaultVatPercent !== undefined
          ? parsed.data.defaultVatPercent
          : existing.defaultVatPercent,
      invoiceNote:
        parsed.data.invoiceNote !== undefined
          ? emptyToNull(parsed.data.invoiceNote)
          : existing.invoiceNote,
      updatedAt: new Date(),
    };
    await db.update(orgSettings).set(updated).where(eq(orgSettings.id, SETTINGS_ID));
    return { ...existing, ...updated };
  });

  app.get("/api/price-items", async (request) => {
    const q = z
      .object({
        activeOnly: z.coerce.boolean().optional(),
        kind: z.enum(["hourly", "fixed", "unit"]).optional(),
      })
      .parse(request.query);

    let rows = await db
      .select()
      .from(priceItems)
      .orderBy(asc(priceItems.sortOrder), asc(priceItems.name))
      .all();
    if (q.activeOnly) rows = rows.filter((r) => r.active);
    if (q.kind) rows = rows.filter((r) => r.kind === q.kind);
    return rows;
  });

  app.post("/api/price-items", async (request, reply) => {
    const parsed = priceBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }
    const now = new Date();
    const kind = parsed.data.kind ?? "hourly";
    const row = {
      id: createId("price"),
      name: parsed.data.name.trim(),
      description: emptyToNull(parsed.data.description),
      kind,
      unitLabel:
        emptyToNull(parsed.data.unitLabel) ??
        (kind === "hourly" ? "Stunde" : kind === "fixed" ? "Pauschale" : "Stück"),
      unitPrice: parsed.data.unitPrice,
      sku: emptyToNull(parsed.data.sku),
      active: parsed.data.active ?? true,
      sortOrder: parsed.data.sortOrder ?? 0,
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(priceItems).values(row);
    return reply.code(201).send(row);
  });

  app.put("/api/price-items/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(priceItems).where(eq(priceItems.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Preisposition nicht gefunden" });

    const parsed = priceBody.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }

    const kind = parsed.data.kind ?? existing.kind;
    const updated = {
      name: parsed.data.name?.trim() ?? existing.name,
      description:
        parsed.data.description !== undefined
          ? emptyToNull(parsed.data.description)
          : existing.description,
      kind,
      unitLabel:
        parsed.data.unitLabel !== undefined
          ? emptyToNull(parsed.data.unitLabel) ?? existing.unitLabel
          : existing.unitLabel,
      unitPrice: parsed.data.unitPrice ?? existing.unitPrice,
      sku: parsed.data.sku !== undefined ? emptyToNull(parsed.data.sku) : existing.sku,
      active: parsed.data.active ?? existing.active,
      sortOrder: parsed.data.sortOrder ?? existing.sortOrder,
      updatedAt: new Date(),
    };
    await db.update(priceItems).set(updated).where(eq(priceItems.id, id));
    return { ...existing, ...updated };
  });

  app.delete("/api/price-items/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(priceItems).where(eq(priceItems.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Preisposition nicht gefunden" });
    await db.delete(priceItems).where(eq(priceItems.id, id));
    return { ok: true };
  });

  /**
   * Rechnungsvorbereitung: abrechenbare Zeiten als Positionen (kein Lexware-Export).
   */
  app.get("/api/customers/:customerId/billing-preview", async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    const q = z
      .object({
        from: z.string().optional(),
        to: z.string().optional(),
      })
      .parse(request.query);

    const settings = await ensureSettings(db);
    let entries = await db
      .select()
      .from(timeEntries)
      .where(eq(timeEntries.customerId, customerId))
      .orderBy(desc(timeEntries.workDate))
      .all();

    entries = entries.filter((e) => e.billable);
    if (q.from) entries = entries.filter((e) => e.workDate >= q.from!);
    if (q.to) entries = entries.filter((e) => e.workDate <= q.to!);

    const priceIds = [...new Set(entries.map((e) => e.priceItemId).filter(Boolean))] as string[];
    const priceRows =
      priceIds.length > 0
        ? await db.select().from(priceItems).all()
        : [];
    const priceMap = new Map(priceRows.map((p) => [p.id, p]));

    const lines = entries.map((e) => {
      const rate = e.rateSnapshot;
      const amount =
        e.amountSnapshot != null
          ? e.amountSnapshot
          : rate != null
            ? Math.round(e.hours * rate * 100) / 100
            : null;
      const price = e.priceItemId ? priceMap.get(e.priceItemId) : null;
      return {
        timeEntryId: e.id,
        workDate: e.workDate,
        hours: e.hours,
        description: e.description,
        priceItemId: e.priceItemId,
        priceItemName: price?.name ?? null,
        rate,
        amount,
        currency: settings.currency,
      };
    });

    const totalHours = Math.round(lines.reduce((s, l) => s + l.hours, 0) * 100) / 100;
    const totalNet = Math.round(
      lines.reduce((s, l) => s + (l.amount ?? 0), 0) * 100,
    ) / 100;
    const vat = settings.defaultVatPercent ?? 0;
    const totalGross =
      vat > 0 ? Math.round(totalNet * (1 + vat / 100) * 100) / 100 : totalNet;

    return {
      currency: settings.currency,
      defaultVatPercent: settings.defaultVatPercent,
      invoiceNote: settings.invoiceNote,
      from: q.from ?? null,
      to: q.to ?? null,
      lines,
      summary: {
        lineCount: lines.length,
        totalHours,
        totalNet,
        totalGross,
        missingRates: lines.filter((l) => l.amount == null).length,
      },
    };
  });
}
