import { and, desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { customers, projects, timeEntries } from "../db/schema.js";
import { createId } from "../lib/id.js";
import { requireAuth } from "../plugins/auth.js";
import { addActivity } from "./activities.js";

const entryBody = z.object({
  workDate: z.string().min(1).max(40),
  hours: z.number().positive().max(24),
  description: z.string().max(5000).optional().or(z.literal("")),
  projectId: z.string().optional().nullable().or(z.literal("")),
  billable: z.boolean().optional(),
});

function emptyToNull(value: string | null | undefined) {
  if (!value || !value.trim()) return null;
  return value.trim();
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
        workDate: timeEntries.workDate,
        hours: timeEntries.hours,
        description: timeEntries.description,
        billable: timeEntries.billable,
        createdAt: timeEntries.createdAt,
        updatedAt: timeEntries.updatedAt,
      })
      .from(timeEntries)
      .leftJoin(projects, eq(timeEntries.projectId, projects.id))
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

    return {
      entries: filtered,
      summary: {
        totalHours: Math.round(totalHours * 100) / 100,
        billableHours: Math.round(billableHours * 100) / 100,
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

    const projectId = emptyToNull(parsed.data.projectId);
    if (projectId) {
      const project = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.customerId, customerId)))
        .get();
      if (!project) return reply.code(400).send({ error: "Projekt gehört nicht zu diesem Kunden" });
    }

    const now = new Date();
    const row = {
      id: createId("time"),
      customerId,
      projectId,
      workDate: parsed.data.workDate,
      hours: parsed.data.hours,
      description: emptyToNull(parsed.data.description),
      billable: parsed.data.billable ?? true,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(timeEntries).values(row);
    await addActivity(
      db,
      customerId,
      `Zeit erfasst: ${row.hours}h am ${row.workDate}`,
      row.description,
      now,
    );
    return reply.code(201).send(row);
  });

  app.put("/api/time-entries/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(timeEntries).where(eq(timeEntries.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Zeiteintrag nicht gefunden" });

    const parsed = entryBody.partial().safeParse(request.body);
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

    const updated = {
      workDate: parsed.data.workDate ?? existing.workDate,
      hours: parsed.data.hours ?? existing.hours,
      description:
        parsed.data.description !== undefined
          ? emptyToNull(parsed.data.description)
          : existing.description,
      projectId,
      billable: parsed.data.billable ?? existing.billable,
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
