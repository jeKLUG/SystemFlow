import { desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { customers, documents } from "../db/schema.js";
import { createId } from "../lib/id.js";
import { getTemplate } from "../lib/templates.js";
import { requireAuth } from "../plugins/auth.js";
import { addActivity } from "./activities.js";

const EMPTY_DOC = JSON.stringify({
  type: "doc",
  content: [{ type: "paragraph" }],
});

const createBody = z.object({
  customerId: z.string().min(1),
  type: z.enum(["note", "protocol", "documentation"]).optional(),
  title: z.string().min(1).max(300).optional(),
  content: z.string().optional(),
  templateId: z.string().optional(),
});

const updateBody = z.object({
  type: z.enum(["note", "protocol", "documentation"]).optional(),
  title: z.string().min(1).max(300).optional(),
  content: z.string().optional(),
});

/**
 * Registriert Dokument-Routen inkl. TipTap-Inhalt.
 */
export async function documentRoutes(app: FastifyInstance, db: Db) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/documents", async (request) => {
    const q = z
      .object({
        customerId: z.string().optional(),
        limit: z.coerce.number().int().positive().max(100).optional(),
      })
      .parse(request.query);

    if (q.customerId) {
      return await db
        .select()
        .from(documents)
        .where(eq(documents.customerId, q.customerId))
        .orderBy(desc(documents.updatedAt))
        .limit(q.limit ?? 50)
        .all();
    }

    return await db
      .select()
      .from(documents)
      .orderBy(desc(documents.updatedAt))
      .limit(q.limit ?? 50)
      .all();
  });

  app.get("/api/documents/recent", async () => {
    return await db
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
      .orderBy(desc(documents.updatedAt))
      .limit(8)
      .all();
  });

  app.get("/api/documents/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await db.select().from(documents).where(eq(documents.id, id)).get();
    if (!row) return reply.code(404).send({ error: "Dokument nicht gefunden" });
    return row;
  });

  app.post("/api/documents", async (request, reply) => {
    const parsed = createBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }

    const customer = await db
      .select()
      .from(customers)
      .where(eq(customers.id, parsed.data.customerId))
      .get();
    if (!customer) return reply.code(404).send({ error: "Kunde nicht gefunden" });

    const template = parsed.data.templateId ? getTemplate(parsed.data.templateId) : undefined;
    if (parsed.data.templateId && !template) {
      return reply.code(404).send({ error: "Vorlage nicht gefunden" });
    }

    const now = new Date();
    const title = (parsed.data.title ?? template?.title ?? "Unbenannt").trim();
    const type = parsed.data.type ?? template?.type ?? "note";
    const content = parsed.data.content ?? template?.content ?? EMPTY_DOC;

    const row = {
      id: createId("doc"),
      customerId: parsed.data.customerId,
      type,
      title,
      content,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(documents).values(row);
    await addActivity(
      db,
      parsed.data.customerId,
      `Dokument erstellt: ${title}`,
      template ? `Vorlage: ${template.name}` : null,
      now,
    );
    return reply.code(201).send(row);
  });

  app.put("/api/documents/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(documents).where(eq(documents.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Dokument nicht gefunden" });

    const parsed = updateBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }

    const updated = {
      type: parsed.data.type ?? existing.type,
      title: parsed.data.title?.trim() ?? existing.title,
      content: parsed.data.content ?? existing.content,
      updatedAt: new Date(),
    };

    await db.update(documents).set(updated).where(eq(documents.id, id));
    return { ...existing, ...updated };
  });

  app.delete("/api/documents/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(documents).where(eq(documents.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Dokument nicht gefunden" });
    await db.delete(documents).where(eq(documents.id, id));
    return { ok: true };
  });
}
