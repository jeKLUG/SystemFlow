import { desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { Db } from "../db/index.js";
import {
  attachments,
  customerEmails,
  customers,
  emailDirections,
} from "../db/schema.js";
import { createId } from "../lib/id.js";
import { requireAuth } from "../plugins/auth.js";
import { addActivity } from "./activities.js";

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
