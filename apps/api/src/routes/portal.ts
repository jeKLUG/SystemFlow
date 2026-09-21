import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createReadStream } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { contractorPartyLines, customerPartyLines } from "../lib/orgAddress.js";
import type { Db } from "../db/index.js";
import {
  attachments,
  assets,
  contracts,
  customers,
  customerUsers,
  documents,
  fileFolders,
  orgSettings,
  ticketMessages,
  tickets,
  ticketPriorities,
  type TicketPriority,
  type TicketStatus,
} from "../db/schema.js";
import { createId } from "../lib/id.js";
import { addDaysIso, isoInAppZone, todayIso } from "../lib/dates.js";
import { isVaultFile, publicFolder, sharedFolderIds } from "../lib/portalVault.js";
import {
  findActiveContract,
  nextTicketNumber,
  slaFlags,
  slaFromContract,
} from "../lib/tickets.js";
import { saveFirstUpload } from "../lib/uploads.js";
import { richTextHasContent } from "../lib/richtext.js";
import { requirePortal } from "../plugins/auth.js";
import { addActivity } from "./activities.js";
import { notifyTicketComment, notifyTicketCreated } from "../lib/notify.js";
import { isEmail } from "../lib/mail.js";
import {
  mailCustomerKinds,
  parseCustomerMailNotify,
  parseMailNotify,
  type CustomerMailNotify,
} from "../lib/mailNotify.js";

const createBody = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(50000).optional().nullable().or(z.literal("")),
  priority: z.enum(ticketPriorities).optional(),
});

const messageBody = z.object({
  body: z.string().min(1).max(50000),
});

function emptyToNull(value: string | null | undefined) {
  if (!value || !value.trim()) return null;
  return value.trim();
}

function publicContract(row: typeof contracts.$inferSelect) {
  const { notes: _notes, ...rest } = row;
  return rest;
}

/**
 * Inventar fürs Portal: ohne interne Notizen und ohne Warnungs-Konfiguration.
 * `monitoringEnabled` bleibt, damit sichtbar ist, ob das Gerät überwacht wird.
 */
function publicAsset(row: typeof assets.$inferSelect) {
  const {
    notes: _notes,
    monitoringAlertEnabled: _ma,
    monitoringAlertsJson: _mj,
    ...rest
  } = row;
  return rest;
}

function publicFile(row: typeof attachments.$inferSelect) {
  return {
    id: row.id,
    customerId: row.customerId,
    folderId: row.folderId,
    originalName: row.originalName,
    mimeType: row.mimeType,
    size: row.size,
    description: row.description,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Kundenportal-API: nur eigene Daten, ohne interne Felder.
 */
export async function portalRoutes(app: FastifyInstance, db: Db, uploadDir: string) {
  app.addHook("preHandler", requirePortal(db));

  /** Portal-Start: Kennzahlen, Ticket-Verteilungen und letzte Tickets. */
  app.get("/api/portal/overview", async (request) => {
    const { customerId } = request.portal!;
    const customer = await db.select().from(customers).where(eq(customers.id, customerId)).get();
    const ticketRows = await db.select().from(tickets).where(eq(tickets.customerId, customerId)).all();
    const now = new Date();
    const openTickets = ticketRows.filter((t) =>
      t.status === "open" || t.status === "in_progress" || t.status === "waiting_customer",
    );
    const waitingOnCustomer = ticketRows.filter((t) => t.status === "waiting_customer").length;
    const slaBreached = openTickets.filter((t) => slaFlags(t, now).slaBreached).length;
    const docCount = (
      await db
        .select()
        .from(documents)
        .where(and(eq(documents.customerId, customerId), eq(documents.portalVisible, true)))
        .all()
    ).length;
    const assetCount = (
      await db
        .select()
        .from(assets)
        .where(and(eq(assets.customerId, customerId), eq(assets.portalVisible, true)))
        .all()
    ).length;
    const contractCount = (
      await db
        .select()
        .from(contracts)
        .where(
          and(eq(contracts.customerId, customerId), inArray(contracts.status, ["active", "paused"])),
        )
        .all()
    ).length;

    const vaultFolders = await db.select().from(fileFolders).where(eq(fileFolders.customerId, customerId)).all();
    const sharedFolders = sharedFolderIds(vaultFolders);
    const vaultFiles = (
      await db
        .select()
        .from(attachments)
        .where(and(eq(attachments.customerId, customerId), isNull(attachments.emailId), isNull(attachments.ticketId)))
        .all()
    ).filter(isVaultFile);
    const fileCount = vaultFiles.filter(
      (f) => f.portalVisible || (f.folderId ? sharedFolders.has(f.folderId) : false),
    ).length;

    const ticketsByStatus: Record<TicketStatus, number> = {
      open: 0,
      in_progress: 0,
      waiting_customer: 0,
      resolved: 0,
      closed: 0,
    };
    const ticketsByPriority: Record<TicketPriority, number> = {
      low: 0,
      normal: 0,
      high: 0,
      critical: 0,
    };
    for (const row of ticketRows) {
      ticketsByStatus[row.status] += 1;
    }
    for (const row of openTickets) {
      ticketsByPriority[row.priority] += 1;
    }

    const today = todayIso();
    const ticketsWeek = Array.from({ length: 7 }, (_, i) => {
      const date = addDaysIso(today, i - 6);
      return {
        date,
        count: ticketRows.filter((row) => isoInAppZone(row.createdAt) === date).length,
      };
    });

    const recentTickets = [...ticketRows]
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, 3)
      .map((row) => ({
        id: row.id,
        number: row.number,
        title: row.title,
        status: row.status,
        priority: row.priority,
        updatedAt: row.updatedAt,
      }));

    return {
      customerName: customer?.company || customer?.name || "",
      contactPerson: customer?.contactPerson ?? null,
      email: customer?.email ?? null,
      phone: customer?.phone ?? null,
      openTicketCount: openTickets.length,
      waitingOnCustomer,
      slaBreachedCount: slaBreached,
      documentCount: docCount + fileCount,
      wikiCount: docCount,
      fileCount,
      assetCount,
      contractCount,
      ticketsByStatus,
      ticketsByPriority,
      ticketsWeek,
      recentTickets,
    };
  });

  app.get("/api/portal/tickets", async (request) => {
    const { customerId } = request.portal!;
    const rows = await db
      .select()
      .from(tickets)
      .where(eq(tickets.customerId, customerId))
      .orderBy(desc(tickets.updatedAt))
      .all();
    return rows.map((t) => ({ ...t, ...slaFlags(t) }));
  });

  app.get("/api/portal/tickets/:id", async (request, reply) => {
    const { customerId } = request.portal!;
    const { id } = request.params as { id: string };
    const ticket = await db.select().from(tickets).where(eq(tickets.id, id)).get();
    if (!ticket || ticket.customerId !== customerId) {
      return reply.code(404).send({ error: "Ticket nicht gefunden" });
    }
    const messages = await db
      .select()
      .from(ticketMessages)
      .where(and(eq(ticketMessages.ticketId, ticket.id), eq(ticketMessages.visibility, "public")))
      .orderBy(asc(ticketMessages.createdAt))
      .all();
    const files = await db
      .select()
      .from(attachments)
      .where(eq(attachments.ticketId, ticket.id))
      .orderBy(desc(attachments.createdAt))
      .all();
    return { ...ticket, ...slaFlags(ticket), messages, attachments: files };
  });

  app.post("/api/portal/tickets", async (request, reply) => {
    const { customerId, userId } = request.portal!;
    const parsed = createBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }

    const now = new Date();
    const priority = parsed.data.priority ?? "normal";
    const contract = await findActiveContract(db, customerId, null);
    const sla = slaFromContract(contract, priority, now);
    const description = richTextHasContent(parsed.data.description)
      ? emptyToNull(parsed.data.description)
      : null;

    const row = {
      id: createId("tkt"),
      number: await nextTicketNumber(db),
      customerId,
      title: parsed.data.title.trim(),
      description,
      status: "open" as TicketStatus,
      priority,
      source: "portal" as const,
      contractId: sla.contractId,
      createdByRole: "customer" as const,
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

    await addActivity(db, customerId, `Ticket ${row.number} vom Portal`, row.title, now);
    await notifyTicketCreated(db, row);
    return reply.code(201).send({ ...row, ...slaFlags(row), messages: [], attachments: [] });
  });

  app.post("/api/portal/tickets/:id/messages", async (request, reply) => {
    const { customerId, userId } = request.portal!;
    const { id } = request.params as { id: string };
    const ticket = await db.select().from(tickets).where(eq(tickets.id, id)).get();
    if (!ticket || ticket.customerId !== customerId) {
      return reply.code(404).send({ error: "Ticket nicht gefunden" });
    }
    if (ticket.status === "closed") {
      return reply.code(400).send({ error: "Geschlossene Tickets können nicht beantwortet werden" });
    }

    const parsed = messageBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }
    if (!richTextHasContent(parsed.data.body)) {
      return reply.code(400).send({ error: "Nachricht darf nicht leer sein" });
    }

    const now = new Date();
    const message = {
      id: createId("tmsg"),
      ticketId: ticket.id,
      visibility: "public" as const,
      kind: "comment" as const,
      authorRole: "customer" as const,
      authorUserId: userId,
      body: parsed.data.body.trim(),
      createdAt: now,
    };
    await db.insert(ticketMessages).values(message);

    const nextStatus: TicketStatus =
      ticket.status === "waiting_customer" || ticket.status === "resolved" ? "in_progress" : ticket.status;
    await db
      .update(tickets)
      .set({
        status: nextStatus,
        resolvedAt: nextStatus === "in_progress" ? null : ticket.resolvedAt,
        closedAt: null,
        updatedAt: now,
      })
      .where(eq(tickets.id, id));

    await notifyTicketComment(db, { ...ticket, status: nextStatus, updatedAt: now }, parsed.data.body.trim(), "customer");

    return reply.code(201).send(message);
  });

  app.post("/api/portal/tickets/:id/attachments", async (request, reply) => {
    const { customerId } = request.portal!;
    const { id } = request.params as { id: string };
    const ticket = await db.select().from(tickets).where(eq(tickets.id, id)).get();
    if (!ticket || ticket.customerId !== customerId) {
      return reply.code(404).send({ error: "Ticket nicht gefunden" });
    }

    let uploaded;
    try {
      ({ uploaded } = await saveFirstUpload(request, uploadDir));
    } catch {
      return reply.code(400).send({ error: "Upload abgebrochen" });
    }
    if (!uploaded) return reply.code(400).send({ error: "Keine Datei hochgeladen" });

    const now = new Date();
    const row = {
      id: uploaded.id,
      customerId,
      folderId: null,
      documentId: null,
      assetId: null,
      emailId: null,
      ticketId: ticket.id,
      ticketMessageId: null,
      originalName: uploaded.filename,
      storedName: uploaded.storedName,
      mimeType: uploaded.mimetype,
      size: uploaded.bytesRead,
      description: null,
      portalVisible: false,
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(attachments).values(row);
    await db.update(tickets).set({ updatedAt: now }).where(eq(tickets.id, id));
    return reply.code(201).send(row);
  });

  app.get("/api/portal/attachments/:id/download", async (request, reply) => {
    const { customerId } = request.portal!;
    const { id } = request.params as { id: string };
    const row = await db.select().from(attachments).where(eq(attachments.id, id)).get();
    if (!row || row.customerId !== customerId) {
      return reply.code(404).send({ error: "Anhang nicht gefunden" });
    }

    let allowed = Boolean(row.portalVisible);
    if (!allowed && row.ticketId) {
      const ticket = await db.select().from(tickets).where(eq(tickets.id, row.ticketId)).get();
      allowed = Boolean(ticket && ticket.customerId === customerId);
    } else if (!allowed && row.documentId) {
      const doc = await db.select().from(documents).where(eq(documents.id, row.documentId)).get();
      allowed = Boolean(doc && doc.customerId === customerId && doc.portalVisible);
    } else if (!allowed && row.assetId) {
      const asset = await db.select().from(assets).where(eq(assets.id, row.assetId)).get();
      allowed = Boolean(asset && asset.customerId === customerId && asset.portalVisible);
    } else if (!allowed && row.folderId && isVaultFile(row)) {
      const folders = await db.select().from(fileFolders).where(eq(fileFolders.customerId, customerId)).all();
      allowed = sharedFolderIds(folders).has(row.folderId);
    }
    if (!allowed) return reply.code(404).send({ error: "Anhang nicht gefunden" });

    const inline = (request.query as { inline?: string }).inline === "1";
    return reply
      .header("Content-Type", row.mimeType || "application/octet-stream")
      .header(
        "Content-Disposition",
        `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(row.originalName)}`,
      )
      .send(createReadStream(join(uploadDir, row.storedName)));
  });

  app.get("/api/portal/contracts", async (request) => {
    const { customerId } = request.portal!;
    const rows = await db
      .select()
      .from(contracts)
      .where(eq(contracts.customerId, customerId))
      .orderBy(desc(contracts.updatedAt))
      .all();
    const [org, customer] = await Promise.all([
      db.select().from(orgSettings).where(eq(orgSettings.id, "default")).get(),
      db.select().from(customers).where(eq(customers.id, customerId)).get(),
    ]);
    return {
      contractor: contractorPartyLines(org),
      customer: customer ? customerPartyLines(customer) : [],
      items: rows.filter((c) => c.status === "active" || c.status === "paused").map(publicContract),
    };
  });

  app.get("/api/portal/documents", async (request) => {
    const { customerId } = request.portal!;
    return await db
      .select()
      .from(documents)
      .where(and(eq(documents.customerId, customerId), eq(documents.portalVisible, true)))
      .orderBy(asc(documents.title))
      .all();
  });

  app.get("/api/portal/documents/:id", async (request, reply) => {
    const { customerId } = request.portal!;
    const { id } = request.params as { id: string };
    const row = await db.select().from(documents).where(eq(documents.id, id)).get();
    if (!row || row.customerId !== customerId || !row.portalVisible) {
      return reply.code(404).send({ error: "Dokument nicht gefunden" });
    }
    return {
      ...row,
      content: row.content.replaceAll("/api/attachments/", "/api/portal/attachments/"),
    };
  });

  app.get("/api/portal/files", async (request) => {
    const { customerId } = request.portal!;
    const folders = await db.select().from(fileFolders).where(eq(fileFolders.customerId, customerId)).all();
    const shared = sharedFolderIds(folders);
    const rows = await db
      .select()
      .from(attachments)
      .where(and(eq(attachments.customerId, customerId), isNull(attachments.emailId), isNull(attachments.ticketId)))
      .orderBy(desc(attachments.updatedAt))
      .all();
    return rows
      .filter((row) => row.portalVisible || (isVaultFile(row) && row.folderId != null && shared.has(row.folderId)))
      .map(publicFile);
  });

  app.get("/api/portal/folders", async (request) => {
    const { customerId } = request.portal!;
    const folders = await db
      .select()
      .from(fileFolders)
      .where(eq(fileFolders.customerId, customerId))
      .orderBy(asc(fileFolders.name))
      .all();
    const shared = sharedFolderIds(folders);
    return folders.filter((folder) => shared.has(folder.id)).map(publicFolder);
  });

  app.get("/api/portal/assets", async (request) => {
    const { customerId } = request.portal!;
    const rows = await db
      .select()
      .from(assets)
      .where(and(eq(assets.customerId, customerId), eq(assets.portalVisible, true)))
      .orderBy(desc(assets.updatedAt))
      .all();
    return rows.map(publicAsset);
  });

  app.get("/api/portal/account", async (request) => {
    const { userId } = request.portal!;
    const row = await db.select().from(customerUsers).where(eq(customerUsers.id, userId)).get();
    const org = await db.select().from(orgSettings).where(eq(orgSettings.id, "default")).get();
    const global = parseMailNotify(org?.mailNotifyJson);
    const notify = parseCustomerMailNotify(row?.mailNotifyJson);
    const allowed = Object.fromEntries(
      mailCustomerKinds.map((kind) => [kind, global.customer[kind]]),
    ) as Record<(typeof mailCustomerKinds)[number], boolean>;
    return {
      email: row?.email ?? "",
      notify,
      allowed,
    };
  });

  /** Nur E-Mail. `notify` im Body wird ignoriert (Typen setzt nur Staff). */
  app.put("/api/portal/account", async (request, reply) => {
    const { userId } = request.portal!;
    const parsed = z
      .object({
        email: z.string().max(200).optional().nullable(),
        notify: z.record(z.boolean()).optional(),
      })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }
    const row = await db.select().from(customerUsers).where(eq(customerUsers.id, userId)).get();
    if (!row) return reply.code(401).send({ error: "Nicht angemeldet" });
    const email = parsed.data.email !== undefined ? (parsed.data.email?.trim() || null) : row.email;
    if (email && !isEmail(email)) return reply.code(400).send({ error: "E-Mail-Adresse ungültig" });
    await db
      .update(customerUsers)
      .set({ email, updatedAt: new Date() })
      .where(eq(customerUsers.id, userId));
    const notify = parseCustomerMailNotify(row.mailNotifyJson);
    const org = await db.select().from(orgSettings).where(eq(orgSettings.id, "default")).get();
    const global = parseMailNotify(org?.mailNotifyJson);
    const allowed = Object.fromEntries(
      mailCustomerKinds.map((kind) => [kind, global.customer[kind]]),
    ) as CustomerMailNotify;
    return { email: email ?? "", notify, allowed };
  });
}
