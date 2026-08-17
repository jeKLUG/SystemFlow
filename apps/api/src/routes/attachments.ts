import { and, desc, eq, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { attachments, customers, fileFolders } from "../db/schema.js";
import { createId } from "../lib/id.js";
import { requireAuth } from "../plugins/auth.js";

const patchBody = z.object({
  originalName: z.string().min(1).max(300).optional(),
  description: z.string().max(2000).optional().nullable().or(z.literal("")),
  folderId: z.string().optional().nullable().or(z.literal("")),
});

function emptyToNull(value: string | null | undefined) {
  if (!value || !value.trim()) return null;
  return value.trim();
}

/**
 * Registriert Dateianhang-Routen inkl. Ordnerzuordnung.
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
        emailId: z.string().optional(),
        folderId: z.string().optional(),
      })
      .parse(request.query);

    const customer = await db.select().from(customers).where(eq(customers.id, customerId)).get();
    if (!customer) return reply.code(404).send({ error: "Kunde nicht gefunden" });

    const conditions = [eq(attachments.customerId, customerId)];
    if (q.documentId) conditions.push(eq(attachments.documentId, q.documentId));
    if (q.assetId) conditions.push(eq(attachments.assetId, q.assetId));
    if (q.emailId) conditions.push(eq(attachments.emailId, q.emailId));
    if (q.folderId === "root" || q.folderId === "") {
      conditions.push(isNull(attachments.folderId));
    } else if (q.folderId) {
      conditions.push(eq(attachments.folderId, q.folderId));
    }

    return await db
      .select()
      .from(attachments)
      .where(and(...conditions))
      .orderBy(desc(attachments.createdAt))
      .all();
  });

  app.post("/api/customers/:customerId/attachments", async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    const customer = await db.select().from(customers).where(eq(customers.id, customerId)).get();
    if (!customer) return reply.code(404).send({ error: "Kunde nicht gefunden" });

    let documentId: string | null = null;
    let assetId: string | null = null;
    let emailId: string | null = null;
    let folderId: string | null = null;
    let description: string | null = null;
    let uploaded: {
      filename: string;
      mimetype: string;
      bytesRead: number;
      storedName: string;
    } | null = null;

    for await (const part of request.parts()) {
      if (part.type === "file") {
        if (uploaded) {
          // Nur erste Datei – Rest verwerfen
          part.file.resume();
          continue;
        }
        const id = createId("att");
        const safeName = part.filename.replace(/[^\w.\-()+\säöüÄÖÜß]/gi, "_").slice(0, 180);
        const storedName = `${id}_${safeName}`;
        const target = join(uploadDir, storedName);
        await pipeline(part.file, createWriteStream(target));
        if (part.file.truncated) {
          await unlink(target).catch(() => undefined);
          return reply.code(400).send({ error: "Upload abgebrochen" });
        }
        uploaded = {
          filename: part.filename,
          mimetype: part.mimetype || "application/octet-stream",
          bytesRead: Number(part.file.bytesRead || 0),
          storedName,
        };
        // id steckt im storedName-Präfix – für DB separat merken
        (uploaded as { id?: string }).id = id;
      } else {
        const value = String(part.value ?? "").trim();
        if (part.fieldname === "documentId") documentId = value || null;
        else if (part.fieldname === "assetId") assetId = value || null;
        else if (part.fieldname === "emailId") emailId = value || null;
        else if (part.fieldname === "folderId") folderId = emptyToNull(value);
        else if (part.fieldname === "description") description = emptyToNull(value);
      }
    }

    if (!uploaded) return reply.code(400).send({ error: "Keine Datei hochgeladen" });

    if (folderId) {
      const folder = await db.select().from(fileFolders).where(eq(fileFolders.id, folderId)).get();
      if (!folder || folder.customerId !== customerId) {
        return reply.code(400).send({ error: "Ordner nicht gefunden" });
      }
    }

    // Wiki-/Anlagen-/Mail-Anhänge liegen nicht in der Ablage-Hierarchie
    if (documentId || assetId || emailId) folderId = null;

    const id =
      (uploaded as { id?: string }).id ??
      uploaded.storedName.split("_")[0] ??
      createId("att");
    const now = new Date();
    const row = {
      id,
      customerId,
      folderId,
      documentId,
      assetId,
      emailId,
      originalName: uploaded.filename,
      storedName: uploaded.storedName,
      mimeType: uploaded.mimetype || null,
      size: uploaded.bytesRead,
      description,
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(attachments).values(row);
    return reply.code(201).send(row);
  });

  app.put("/api/attachments/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(attachments).where(eq(attachments.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Anhang nicht gefunden" });

    const parsed = patchBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }

    let folderId = existing.folderId;
    if (parsed.data.folderId !== undefined) {
      folderId = emptyToNull(parsed.data.folderId);
      if (folderId) {
        const folder = await db.select().from(fileFolders).where(eq(fileFolders.id, folderId)).get();
        if (!folder || folder.customerId !== existing.customerId) {
          return reply.code(400).send({ error: "Ordner nicht gefunden" });
        }
      }
    }

    const updated = {
      originalName: parsed.data.originalName?.trim() ?? existing.originalName,
      description:
        parsed.data.description !== undefined
          ? emptyToNull(parsed.data.description)
          : existing.description,
      folderId: existing.documentId || existing.assetId || existing.emailId ? null : folderId,
      updatedAt: new Date(),
    };
    await db.update(attachments).set(updated).where(eq(attachments.id, id));
    return { ...existing, ...updated };
  });

  app.get("/api/attachments/:id/download", async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await db.select().from(attachments).where(eq(attachments.id, id)).get();
    if (!row) return reply.code(404).send({ error: "Anhang nicht gefunden" });

    const inline = (request.query as { inline?: string }).inline === "1";
    return reply
      .header("Content-Type", row.mimeType || "application/octet-stream")
      .header(
        "Content-Disposition",
        `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(row.originalName)}`,
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
