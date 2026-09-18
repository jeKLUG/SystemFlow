import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createReadStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { Db } from "../db/index.js";
import {
  attachments,
  customers,
  tasks,
  ticketMessages,
  tickets,
  timeEntries,
  ticketPriorities,
  ticketStatuses,
  type Ticket,
  type TicketMessage,
  type TicketPriority,
  type TicketStatus,
} from "../db/schema.js";
import { createId } from "../lib/id.js";
import { todayIso } from "../lib/dates.js";
import {
  findActiveContract,
  isOpenStatus,
  nextTicketNumber,
  slaFlags,
  slaFromContract,
  timestampsForStatus,
} from "../lib/tickets.js";
import { richTextHasContent } from "../lib/richtext.js";
import { saveFirstUpload } from "../lib/uploads.js";
import { requireAdmin } from "../plugins/auth.js";
import { addActivity } from "./activities.js";
import { unlinkDeletedMonitoringTicket } from "../lib/monitoring.js";
import { notifyTicketComment, notifyTicketCreated, notifyTicketStatus } from "../lib/notify.js";

const createBody = z.object({
  customerId: z.string().min(1),
  title: z.string().min(1).max(300),
  description: z.string().max(50000).optional().nullable().or(z.literal("")),
  priority: z.enum(ticketPriorities).optional(),
  contractId: z.string().optional().nullable().or(z.literal("")),
});

const patchBody = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(50000).optional().nullable().or(z.literal("")),
  status: z.enum(ticketStatuses).optional(),
  priority: z.enum(ticketPriorities).optional(),
  contractId: z.string().optional().nullable().or(z.literal("")),
  resolution: z.string().max(50000).optional().nullable().or(z.literal("")),
});

const messageBody = z.object({
  body: z.string().min(1).max(50000),
  visibility: z.enum(["public", "internal"]).optional(),
});

const taskFromTicketBody = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(5000).optional().nullable().or(z.literal("")),
  dueDate: z.string().max(40).optional().nullable().or(z.literal("")),
  priority: z.number().int().min(1).max(4).optional(),
});

const timeFromTicketBody = z.object({
  workDate: z.string().min(1).max(40).optional(),
  hours: z.number().positive().max(24),
  description: z.string().max(5000).optional().nullable().or(z.literal("")),
});

function emptyToNull(value: string | null | undefined) {
  if (!value || !value.trim()) return null;
  return value.trim();
}

function mapTicket(
  ticket: Ticket,
  extra: {
    customerName?: string | null;
    customerCompany?: string | null;
    messages?: TicketMessage[];
    attachments?: (typeof attachments.$inferSelect)[];
    linkedTaskCount?: number;
    linkedTimeCount?: number;
  } = {},
) {
  const flags = slaFlags(ticket);
  return {
    ...ticket,
    ...flags,
    customerName: extra.customerName ?? null,
    customerCompany: extra.customerCompany ?? null,
    messages: extra.messages,
    attachments: extra.attachments,
    linkedTaskCount: extra.linkedTaskCount ?? 0,
    linkedTimeCount: extra.linkedTimeCount ?? 0,
  };
}

async function loadTicketExtras(db: Db, ticket: Ticket, includeInternal: boolean) {
  const customer = await db.select().from(customers).where(eq(customers.id, ticket.customerId)).get();
  const messageRows = await db
    .select()
    .from(ticketMessages)
    .where(eq(ticketMessages.ticketId, ticket.id))
    .orderBy(asc(ticketMessages.createdAt))
    .all();
  const messages = includeInternal
    ? messageRows
    : messageRows.filter((m) => m.visibility === "public");
  const files = await db
    .select()
    .from(attachments)
    .where(eq(attachments.ticketId, ticket.id))
    .orderBy(desc(attachments.createdAt))
    .all();
  const linkedTaskCount =
    (await db.select({ count: sql<number>`count(*)` }).from(tasks).where(eq(tasks.ticketId, ticket.id)).get())
      ?.count ?? 0;
  const linkedTimeCount =
    (
      await db
        .select({ count: sql<number>`count(*)` })
        .from(timeEntries)
        .where(eq(timeEntries.ticketId, ticket.id))
        .get()
    )?.count ?? 0;
  return mapTicket(ticket, {
    customerName: customer?.name ?? null,
    customerCompany: customer?.company ?? null,
    messages,
    attachments: files,
    linkedTaskCount: Number(linkedTaskCount) || 0,
    linkedTimeCount: Number(linkedTimeCount) || 0,
  });
}

/**
 * Staff-Helpdesk: Tickets listen, anlegen, beantworten, löschen, Aufgabe/Zeit verknüpfen.
 */
export async function ticketRoutes(app: FastifyInstance, db: Db, uploadDir: string) {
  app.addHook("preHandler", requireAdmin);

  app.get("/api/tickets/stats", async () => {
    const rows = await db.select().from(tickets).all();
    const now = new Date();
    let openCount = 0;
    let waitingCount = 0;
    let slaBreachedCount = 0;
    for (const row of rows) {
      if (isOpenStatus(row.status)) openCount += 1;
      if (row.status === "waiting_customer") waitingCount += 1;
      if (slaFlags(row, now).slaBreached) slaBreachedCount += 1;
    }
    return { openCount, waitingCount, slaBreachedCount };
  });

  app.get("/api/tickets", async (request) => {
    const q = z
      .object({
        customerId: z.string().optional(),
        status: z.enum([...ticketStatuses, "open_any"]).optional(),
        priority: z.enum(ticketPriorities).optional(),
        slaBreached: z.enum(["1", "true"]).optional(),
        limit: z.coerce.number().int().positive().max(500).optional(),
      })
      .parse(request.query);

    const conditions = [];
    if (q.customerId) conditions.push(eq(tickets.customerId, q.customerId));
    if (q.status === "open_any") {
      conditions.push(inArray(tickets.status, ["open", "in_progress", "waiting_customer"]));
    } else if (q.status) {
      conditions.push(eq(tickets.status, q.status));
    }
    if (q.priority) conditions.push(eq(tickets.priority, q.priority));

    const base = db
      .select({
        ticket: tickets,
        customerName: customers.name,
        customerCompany: customers.company,
      })
      .from(tickets)
      .innerJoin(customers, eq(tickets.customerId, customers.id));

    const rows = (
      conditions.length
        ? await base.where(and(...conditions)).orderBy(desc(tickets.updatedAt)).limit(q.limit ?? 200).all()
        : await base.orderBy(desc(tickets.updatedAt)).limit(q.limit ?? 200).all()
    );

    const now = new Date();
    let mapped = rows.map((r) =>
      mapTicket(r.ticket, { customerName: r.customerName, customerCompany: r.customerCompany }),
    );
    if (q.slaBreached) mapped = mapped.filter((t) => slaFlags(t, now).slaBreached);
    return mapped;
  });

  app.get("/api/tickets/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const ticket = await db.select().from(tickets).where(eq(tickets.id, id)).get();
    if (!ticket) return reply.code(404).send({ error: "Ticket nicht gefunden" });
    return loadTicketExtras(db, ticket, true);
  });

  app.post("/api/tickets", async (request, reply) => {
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

    const userId = request.session.get("userId")!;
    const now = new Date();
    const priority: TicketPriority = parsed.data.priority ?? "normal";
    const contract = await findActiveContract(db, customer.id, emptyToNull(parsed.data.contractId));
    const sla = slaFromContract(contract, priority, now);
    const description = emptyToNull(parsed.data.description);

    const row = {
      id: createId("tkt"),
      number: await nextTicketNumber(db),
      customerId: customer.id,
      title: parsed.data.title.trim(),
      description,
      status: "open" as TicketStatus,
      priority,
      source: "staff" as const,
      contractId: sla.contractId,
      createdByRole: "admin" as const,
      createdByUserId: userId,
      firstResponseAt: null,
      resolvedAt: null,
      closedAt: null,
      slaResponseDueAt: sla.slaResponseDueAt,
      slaResolveDueAt: sla.slaResolveDueAt,
      resolution: null,
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(tickets).values(row);

    await addActivity(db, customer.id, `Ticket ${row.number} angelegt`, row.title, now);
    await notifyTicketCreated(db, row);
    return reply.code(201).send(await loadTicketExtras(db, row, true));
  });

  app.put("/api/tickets/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(tickets).where(eq(tickets.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Ticket nicht gefunden" });

    const parsed = patchBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }

    const now = new Date();
    const status = parsed.data.status ?? existing.status;
    const priority = parsed.data.priority ?? existing.priority;
    const times = timestampsForStatus(status, existing, now);
    const resolution =
      parsed.data.resolution !== undefined ? emptyToNull(parsed.data.resolution) : existing.resolution;

    if (
      (status === "closed" || status === "resolved") &&
      existing.status !== status &&
      !richTextHasContent(resolution)
    ) {
      return reply.code(400).send({ error: "Bitte die Lösung dokumentieren, bevor das Ticket geschlossen wird." });
    }

    let slaResponseDueAt = existing.slaResponseDueAt;
    let slaResolveDueAt = existing.slaResolveDueAt;
    let contractId =
      parsed.data.contractId !== undefined
        ? emptyToNull(parsed.data.contractId)
        : existing.contractId;
    if (parsed.data.priority || parsed.data.contractId !== undefined) {
      const contract = await findActiveContract(db, existing.customerId, contractId);
      const sla = slaFromContract(contract, priority, existing.createdAt);
      contractId = sla.contractId;
      slaResponseDueAt = sla.slaResponseDueAt;
      slaResolveDueAt = sla.slaResolveDueAt;
    }

    const updated = {
      title: parsed.data.title?.trim() ?? existing.title,
      description:
        parsed.data.description !== undefined
          ? emptyToNull(parsed.data.description)
          : existing.description,
      status,
      priority,
      contractId,
      slaResponseDueAt,
      slaResolveDueAt,
      resolvedAt: times.resolvedAt,
      closedAt: times.closedAt,
      resolution,
      updatedAt: now,
    };
    await db.update(tickets).set(updated).where(eq(tickets.id, id));

    if (
      (status === "closed" || status === "resolved") &&
      existing.status !== status
    ) {
      if (richTextHasContent(resolution) && resolution !== existing.resolution) {
        await db.insert(ticketMessages).values({
          id: createId("tmsg"),
          ticketId: existing.id,
          visibility: "public",
          kind: "resolution",
          authorRole: "admin",
          authorUserId: request.session.get("userId")!,
          body: resolution as string,
          createdAt: now,
        });
      }
      await addActivity(
        db,
        existing.customerId,
        `Ticket ${existing.number} ${status === "closed" ? "geschlossen" : "gelöst"}`,
        updated.title,
        now,
      );
    }

    const next = { ...existing, ...updated };
    if (existing.status !== status) {
      await notifyTicketStatus(db, next, existing.status, status);
    }
    return loadTicketExtras(db, next, true);
  });

  app.delete("/api/tickets/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(tickets).where(eq(tickets.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Ticket nicht gefunden" });

    const now = new Date();
    const files = await db.select().from(attachments).where(eq(attachments.ticketId, id)).all();
    await db.update(tasks).set({ ticketId: null, updatedAt: now }).where(eq(tasks.ticketId, id));
    await db.update(timeEntries).set({ ticketId: null, updatedAt: now }).where(eq(timeEntries.ticketId, id));
    await db.delete(attachments).where(eq(attachments.ticketId, id));
    await db.delete(ticketMessages).where(eq(ticketMessages.ticketId, id));
    await unlinkDeletedMonitoringTicket(db, id);
    await db.delete(tickets).where(eq(tickets.id, id));
    for (const file of files) {
      await unlink(join(uploadDir, file.storedName)).catch(() => undefined);
    }
    await addActivity(db, existing.customerId, `Ticket ${existing.number} gelöscht`, existing.title, now);
    return { ok: true };
  });

  app.post("/api/tickets/:id/messages", async (request, reply) => {
    const { id } = request.params as { id: string };
    const ticket = await db.select().from(tickets).where(eq(tickets.id, id)).get();
    if (!ticket) return reply.code(404).send({ error: "Ticket nicht gefunden" });

    const parsed = messageBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }
    if (!richTextHasContent(parsed.data.body)) {
      return reply.code(400).send({ error: "Nachricht darf nicht leer sein" });
    }

    const userId = request.session.get("userId")!;
    const now = new Date();
    const visibility = parsed.data.visibility ?? "public";
    const message = {
      id: createId("tmsg"),
      ticketId: ticket.id,
      visibility,
      kind: "comment" as const,
      authorRole: "admin" as const,
      authorUserId: userId,
      body: parsed.data.body.trim(),
      createdAt: now,
    };
    await db.insert(ticketMessages).values(message);

    const patch: Partial<Ticket> = { updatedAt: now };
    if (visibility === "public") {
      if (!ticket.firstResponseAt) patch.firstResponseAt = now;
      if (ticket.status === "open") patch.status = "in_progress";
    }
    await db.update(tickets).set(patch).where(eq(tickets.id, id));

    if (visibility === "public") {
      await notifyTicketComment(db, { ...ticket, ...patch }, parsed.data.body.trim(), "admin");
    }

    return reply.code(201).send(message);
  });

  app.post("/api/tickets/:id/attachments", async (request, reply) => {
    const { id } = request.params as { id: string };
    const ticket = await db.select().from(tickets).where(eq(tickets.id, id)).get();
    if (!ticket) return reply.code(404).send({ error: "Ticket nicht gefunden" });

    let uploaded;
    let fields: Record<string, string>;
    try {
      ({ uploaded, fields } = await saveFirstUpload(request, uploadDir));
    } catch {
      return reply.code(400).send({ error: "Upload abgebrochen" });
    }
    if (!uploaded) return reply.code(400).send({ error: "Keine Datei hochgeladen" });

    const now = new Date();
    const row = {
      id: uploaded.id,
      customerId: ticket.customerId,
      folderId: null,
      documentId: null,
      assetId: null,
      emailId: null,
      ticketId: ticket.id,
      ticketMessageId: emptyToNull(fields.messageId),
      originalName: uploaded.filename,
      storedName: uploaded.storedName,
      mimeType: uploaded.mimetype,
      size: uploaded.bytesRead,
      description: emptyToNull(fields.description),
      portalVisible: false,
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(attachments).values(row);
    await db.update(tickets).set({ updatedAt: now }).where(eq(tickets.id, id));
    return reply.code(201).send(row);
  });

  app.get("/api/tickets/:id/attachments/:attachmentId/download", async (request, reply) => {
    const { id, attachmentId } = request.params as { id: string; attachmentId: string };
    const row = await db.select().from(attachments).where(eq(attachments.id, attachmentId)).get();
    if (!row || row.ticketId !== id) return reply.code(404).send({ error: "Anhang nicht gefunden" });
    const inline = (request.query as { inline?: string }).inline === "1";
    return reply
      .header("Content-Type", row.mimeType || "application/octet-stream")
      .header(
        "Content-Disposition",
        `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(row.originalName)}`,
      )
      .send(createReadStream(join(uploadDir, row.storedName)));
  });

  app.post("/api/tickets/:id/task", async (request, reply) => {
    const { id } = request.params as { id: string };
    const ticket = await db.select().from(tickets).where(eq(tickets.id, id)).get();
    if (!ticket) return reply.code(404).send({ error: "Ticket nicht gefunden" });

    const parsed = taskFromTicketBody.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }

    const now = new Date();
    const row = {
      id: createId("tsk"),
      customerId: ticket.customerId,
      projectId: null,
      title: (parsed.data.title ?? `${ticket.number}: ${ticket.title}`).trim(),
      description:
        emptyToNull(parsed.data.description) ??
        `Aus Ticket ${ticket.number}\n${ticket.description ?? ""}`.trim(),
      dueDate: emptyToNull(parsed.data.dueDate),
      priority: parsed.data.priority ?? (ticket.priority === "critical" || ticket.priority === "high" ? 1 : 4),
      sortOrder: 0,
      done: false,
      ticketId: ticket.id,
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(tasks).values(row);
    return reply.code(201).send(row);
  });

  app.post("/api/tickets/:id/time-entry", async (request, reply) => {
    const { id } = request.params as { id: string };
    const ticket = await db.select().from(tickets).where(eq(tickets.id, id)).get();
    if (!ticket) return reply.code(404).send({ error: "Ticket nicht gefunden" });

    const parsed = timeFromTicketBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }

    const now = new Date();
    const row = {
      id: createId("time"),
      customerId: ticket.customerId,
      projectId: null,
      priceItemId: null,
      workDate: parsed.data.workDate || todayIso(),
      startTime: null,
      endTime: null,
      hours: parsed.data.hours,
      description:
        emptyToNull(parsed.data.description) ?? `Ticket ${ticket.number}: ${ticket.title}`,
      billable: true,
      readyForInvoice: false,
      billed: false,
      rateSnapshot: null,
      amountSnapshot: null,
      ticketId: ticket.id,
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(timeEntries).values(row);
    await addActivity(
      db,
      ticket.customerId,
      `Zeit erfasst: ${row.hours}h (Ticket ${ticket.number})`,
      row.description,
      now,
    );
    return reply.code(201).send(row);
  });
}
