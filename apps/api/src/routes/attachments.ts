import { desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { attachments, customers } from "../db/schema.js";
import { createId } from "../lib/id.js";
import { requireAuth } from "../plugins/auth.js";

/**
 * Registriert Dateianhang-Routen.
 */
export async function attachmentRoutes(
  app: FastifyInstance,
  db: Db,
  uploadDir: string,
) {
  app.addHook("preHandler", requireAuth);
  await mkdir(uploadDir, { recursive: true });

  app.get("/api/customers/:customerId/attachments", async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    const q = z
      .object({
        documentId: z.string().optional(),
        assetId: z.string().optional(),
      })
      .parse(request.query);

    const customer = await db.select().from(customers).where(eq(customers.id, customerId)).get();
    if (!customer) return reply.code(404).send({ error: "Kunde nicht gefunden" });

    let rows = await db
      .select()
      .from(attachments)
      .where(eq(attachments.customerId, customerId))
      .orderBy(desc(attachments.createdAt))
      .all();

    if (q.documentId) rows = rows.filter((r) => r.documentId === q.documentId);
    if (q.assetId) rows = rows.filter((r) => r.assetId === q.assetId);
    return rows;
  });

  app.post("/api/customers/:customerId/attachments", async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    const customer = await db.select().from(customers).where(eq(customers.id, customerId)).get();
    if (!customer) return reply.code(404).send({ error: "Kunde nicht gefunden" });

    const file = await request.file();
    if (!file) return reply.code(400).send({ error: "Keine Datei hochgeladen" });

    const documentId = (file.fields.documentId as { value?: string } | undefined)?.value ?? null;
    const assetId = (file.fields.assetId as { value?: string } | undefined)?.value ?? null;

    const id = createId("att");
    const safeName = file.filename.replace(/[^\w.\-()+\säöüÄÖÜß]/gi, "_").slice(0, 180);
    const storedName = `${id}_${safeName}`;
    const target = join(uploadDir, storedName);

    await pipeline(file.file, createWriteStream(target));
    if (file.file.truncated) {
      await unlink(target).catch(() => undefined);
      return reply.code(400).send({ error: "Upload abgebrochen" });
    }

    const now = new Date();
    const row = {
      id,
      customerId,
      documentId: documentId || null,
      assetId: assetId || null,
      originalName: file.filename,
      storedName,
      mimeType: file.mimetype || null,
      size: Number(file.file.bytesRead || 0),
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(attachments).values(row);
    return reply.code(201).send(row);
  });

  app.get("/api/attachments/:id/download", async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await db.select().from(attachments).where(eq(attachments.id, id)).get();
    if (!row) return reply.code(404).send({ error: "Anhang nicht gefunden" });

    return reply
      .header("Content-Type", row.mimeType || "application/octet-stream")
      .header(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(row.originalName)}`,
      )
      .send(createReadStream(join(uploadDir, row.storedName)));
  });

  app.delete("/api/attachments/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await db.select().from(attachments).where(eq(attachments.id, id)).get();
    if (!row) return reply.code(404).send({ error: "Anhang nicht gefunden" });

    await db.delete(attachments).where(eq(attachments.id, id));
    await unlink(join(uploadDir, row.storedName)).catch(() => undefined);
    return { ok: true };
  });
}
