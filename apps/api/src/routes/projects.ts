import { and, desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { customers, projects, timeEntries } from "../db/schema.js";
import { createId } from "../lib/id.js";
import { requireAuth } from "../plugins/auth.js";
import { addActivity } from "./activities.js";

const projectBody = z.object({
  name: z.string().min(1).max(300),
  description: z.string().max(10000).optional().or(z.literal("")),
  status: z.enum(["planned", "active", "on_hold", "done"]).optional(),
  startDate: z.string().max(40).optional().or(z.literal("")),
  endDate: z.string().max(40).optional().or(z.literal("")),
  budgetHours: z.number().nonnegative().nullable().optional(),
  budgetAmount: z.number().nonnegative().nullable().optional(),
  hourlyRate: z.number().nonnegative().nullable().optional(),
});

function emptyToNull(value: string | undefined) {
  if (!value || !value.trim()) return null;
  return value.trim();
}

/**
 * Registriert Projekt-Routen inkl. Budget und gebuchter Stunden.
 */
export async function projectRoutes(app: FastifyInstance, db: Db) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/customers/:customerId/projects", async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    const customer = await db.select().from(customers).where(eq(customers.id, customerId)).get();
    if (!customer) return reply.code(404).send({ error: "Kunde nicht gefunden" });

    const rows = await db
      .select()
      .from(projects)
      .where(eq(projects.customerId, customerId))
      .orderBy(desc(projects.updatedAt))
      .all();

    const spent = await db
      .select({
        projectId: timeEntries.projectId,
        hours: sql<number>`coalesce(sum(${timeEntries.hours}), 0)`,
      })
      .from(timeEntries)
      .where(eq(timeEntries.customerId, customerId))
      .groupBy(timeEntries.projectId)
      .all();

    const hoursByProject = new Map(
      spent.filter((s) => s.projectId).map((s) => [s.projectId as string, Number(s.hours) || 0]),
    );

    return rows.map((p) => {
      const loggedHours = hoursByProject.get(p.id) ?? 0;
      const rate = p.hourlyRate ?? 0;
      return {
        ...p,
        loggedHours,
        estimatedCost: rate > 0 ? Math.round(loggedHours * rate * 100) / 100 : null,
        budgetHoursRemaining:
          p.budgetHours != null ? Math.round((p.budgetHours - loggedHours) * 100) / 100 : null,
      };
    });
  });

  app.get("/api/projects/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await db.select().from(projects).where(eq(projects.id, id)).get();
    if (!row) return reply.code(404).send({ error: "Projekt nicht gefunden" });
    return row;
  });

  app.post("/api/customers/:customerId/projects", async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    const customer = await db.select().from(customers).where(eq(customers.id, customerId)).get();
    if (!customer) return reply.code(404).send({ error: "Kunde nicht gefunden" });

    const parsed = projectBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }

    const now = new Date();
    const row = {
      id: createId("prj"),
      customerId,
      name: parsed.data.name.trim(),
      description: emptyToNull(parsed.data.description),
      status: parsed.data.status ?? "planned",
      startDate: emptyToNull(parsed.data.startDate),
      endDate: emptyToNull(parsed.data.endDate),
      budgetHours: parsed.data.budgetHours ?? null,
      budgetAmount: parsed.data.budgetAmount ?? null,
      hourlyRate: parsed.data.hourlyRate ?? null,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(projects).values(row);
    await addActivity(db, customerId, `Projekt erstellt: ${row.name}`, null, now);
    return reply.code(201).send({ ...row, loggedHours: 0, estimatedCost: null, budgetHoursRemaining: row.budgetHours });
  });

  app.put("/api/projects/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(projects).where(eq(projects.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Projekt nicht gefunden" });

    const parsed = projectBody.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }

    const updated = {
      name: parsed.data.name?.trim() ?? existing.name,
      description:
        parsed.data.description !== undefined
          ? emptyToNull(parsed.data.description)
          : existing.description,
      status: parsed.data.status ?? existing.status,
      startDate:
        parsed.data.startDate !== undefined
          ? emptyToNull(parsed.data.startDate)
          : existing.startDate,
      endDate:
        parsed.data.endDate !== undefined ? emptyToNull(parsed.data.endDate) : existing.endDate,
      budgetHours:
        parsed.data.budgetHours !== undefined ? parsed.data.budgetHours : existing.budgetHours,
      budgetAmount:
        parsed.data.budgetAmount !== undefined ? parsed.data.budgetAmount : existing.budgetAmount,
      hourlyRate:
        parsed.data.hourlyRate !== undefined ? parsed.data.hourlyRate : existing.hourlyRate,
      updatedAt: new Date(),
    };

    await db.update(projects).set(updated).where(eq(projects.id, id));
    return { ...existing, ...updated };
  });

  app.delete("/api/projects/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(projects).where(eq(projects.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Projekt nicht gefunden" });

    await db
      .update(timeEntries)
      .set({ projectId: null })
      .where(and(eq(timeEntries.projectId, id)));
    await db.delete(projects).where(eq(projects.id, id));
    return { ok: true };
  });
}
