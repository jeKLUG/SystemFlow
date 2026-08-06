import { asc, desc, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { attachments, customers, documents } from "../db/schema.js";
import { createId } from "../lib/id.js";
import { getTemplate } from "../lib/templates.js";
import { buildWikiPdf, type WikiPdfImageResolver } from "../lib/wiki-pdf.js";
import { requireAuth } from "../plugins/auth.js";
import { addActivity } from "./activities.js";

const EMPTY_DOC = JSON.stringify({
  type: "doc",
  content: [{ type: "paragraph" }],
});

const wikiTypes = z.enum(["note", "protocol", "documentation", "article", "workflow"]);

const createBody = z.object({
  customerId: z.string().min(1),
  type: wikiTypes.optional(),
  title: z.string().min(1).max(300).optional(),
  content: z.string().optional(),
  templateId: z.string().optional(),
  projectId: z.string().optional().nullable().or(z.literal("")),
  assetId: z.string().optional().nullable().or(z.literal("")),
});

const updateBody = z.object({
  type: wikiTypes.optional(),
  title: z.string().min(1).max(300).optional(),
  content: z.string().optional(),
  projectId: z.string().optional().nullable().or(z.literal("")),
  assetId: z.string().optional().nullable().or(z.literal("")),
});

function emptyToNull(value: string | null | undefined) {
  if (!value || !value.trim()) return null;
  return value.trim();
}

function pdfFilename(base: string): string {
  const safe = base.replace(/[^\w\-äöüÄÖÜß]+/gi, "_").replace(/_+/g, "_").slice(0, 80);
  return `${safe || "wiki"}.pdf`;
}

function sendPdf(reply: import("fastify").FastifyReply, buffer: Buffer, filename: string) {
  return reply
    .header("Content-Type", "application/pdf")
    .header("Content-Disposition", `attachment; filename="${filename}"`)
    .send(buffer);
}

/** Sammelt Attachment-IDs aus TipTap-Inhalten und liefert einen Pfad-Resolver. */
async function createImageResolver(
  db: Db,
  uploadDir: string,
  contents: string[],
): Promise<WikiPdfImageResolver> {
  const ids = new Set<string>();
  for (const raw of contents) {
    for (const match of raw.matchAll(/\/api\/attachments\/([A-Za-z0-9_-]+)/g)) {
      ids.add(match[1]!);
    }
  }
  const map = new Map<string, string>();
  if (ids.size > 0) {
    const rows = await db
      .select()
      .from(attachments)
      .where(inArray(attachments.id, [...ids]))
      .all();
    for (const row of rows) {
      const path = join(uploadDir, row.storedName);
      if (existsSync(path)) map.set(row.id, path);
    }
  }
  return (src: string) => {
    const m = /\/api\/attachments\/([A-Za-z0-9_-]+)/.exec(src);
    if (!m) return null;
    return map.get(m[1]!) ?? null;
  };
}

/**
 * Registriert Wiki-/Dokument-Routen inkl. TipTap-Inhalt und PDF-Export.
 */
export async function documentRoutes(app: FastifyInstance, db: Db, uploadDir: string) {
  app.addHook("preHandler", requireAuth);

  /** Alle Wiki-Seiten eines Kunden als ein PDF. */
  app.get("/api/customers/:customerId/wiki/pdf", async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    const customer = await db.select().from(customers).where(eq(customers.id, customerId)).get();
    if (!customer) return reply.code(404).send({ error: "Kunde nicht gefunden" });

    const docs = await db
      .select()
      .from(documents)
      .where(eq(documents.customerId, customerId))
      .orderBy(asc(documents.title))
      .all();

    const resolveImage = await createImageResolver(
      db,
      uploadDir,
      docs.map((d) => d.content),
    );

    const buffer = await buildWikiPdf(
      { name: customer.name, company: customer.company },
      docs.map((d) => ({
        title: d.title,
        type: d.type,
        content: d.content,
        updatedAt: d.updatedAt,
        createdAt: d.createdAt,
      })),
      { resolveImage },
    );

    const label = customer.company || customer.name;
    return sendPdf(reply, buffer, pdfFilename(`Wiki_${label}`));
  });

  app.get("/api/documents", async (request) => {
    const q = z
      .object({
        customerId: z.string().optional(),
        type: wikiTypes.optional(),
        projectId: z.string().optional(),
        assetId: z.string().optional(),
        limit: z.coerce.number().int().positive().max(200).optional(),
      })
      .parse(request.query);

    if (q.customerId) {
      let rows = await db
        .select()
        .from(documents)
        .where(eq(documents.customerId, q.customerId))
        .orderBy(desc(documents.updatedAt))
        .limit(q.limit ?? 100)
        .all();
      if (q.type) rows = rows.filter((r) => r.type === q.type);
      if (q.projectId) rows = rows.filter((r) => r.projectId === q.projectId);
      if (q.assetId) rows = rows.filter((r) => r.assetId === q.assetId);
      return rows;
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

  /** Einzelne Wiki-Seite als PDF. */
  app.get("/api/documents/:id/pdf", async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await db.select().from(documents).where(eq(documents.id, id)).get();
    if (!row) return reply.code(404).send({ error: "Dokument nicht gefunden" });

    const customer = await db
      .select()
      .from(customers)
      .where(eq(customers.id, row.customerId))
      .get();
    if (!customer) return reply.code(404).send({ error: "Kunde nicht gefunden" });

    const buffer = await buildWikiPdf(
      { name: customer.name, company: customer.company },
      [
        {
          title: row.title,
          type: row.type,
          content: row.content,
          updatedAt: row.updatedAt,
          createdAt: row.createdAt,
        },
      ],
      { resolveImage: await createImageResolver(db, uploadDir, [row.content]) },
    );

    return sendPdf(reply, buffer, pdfFilename(row.title));
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
      projectId: emptyToNull(parsed.data.projectId),
      assetId: emptyToNull(parsed.data.assetId),
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
      `Wiki-Seite erstellt: ${title}`,
      template ? `Vorlage: ${template.name}` : `Typ: ${type}`,
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
      projectId:
        parsed.data.projectId !== undefined
          ? emptyToNull(parsed.data.projectId)
          : existing.projectId,
      assetId:
        parsed.data.assetId !== undefined ? emptyToNull(parsed.data.assetId) : existing.assetId,
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
