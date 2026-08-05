import { and, asc, eq, gte, isNotNull, lte, ne } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { assets, contracts, customers, tasks } from "../db/schema.js";
import { requireAuth } from "../plugins/auth.js";

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

/**
 * Registriert Ablauf-/Erinnerungs-Routen.
 */
export async function reminderRoutes(app: FastifyInstance, db: Db) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/reminders", async (request) => {
    const { days } = z
      .object({ days: z.coerce.number().int().positive().max(365).optional() })
      .parse(request.query);

    const windowDays = days ?? 90;
    const today = new Date();
    const until = new Date(today);
    until.setDate(until.getDate() + windowDays);
    const from = isoDate(today);
    const to = isoDate(until);

    const [warrantyAssets, endingContracts, dueTasks] = await Promise.all([
      db
        .select({
          id: assets.id,
          name: assets.name,
          kind: assets.kind,
          warrantyUntil: assets.warrantyUntil,
          customerId: assets.customerId,
          customerName: customers.name,
          customerCompany: customers.company,
        })
        .from(assets)
        .innerJoin(customers, eq(assets.customerId, customers.id))
        .where(
          and(
            isNotNull(assets.warrantyUntil),
            ne(assets.warrantyUntil, ""),
            gte(assets.warrantyUntil, from),
            lte(assets.warrantyUntil, to),
          ),
        )
        .orderBy(asc(assets.warrantyUntil))
        .all(),
      db
        .select({
          id: contracts.id,
          title: contracts.title,
          endDate: contracts.endDate,
          slaResponseHours: contracts.slaResponseHours,
          customerId: contracts.customerId,
          customerName: customers.name,
          customerCompany: customers.company,
        })
        .from(contracts)
        .innerJoin(customers, eq(contracts.customerId, customers.id))
        .where(
          and(
            isNotNull(contracts.endDate),
            ne(contracts.endDate, ""),
            gte(contracts.endDate, from),
            lte(contracts.endDate, to),
          ),
        )
        .orderBy(asc(contracts.endDate))
        .all(),
      db
        .select({
          id: tasks.id,
          title: tasks.title,
          dueDate: tasks.dueDate,
          customerId: tasks.customerId,
          customerName: customers.name,
          customerCompany: customers.company,
        })
        .from(tasks)
        .innerJoin(customers, eq(tasks.customerId, customers.id))
        .where(
          and(
            eq(tasks.done, false),
            isNotNull(tasks.dueDate),
            ne(tasks.dueDate, ""),
            lte(tasks.dueDate, to),
          ),
        )
        .orderBy(asc(tasks.dueDate))
        .all(),
    ]);

    return {
      days: windowDays,
      from,
      to,
      warranties: warrantyAssets,
      contracts: endingContracts,
      tasks: dueTasks,
    };
  });
}
