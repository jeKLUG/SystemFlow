import { and, asc, desc, eq, gt, isNotNull, isNull, lte, ne, or } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { customers, projects, tasks } from "../db/schema.js";
import { todayIso } from "../lib/dates.js";
import { createId } from "../lib/id.js";
import { requireAuth } from "../plugins/auth.js";

const taskBody = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional().nullable().or(z.literal("")),
  dueDate: z.string().max(40).optional().nullable().or(z.literal("")),
  projectId: z.string().optional().nullable().or(z.literal("")),
  priority: z.number().int().min(1).max(4).optional(),
  sortOrder: z.number().int().optional(),
  done: z.boolean().optional(),
});

function emptyToNull(value: string | null | undefined) {
  if (!value || !value.trim()) return null;
  return value.trim();
}

function selectTaskFields() {
  return {
    id: tasks.id,
    customerId: tasks.customerId,
    customerName: customers.name,
    customerCompany: customers.company,
    projectId: tasks.projectId,
    projectName: projects.name,
    title: tasks.title,
    description: tasks.description,
    dueDate: tasks.dueDate,
    priority: tasks.priority,
    sortOrder: tasks.sortOrder,
    done: tasks.done,
    createdAt: tasks.createdAt,
    updatedAt: tasks.updatedAt,
  };
}

type View = "today" | "upcoming" | "inbox" | "all" | "done";

function viewConditions(view: View | undefined, openOnly: boolean | undefined) {
  const today = todayIso();
  const conditions = [];

  if (view === "done") {
    conditions.push(eq(tasks.done, true));
  } else if (openOnly || (view && view !== "all")) {
    conditions.push(eq(tasks.done, false));
  }

  if (view === "today") {
    conditions.push(isNotNull(tasks.dueDate));
    conditions.push(ne(tasks.dueDate, ""));
    conditions.push(lte(tasks.dueDate, today));
  } else if (view === "upcoming") {
    conditions.push(isNotNull(tasks.dueDate));
    conditions.push(ne(tasks.dueDate, ""));
    conditions.push(gt(tasks.dueDate, today));
  } else if (view === "inbox") {
    conditions.push(or(isNull(tasks.dueDate), eq(tasks.dueDate, ""))!);
  }

  return conditions;
}

/**
 * Aufgaben-API im Todoist-Stil: Priorität, Projekt, Ansichten.
 */
export async function taskRoutes(app: FastifyInstance, db: Db) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/tasks", async (request) => {
    const q = z
      .object({
        openOnly: z.coerce.boolean().optional(),
        customerId: z.string().optional(),
        projectId: z.string().optional(),
        view: z.enum(["today", "upcoming", "inbox", "all", "done"]).optional(),
        limit: z.coerce.number().int().positive().max(500).optional(),
      })
      .parse(request.query);

    const conditions = [...viewConditions(q.view, q.openOnly)];
    if (q.customerId) conditions.push(eq(tasks.customerId, q.customerId));
    if (q.projectId === "none") {
      conditions.push(or(isNull(tasks.projectId), eq(tasks.projectId, ""))!);
    } else if (q.projectId) {
      conditions.push(eq(tasks.projectId, q.projectId));
    }

    const base = db
      .select(selectTaskFields())
      .from(tasks)
      .innerJoin(customers, eq(tasks.customerId, customers.id))
      .leftJoin(projects, eq(tasks.projectId, projects.id));

    const rows = conditions.length
      ? await base
          .where(and(...conditions))
          .orderBy(
            asc(tasks.done),
            asc(tasks.priority),
            asc(tasks.dueDate),
            asc(tasks.sortOrder),
            desc(tasks.updatedAt),
          )
          .limit(q.limit ?? 200)
          .all()
      : await base
          .orderBy(
            asc(tasks.done),
            asc(tasks.priority),
            asc(tasks.dueDate),
            asc(tasks.sortOrder),
            desc(tasks.updatedAt),
          )
          .limit(q.limit ?? 200)
          .all();

    return rows;
  });

  app.get("/api/customers/:customerId/tasks", async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    const customer = await db.select().from(customers).where(eq(customers.id, customerId)).get();
    if (!customer) return reply.code(404).send({ error: "Kunde nicht gefunden" });

    const q = z
      .object({
        projectId: z.string().optional(),
        view: z.enum(["today", "upcoming", "inbox", "all", "done"]).optional(),
      })
      .parse(request.query);

    const conditions = [eq(tasks.customerId, customerId), ...viewConditions(q.view, !q.view || q.view !== "all")];
    // For customer list default show all including done at bottom unless view set
    if (!q.view) {
      // reset: only customer filter, show open+done
      const onlyCustomer = [eq(tasks.customerId, customerId)];
      if (q.projectId === "none") {
        onlyCustomer.push(or(isNull(tasks.projectId), eq(tasks.projectId, ""))!);
      } else if (q.projectId) {
        onlyCustomer.push(eq(tasks.projectId, q.projectId));
      }
      return await db
        .select(selectTaskFields())
        .from(tasks)
        .innerJoin(customers, eq(tasks.customerId, customers.id))
        .leftJoin(projects, eq(tasks.projectId, projects.id))
        .where(and(...onlyCustomer))
        .orderBy(
          asc(tasks.done),
          asc(tasks.priority),
          asc(tasks.dueDate),
          asc(tasks.sortOrder),
          desc(tasks.updatedAt),
        )
        .all();
    }

    if (q.projectId === "none") {
      conditions.push(or(isNull(tasks.projectId), eq(tasks.projectId, ""))!);
    } else if (q.projectId) {
      conditions.push(eq(tasks.projectId, q.projectId));
    }

    return await db
      .select(selectTaskFields())
      .from(tasks)
      .innerJoin(customers, eq(tasks.customerId, customers.id))
      .leftJoin(projects, eq(tasks.projectId, projects.id))
      .where(and(...conditions))
      .orderBy(
        asc(tasks.done),
        asc(tasks.priority),
        asc(tasks.dueDate),
        asc(tasks.sortOrder),
        desc(tasks.updatedAt),
      )
      .all();
  });

  app.post("/api/customers/:customerId/tasks", async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    const customer = await db.select().from(customers).where(eq(customers.id, customerId)).get();
    if (!customer) return reply.code(404).send({ error: "Kunde nicht gefunden" });

    const parsed = taskBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }

    const projectId = emptyToNull(parsed.data.projectId);
    if (projectId) {
      const project = await db.select().from(projects).where(eq(projects.id, projectId)).get();
      if (!project || project.customerId !== customerId) {
        return reply.code(400).send({ error: "Projekt nicht gefunden" });
      }
    }

    const now = new Date();
    const row = {
      id: createId("tsk"),
      customerId,
      projectId,
      title: parsed.data.title.trim(),
      description: emptyToNull(parsed.data.description),
      dueDate: emptyToNull(parsed.data.dueDate),
      priority: parsed.data.priority ?? 4,
      sortOrder: parsed.data.sortOrder ?? 0,
      done: parsed.data.done ?? false,
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(tasks).values(row);

    const project = projectId
      ? await db.select().from(projects).where(eq(projects.id, projectId)).get()
      : null;

    return reply.code(201).send({
      ...row,
      customerName: customer.name,
      customerCompany: customer.company,
      projectName: project?.name ?? null,
    });
  });

  app.put("/api/tasks/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(tasks).where(eq(tasks.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Aufgabe nicht gefunden" });

    const parsed = taskBody.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }

    let projectId = existing.projectId;
    if (parsed.data.projectId !== undefined) {
      projectId = emptyToNull(parsed.data.projectId);
      if (projectId) {
        const project = await db.select().from(projects).where(eq(projects.id, projectId)).get();
        if (!project || project.customerId !== existing.customerId) {
          return reply.code(400).send({ error: "Projekt nicht gefunden" });
        }
      }
    }

    const updated = {
      title: parsed.data.title?.trim() ?? existing.title,
      description:
        parsed.data.description !== undefined
          ? emptyToNull(parsed.data.description)
          : existing.description,
      dueDate:
        parsed.data.dueDate !== undefined ? emptyToNull(parsed.data.dueDate) : existing.dueDate,
      projectId,
      priority: parsed.data.priority ?? existing.priority,
      sortOrder: parsed.data.sortOrder ?? existing.sortOrder,
      done: parsed.data.done ?? existing.done,
      updatedAt: new Date(),
    };
    await db.update(tasks).set(updated).where(eq(tasks.id, id));

    const customer = await db
      .select()
      .from(customers)
      .where(eq(customers.id, existing.customerId))
      .get();
    const project = projectId
      ? await db.select().from(projects).where(eq(projects.id, projectId)).get()
      : null;

    return {
      ...existing,
      ...updated,
      customerName: customer?.name,
      customerCompany: customer?.company,
      projectName: project?.name ?? null,
    };
  });

  app.delete("/api/tasks/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(tasks).where(eq(tasks.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Aufgabe nicht gefunden" });
    await db.delete(tasks).where(eq(tasks.id, id));
    return { ok: true };
  });
}
