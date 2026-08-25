import { desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { Db } from "../db/index.js";
import {
  attachments,
  customerEmails,
  customers,
  emailDirections,
} from "../db/schema.js";
import { parseEmlBuffer } from "../lib/eml.js";
import { createId } from "../lib/id.js";
import { requireAuth } from "../plugins/auth.js";
import { addActivity } from "./activities.js";

function safeFilename(name: string): string {
  return name.replace(/[^\w.\-()+\säöüÄÖÜß]/gi, "_").slice(0, 180) || "datei";
}

/**
 * Speichert einen Puffer als Kunden-Anhang (an eine E-Mail gebunden).
 */
async function storeEmailAttachment(
  db: Db,
  uploadDir: string,
  opts: {
    customerId: string;
    emailId: string;
    originalName: string;
    mimeType: string;
    content: Buffer;
    description?: string | null;
  },
) {
  await mkdir(uploadDir, { recursive: true });
  const id = createId("att");
  const storedName = `${id}_${safeFilename(opts.originalName)}`;
  await writeFile(join(uploadDir, storedName), opts.content);
  const now = new Date();
  const row = {
    id,
    customerId: opts.customerId,
    folderId: null as string | null,
    documentId: null as string | null,
    assetId: null as string | null,
    emailId: opts.emailId,
    originalName: opts.originalName.slice(0, 300),
    storedName,
    mimeType: opts.mimeType || null,
    size: opts.content.length,
    description: opts.description ?? null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(attachments).values(row);
  return row;
}

const optionalText = (max: number) => z.string().max(max).optional().or(z.literal(""));

const emailBody = z.object({
  subject: z.string().min(1).max(500),
  fromAddress: optionalText(320),
  toAddress: optionalText(1000),
  ccAddress: optionalText(1000),
  direction: z.enum(emailDirections).optional(),
  sentAt: z.string().min(4).max(40),
  bodyText: optionalText(100_000),
  notes: optionalText(5000),
});

function emptyToNull(value: string | undefined): string | null {
  const t = value?.trim();
  return t ? t : null;
}

function mapEmailFields(data: z.infer<typeof emailBody>) {
  return {
    subject: data.subject.trim(),
    fromAddress: emptyToNull(data.fromAddress),
    toAddress: emptyToNull(data.toAddress),
    ccAddress: emptyToNull(data.ccAddress),
    direction: data.direction ?? "inbound",
    sentAt: data.sentAt.trim(),
    bodyText: emptyToNull(data.bodyText),
    notes: emptyToNull(data.notes),
  };
}

/**
 * Registriert Kunden-E-Mail-Archiv (Mailverkehr ablegen).
 */
export async function emailRoutes(app: FastifyInstance, db: Db, uploadDir?: string) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/customers/:customerId/emails", async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    const q = z
      .object({
        q: z.string().optional(),
        direction: z.enum(emailDirections).optional(),
      })
      .parse(request.query);

    const customer = await db.select().from(customers).where(eq(customers.id, customerId)).get();
    if (!customer) return reply.code(404).send({ error: "Kunde nicht gefunden" });

    let rows = await db
      .select()
      .from(customerEmails)
      .where(eq(customerEmails.customerId, customerId))
      .orderBy(desc(customerEmails.sentAt), desc(customerEmails.createdAt))
      .all();

    if (q.direction) rows = rows.filter((r) => r.direction === q.direction);
    if (q.q?.trim()) {
      const needle = q.q.trim().toLowerCase();
      rows = rows.filter((r) => {
        const hay = [
          r.subject,
          r.fromAddress,
          r.toAddress,
          r.ccAddress,
          r.bodyText,
          r.notes,
        ]
          .filter(Boolean)
          .join("\n")
          .toLowerCase();
        return hay.includes(needle);
      });
    }

    const allAtt = await db
      .select()
      .from(attachments)
      .where(eq(attachments.customerId, customerId))
      .all();
    const countByEmail = new Map<string, number>();
    for (const a of allAtt) {
      if (!a.emailId) continue;
      countByEmail.set(a.emailId, (countByEmail.get(a.emailId) ?? 0) + 1);
    }

    return rows.map((r) => ({
      ...r,
      attachmentCount: countByEmail.get(r.id) ?? 0,
    }));
  });

  app.post("/api/customers/:customerId/emails", async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    const customer = await db.select().from(customers).where(eq(customers.id, customerId)).get();
    if (!customer) return reply.code(404).send({ error: "Kunde nicht gefunden" });

    const parsed = emailBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }

    const now = new Date();
    const row = {
      id: createId("eml"),
      customerId,
      ...mapEmailFields(parsed.data),
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(customerEmails).values(row);
    await addActivity(
      db,
      customerId,
      `E-Mail abgelegt: ${row.subject}`,
      [row.fromAddress, row.toAddress].filter(Boolean).join(" → ") || null,
    );
    return reply.code(201).send({ ...row, attachmentCount: 0 });
  });

  /**
   * Importiert eine oder mehrere .eml-Dateien: Felder parsen, Mail anlegen,
   * Original-.eml und eingebettete Dateianhänge speichern.
   */
  app.post("/api/customers/:customerId/emails/import", async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    const customer = await db.select().from(customers).where(eq(customers.id, customerId)).get();
    if (!customer) return reply.code(404).send({ error: "Kunde nicht gefunden" });
    if (!uploadDir) {
      return reply.code(500).send({ error: "Upload-Verzeichnis nicht konfiguriert" });
    }

    const files: { filename: string; buffer: Buffer }[] = [];
    for await (const part of request.parts()) {
      if (part.type !== "file") continue;
      const chunks: Buffer[] = [];
      for await (const chunk of part.file) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      if (part.file.truncated) {
        return reply.code(400).send({ error: "Upload abgebrochen" });
      }
      const filename = part.filename || "mail.eml";
      files.push({ filename, buffer: Buffer.concat(chunks) });
    }

    if (!files.length) {
      return reply.code(400).send({ error: "Keine .eml-Datei hochgeladen" });
    }

    const imported: Array<{
      id: string;
      subject: string;
      sentAt: string;
      direction: string;
      attachmentCount: number;
      sourceFilename: string;
    }> = [];
    const errors: Array<{ filename: string; error: string }> = [];

    for (const file of files) {
      const lower = file.filename.toLowerCase();
      if (lower.endsWith(".msg")) {
        errors.push({
          filename: file.filename,
          error: "Outlook-.msg wird nicht unterstützt – bitte als .eml speichern",
        });
        continue;
      }
      if (!lower.endsWith(".eml")) {
        errors.push({
          filename: file.filename,
          error: "Nur .eml-Dateien werden unterstützt",
        });
        continue;
      }
      if (!file.buffer.length) {
        errors.push({ filename: file.filename, error: "Leere Datei" });
        continue;
      }

      try {
        const parsed = await parseEmlBuffer(file.buffer, {
          customerEmail: customer.email,
        });
        const now = new Date();
        const emailId = createId("eml");
        const row = {
          id: emailId,
          customerId,
          subject: parsed.subject,
          fromAddress: emptyToNull(parsed.fromAddress),
          toAddress: emptyToNull(parsed.toAddress),
          ccAddress: emptyToNull(parsed.ccAddress),
          direction: parsed.direction,
          sentAt: parsed.sentAt,
          bodyText: emptyToNull(parsed.bodyText),
          notes: null as string | null,
          createdAt: now,
          updatedAt: now,
        };
        await db.insert(customerEmails).values(row);

        let attachmentCount = 0;
        await storeEmailAttachment(db, uploadDir, {
          customerId,
          emailId,
          originalName: file.filename.endsWith(".eml") ? file.filename : `${file.filename}.eml`,
          mimeType: "message/rfc822",
          content: file.buffer,
          description: "Original .eml",
        });
        attachmentCount += 1;

        for (const att of parsed.attachments) {
          await storeEmailAttachment(db, uploadDir, {
            customerId,
            emailId,
            originalName: att.filename,
            mimeType: att.contentType,
            content: att.content,
          });
          attachmentCount += 1;
        }

        await addActivity(
          db,
          customerId,
          `E-Mail importiert: ${row.subject}`,
          file.filename,
        );

        imported.push({
          id: emailId,
          subject: row.subject,
          sentAt: row.sentAt,
          direction: row.direction,
          attachmentCount,
          sourceFilename: file.filename,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Parse fehlgeschlagen";
        errors.push({ filename: file.filename, error: message });
      }
    }

    if (!imported.length) {
      return reply.code(400).send({
        error: "Kein Import möglich",
        imported: [],
        errors,
      });
    }

    return reply.code(201).send({
      imported,
      errors,
      count: imported.length,
    });
  });

  app.get("/api/emails/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await db.select().from(customerEmails).where(eq(customerEmails.id, id)).get();
    if (!row) return reply.code(404).send({ error: "E-Mail nicht gefunden" });

    const files = await db
      .select()
      .from(attachments)
      .where(eq(attachments.emailId, id))
      .orderBy(desc(attachments.createdAt))
      .all();

    return { ...row, attachmentCount: files.length, attachments: files };
  });

  app.put("/api/emails/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(customerEmails).where(eq(customerEmails.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "E-Mail nicht gefunden" });

    const parsed = emailBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }

    const now = new Date();
    const patch = mapEmailFields(parsed.data);
    await db
      .update(customerEmails)
      .set({ ...patch, updatedAt: now })
      .where(eq(customerEmails.id, id));

    const row = await db.select().from(customerEmails).where(eq(customerEmails.id, id)).get();
    const files = await db.select().from(attachments).where(eq(attachments.emailId, id)).all();
    return { ...row!, attachmentCount: files.length };
  });

  app.delete("/api/emails/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(customerEmails).where(eq(customerEmails.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "E-Mail nicht gefunden" });

    const files = await db.select().from(attachments).where(eq(attachments.emailId, id)).all();
    for (const file of files) {
      if (uploadDir) {
        await unlink(join(uploadDir, file.storedName)).catch(() => undefined);
      }
      await db.delete(attachments).where(eq(attachments.id, file.id));
    }

    await db.delete(customerEmails).where(eq(customerEmails.id, id));
    return { ok: true };
  });
}
