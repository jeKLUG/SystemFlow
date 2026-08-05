import { desc, eq, like, or } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { activities, assets, customers, documents } from "../db/schema.js";
import { requireAuth } from "../plugins/auth.js";

/**
 * Registriert die globale Volltextsuche.
 */
export async function searchRoutes(app: FastifyInstance, db: Db) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/search", async (request) => {
    const { q } = z
      .object({ q: z.string().min(1).max(200) })
      .parse(request.query);

    const term = q.trim();
    const pattern = `%${term}%`;

    const [customerHits, documentHits, assetHits, activityHits] = await Promise.all([
      db
        .select({
          id: customers.id,
          name: customers.name,
          company: customers.company,
          email: customers.email,
          phone: customers.phone,
          city: customers.city,
          status: customers.status,
        })
        .from(customers)
        .where(
          or(
            like(customers.name, pattern),
            like(customers.company, pattern),
            like(customers.contactPerson, pattern),
            like(customers.email, pattern),
            like(customers.phone, pattern),
            like(customers.mobile, pattern),
            like(customers.address, pattern),
            like(customers.zip, pattern),
            like(customers.city, pattern),
            like(customers.vatId, pattern),
            like(customers.website, pattern),
            like(customers.notes, pattern),
          ),
        )
        .orderBy(desc(customers.updatedAt))
        .limit(20)
        .all(),
      db
        .select({
          id: documents.id,
          title: documents.title,
          type: documents.type,
          customerId: documents.customerId,
          customerName: customers.name,
          updatedAt: documents.updatedAt,
        })
        .from(documents)
        .innerJoin(customers, eq(documents.customerId, customers.id))
        .where(or(like(documents.title, pattern), like(documents.content, pattern)))
        .orderBy(desc(documents.updatedAt))
        .limit(20)
        .all(),
      db
        .select({
          id: assets.id,
          name: assets.name,
          kind: assets.kind,
          serialNumber: assets.serialNumber,
          customerId: assets.customerId,
          customerName: customers.name,
        })
        .from(assets)
        .innerJoin(customers, eq(assets.customerId, customers.id))
        .where(
          or(
            like(assets.name, pattern),
            like(assets.manufacturer, pattern),
            like(assets.model, pattern),
            like(assets.serialNumber, pattern),
            like(assets.notes, pattern),
          ),
        )
        .orderBy(desc(assets.updatedAt))
        .limit(20)
        .all(),
      db
        .select({
          id: activities.id,
          title: activities.title,
          description: activities.description,
          customerId: activities.customerId,
          customerName: customers.name,
          occurredAt: activities.occurredAt,
        })
        .from(activities)
        .innerJoin(customers, eq(activities.customerId, customers.id))
        .where(or(like(activities.title, pattern), like(activities.description, pattern)))
        .orderBy(desc(activities.occurredAt))
        .limit(20)
        .all(),
    ]);

    return {
      q: term,
      customers: customerHits,
      documents: documentHits,
      assets: assetHits,
      activities: activityHits,
    };
  });
}
