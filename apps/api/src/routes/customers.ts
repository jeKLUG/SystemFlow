import { and, asc, desc, eq, inArray, like, or, sql, type SQL } from "drizzle-orm";
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
  kind: z.enum(["contact", "customer"]).optional(),
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
 * Fehlende typische Kundenfelder nach Upgrade (Hinweise für die UI).
 */
function missingCustomerFields(row: {
  company: string | null;
  vatId: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
}): string[] {
  const missing: string[] = [];
  if (!row.company?.trim()) missing.push("Firma");
  if (!row.vatId?.trim()) missing.push("USt-IdNr.");
  if (!row.address?.trim()) missing.push("Adresse");
  if (!row.email?.trim()) missing.push("E-Mail");
  if (!row.phone?.trim()) missing.push("Telefon");
  return missing;
}

function buildCustomerWhere(opts: {
  term?: string;
  status?: "active" | "inactive" | "all";
  kind?: "contact" | "customer" | "all";
}): SQL | undefined {
  const parts: SQL[] = [];

  if (opts.status === "active" || opts.status === "inactive") {
    parts.push(eq(customers.status, opts.status));
  }

  if (opts.kind === "contact" || opts.kind === "customer") {
    parts.push(eq(customers.kind, opts.kind));
  }

  const term = opts.term?.trim();
  if (term) {
    const pattern = `%${term}%`;
    const search = or(
      like(customers.name, pattern),
      like(customers.company, pattern),
      like(customers.contactPerson, pattern),
      like(customers.email, pattern),
      like(customers.phone, pattern),
      like(customers.mobile, pattern),
      like(customers.city, pattern),
      like(customers.zip, pattern),
      like(customers.vatId, pattern),
      like(customers.notes, pattern),
    );
    if (search) parts.push(search);
  }

  if (parts.length === 0) return undefined;
  if (parts.length === 1) return parts[0];
  return and(...parts);
}

/**
 * Registriert Kontakt-/Kunden-CRUD-Routen (inkl. paginierter Suche).
 */
export async function customerRoutes(app: FastifyInstance, db: Db) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/customers", async (request) => {
    const q = z
      .object({
        q: z.string().optional(),
        status: z.enum(["active", "inactive", "all"]).optional(),
        kind: z.enum(["contact", "customer", "all"]).optional(),
        limit: z.coerce.number().int().positive().max(200).optional(),
        offset: z.coerce.number().int().nonnegative().optional(),
        sort: z.enum(["updated", "name"]).optional(),
        ids: z.string().optional(),
      })
      .parse(request.query);

    const limit = q.limit ?? 50;
    const offset = q.offset ?? 0;
    const status = q.status ?? "all";
    const kind = q.kind ?? "all";
    const sort = q.sort ?? "updated";

    // Gezielte IDs (z. B. Recent-Auswahl im Picker)
    if (q.ids?.trim()) {
      const idList = [
        ...new Set(
          q.ids
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        ),
      ].slice(0, 30);
      if (idList.length === 0) return { items: [], total: 0, limit, offset: 0 };
      const rows = await db.select().from(customers).where(inArray(customers.id, idList)).all();
      const map = new Map(rows.map((r) => [r.id, r]));
      const items = idList.map((id) => map.get(id)).filter(Boolean);
      return { items, total: items.length, limit, offset: 0 };
    }

    const where = buildCustomerWhere({ term: q.q, status, kind });

    const countQuery = db.select({ count: sql<number>`count(*)` }).from(customers);
    const totalRow = where
      ? await countQuery.where(where).get()
      : await countQuery.get();
    const total = Number(totalRow?.count ?? 0);

    const order =
      sort === "name"
        ? asc(sql`lower(coalesce(${customers.company}, ${customers.name}))`)
        : desc(customers.updatedAt);

    const base = db.select().from(customers);
    const items = where
      ? await base.where(where).orderBy(order).limit(limit).offset(offset).all()
      : await base.orderBy(order).limit(limit).offset(offset).all();

    return { items, total, limit, offset };
  });

  app.get("/api/customers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await db.select().from(customers).where(eq(customers.id, id)).get();
    if (!row) return reply.code(404).send({ error: "Kontakt nicht gefunden" });
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
      kind: parsed.data.kind ?? ("contact" as const),
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
    if (!existing) return reply.code(404).send({ error: "Kontakt nicht gefunden" });

    const parsed = customerBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }

    const updated = {
      ...mapCustomerInput(parsed.data),
      kind: parsed.data.kind ?? existing.kind,
      status: parsed.data.status ?? existing.status,
      updatedAt: new Date(),
    };

    await db.update(customers).set(updated).where(eq(customers.id, id));
    return { ...existing, ...updated };
  });

  /**
   * Wandelt einen Kontakt in einen Kunden um (kind → customer).
   * Liefert zusätzlich Hinweise zu fehlenden Stammdaten.
   */
  app.post("/api/customers/:id/promote", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(customers).where(eq(customers.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Kontakt nicht gefunden" });

    if (existing.kind === "customer") {
      return {
        customer: existing,
        alreadyCustomer: true,
        missing: missingCustomerFields(existing),
      };
    }

    const updatedAt = new Date();
    await db
      .update(customers)
      .set({ kind: "customer", updatedAt })
      .where(eq(customers.id, id));

    const customer = { ...existing, kind: "customer" as const, updatedAt };
    return {
      customer,
      alreadyCustomer: false,
      missing: missingCustomerFields(customer),
    };
  });

  app.delete("/api/customers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(customers).where(eq(customers.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Kontakt nicht gefunden" });
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
