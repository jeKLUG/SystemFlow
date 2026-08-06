import { asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { attachments, customers, fileFolders } from "../db/schema.js";
import { createId } from "../lib/id.js";
import { requireAuth } from "../plugins/auth.js";

const folderBody = z.object({
  name: z.string().min(1).max(120),
  parentId: z.string().optional().nullable().or(z.literal("")),
});

function emptyToNull(value: string | null | undefined) {
  if (!value || !value.trim()) return null;
  return value.trim();
}

/**
 * Ordner-API für die Kunden-Dokumentenablage.
 */
export async function folderRoutes(app: FastifyInstance, db: Db) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/customers/:customerId/folders", async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    const customer = await db.select().from(customers).where(eq(customers.id, customerId)).get();
    if (!customer) return reply.code(404).send({ error: "Kunde nicht gefunden" });

    return await db
      .select()
      .from(fileFolders)
      .where(eq(fileFolders.customerId, customerId))
      .orderBy(asc(fileFolders.name))
      .all();
  });

  app.post("/api/customers/:customerId/folders", async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    const customer = await db.select().from(customers).where(eq(customers.id, customerId)).get();
    if (!customer) return reply.code(404).send({ error: "Kunde nicht gefunden" });

    const parsed = folderBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }

    const parentId = emptyToNull(parsed.data.parentId);
    if (parentId) {
      const parent = await db.select().from(fileFolders).where(eq(fileFolders.id, parentId)).get();
      if (!parent || parent.customerId !== customerId) {
        return reply.code(400).send({ error: "Überordner nicht gefunden" });
      }
    }

    const now = new Date();
    const row = {
      id: createId("fld"),
      customerId,
      parentId,
      name: parsed.data.name.trim(),
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(fileFolders).values(row);
    return reply.code(201).send(row);
  });

  app.put("/api/folders/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(fileFolders).where(eq(fileFolders.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Ordner nicht gefunden" });

    const parsed = folderBody.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }

    let parentId = existing.parentId;
    if (parsed.data.parentId !== undefined) {
      parentId = emptyToNull(parsed.data.parentId);
      if (parentId === id) {
        return reply.code(400).send({ error: "Ordner kann nicht in sich selbst liegen" });
      }
      if (parentId) {
        const parent = await db.select().from(fileFolders).where(eq(fileFolders.id, parentId)).get();
        if (!parent || parent.customerId !== existing.customerId) {
          return reply.code(400).send({ error: "Überordner nicht gefunden" });
        }
      }
    }

    const updated = {
      name: parsed.data.name?.trim() ?? existing.name,
      parentId,
      updatedAt: new Date(),
    };
    await db.update(fileFolders).set(updated).where(eq(fileFolders.id, id));
    return { ...existing, ...updated };
  });

  app.delete("/api/folders/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(fileFolders).where(eq(fileFolders.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Ordner nicht gefunden" });

    const childFolders = await db
      .select()
      .from(fileFolders)
      .where(eq(fileFolders.parentId, id))
      .all();
    if (childFolders.length > 0) {
      return reply.code(400).send({ error: "Ordner enthält Unterordner – bitte zuerst leeren" });
    }

    // Dateien in den Elternordner (oder Root) verschieben
    await db
      .update(attachments)
      .set({ folderId: existing.parentId, updatedAt: new Date() })
      .where(eq(attachments.folderId, id));

    await db.delete(fileFolders).where(eq(fileFolders.id, id));
    return { ok: true };
  });
}
