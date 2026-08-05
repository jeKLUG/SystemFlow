import { and, asc, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { customers, tasks } from "../db/schema.js";
import { createId } from "../lib/id.js";
import { requireAuth } from "../plugins/auth.js";

const taskBody = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional().or(z.literal("")),
  dueDate: z.string().max(40).optional().or(z.literal("")),
  done: z.boolean().optional(),
});

/**
 * Registriert Aufgaben-Routen.
 */
export async function taskRoutes(app: FastifyInstance, db: Db) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/tasks", async (request) => {
    const q = z
      .object({
        openOnly: z.coerce.boolean().optional(),
        limit: z.coerce.number().int().positive().max(100).optional(),
      })
      .parse(request.query);

    if (q.openOnly) {
      return await db
        .select({
          id: tasks.id,
          customerId: tasks.customerId,
          customerName: customers.name,
          customerCompany: customers.company,
          title: tasks.title,
          description: tasks.description,
          dueDate: tasks.dueDate,
          done: tasks.done,
          createdAt: tasks.createdAt,
          updatedAt: tasks.updatedAt,
        })
        .from(tasks)
        .innerJoin(customers, eq(tasks.customerId, customers.id))
        .where(eq(tasks.done, false))
        .orderBy(asc(tasks.dueDate), desc(tasks.updatedAt))
        .limit(q.limit ?? 30)
        .all();
    }

    return await db
      .select({
        id: tasks.id,
        customerId: tasks.customerId,
        customerName: customers.name,
        customerCompany: customers.company,
        title: tasks.title,
        description: tasks.description,
        dueDate: tasks.dueDate,
        done: tasks.done,
        createdAt: tasks.createdAt,
        updatedAt: tasks.updatedAt,
      })
      .from(tasks)
      .innerJoin(customers, eq(tasks.customerId, customers.id))
      .orderBy(asc(tasks.dueDate), desc(tasks.updatedAt))
      .limit(q.limit ?? 50)
      .all();
  });

  app.get("/api/customers/:customerId/tasks", async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    const customer = await db.select().from(customers).where(eq(customers.id, customerId)).get();
    if (!customer) return reply.code(404).send({ error: "Kunde nicht gefunden" });

    return await db
      .select()
      .from(tasks)
      .where(eq(tasks.customerId, customerId))
      .orderBy(asc(tasks.done), asc(tasks.dueDate), desc(tasks.updatedAt))
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

    const now = new Date();
    const row = {
      id: createId("tsk"),
      customerId,
      title: parsed.data.title.trim(),
      description: parsed.data.description || null,
      dueDate: parsed.data.dueDate || null,
      done: parsed.data.done ?? false,
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(tasks).values(row);
    return reply.code(201).send(row);
  });

  app.put("/api/tasks/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(tasks).where(eq(tasks.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Aufgabe nicht gefunden" });

    const parsed = taskBody.partial().extend({ done: z.boolean().optional() }).safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }

    const updated = {
      title: parsed.data.title?.trim() ?? existing.title,
      description:
        parsed.data.description !== undefined
          ? parsed.data.description || null
          : existing.description,
      dueDate:
        parsed.data.dueDate !== undefined ? parsed.data.dueDate || null : existing.dueDate,
      done: parsed.data.done ?? existing.done,
      updatedAt: new Date(),
    };
    await db.update(tasks).set(updated).where(eq(tasks.id, id));
    return { ...existing, ...updated };
  });

  app.delete("/api/tasks/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(tasks).where(eq(tasks.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Aufgabe nicht gefunden" });
    await db.delete(tasks).where(and(eq(tasks.id, id)));
    return { ok: true };
  });
}
