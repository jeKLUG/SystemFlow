import { desc, eq, like, or, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { customers } from "../db/schema.js";
import { createId } from "../lib/id.js";
import { requireAuth } from "../plugins/auth.js";

const optionalText = (max: number) => z.string().max(max).optional().or(z.literal(""));

const customerBody = z.object({
  name: z.string().min(1).max(200),
  company: optionalText(200),
  contactPerson: optionalText(200),
  email: z.string().email().optional().or(z.literal("")),
  phone: optionalText(80),
  mobile: optionalText(80),
  address: optionalText(500),
  zip: optionalText(20),
  city: optionalText(120),
  country: optionalText(80),
  vatId: optionalText(40),
  website: optionalText(300),
  notes: optionalText(2000),
  status: z.enum(["active", "inactive"]).optional(),
});

function mapCustomerInput(data: z.infer<typeof customerBody>) {
  return {
    name: data.name.trim(),
    company: data.company?.trim() || null,
    contactPerson: data.contactPerson?.trim() || null,
    email: data.email?.trim() || null,
    phone: data.phone?.trim() || null,
    mobile: data.mobile?.trim() || null,
    address: data.address?.trim() || null,
    zip: data.zip?.trim() || null,
    city: data.city?.trim() || null,
    country: data.country?.trim() || null,
    vatId: data.vatId?.trim() || null,
    website: data.website?.trim() || null,
    notes: data.notes?.trim() || null,
  };
}

/**
 * Registriert Kunden-CRUD-Routen.
 */
export async function customerRoutes(app: FastifyInstance, db: Db) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/customers", async (request) => {
    const q = z
      .object({ q: z.string().optional() })
      .parse(request.query);

    const term = q.q?.trim();
    if (term) {
      const pattern = `%${term}%`;
      return await db
        .select()
        .from(customers)
        .where(
          or(
            like(customers.name, pattern),
            like(customers.company, pattern),
            like(customers.contactPerson, pattern),
            like(customers.email, pattern),
            like(customers.phone, pattern),
            like(customers.mobile, pattern),
            like(customers.city, pattern),
            like(customers.zip, pattern),
            like(customers.vatId, pattern),
          ),
        )
        .orderBy(desc(customers.updatedAt))
        .all();
    }

    return await db.select().from(customers).orderBy(desc(customers.updatedAt)).all();
  });

  app.get("/api/customers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await db.select().from(customers).where(eq(customers.id, id)).get();
    if (!row) return reply.code(404).send({ error: "Kunde nicht gefunden" });
    return row;
  });

  app.post("/api/customers", async (request, reply) => {
    const parsed = customerBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }

    const now = new Date();
    const row = {
      id: createId("cus"),
      ...mapCustomerInput(parsed.data),
      status: parsed.data.status ?? ("active" as const),
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(customers).values(row);
    return reply.code(201).send(row);
  });

  app.put("/api/customers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(customers).where(eq(customers.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Kunde nicht gefunden" });

    const parsed = customerBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }

    const updated = {
      ...mapCustomerInput(parsed.data),
      status: parsed.data.status ?? existing.status,
      updatedAt: new Date(),
    };

    await db.update(customers).set(updated).where(eq(customers.id, id));
    return { ...existing, ...updated };
  });

  app.delete("/api/customers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(customers).where(eq(customers.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Kunde nicht gefunden" });
    await db.delete(customers).where(eq(customers.id, id));
    return { ok: true };
  });

  app.get("/api/stats", async () => {
    const customerCount =
      (await db.select({ count: sql<number>`count(*)` }).from(customers).get())?.count ?? 0;

    const activeCount =
      (
        await db
          .select({ count: sql<number>`count(*)` })
          .from(customers)
          .where(eq(customers.status, "active"))
          .get()
      )?.count ?? 0;

    return { customerCount, activeCount };
  });
}
