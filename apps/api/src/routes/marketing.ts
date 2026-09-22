import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import {
  customers,
  marketingLeads,
  marketingLists,
  marketingSends,
  marketingTemplates,
  orgSettings,
  type MarketingLead,
  type MarketingSend,
  type MarketingSendKind,
} from "../db/schema.js";
import { createId } from "../lib/id.js";
import { loadMailPublic, mailReady, sendMail } from "../lib/mail.js";
import {
  buildMarketingMail,
  createUnsubToken,
  leadStatus,
  listSendStats,
  normalizeEmail,
  sanitizeSignatureHtml,
  sendInfoFromRows,
  skipReason,
  skipReasonLabel,
  type MarketingSkipReason,
} from "../lib/marketing.js";
import { requireAuth } from "../plugins/auth.js";

const SETTINGS_ID = "default";
const SEND_PAUSE_MS = 300;

const optionalText = (max: number) => z.string().max(max).optional().or(z.literal(""));

const listBody = z.object({
  name: z.string().min(1).max(200),
});

const templateBody = z.object({
  name: z.string().min(1).max(200),
  kind: z.enum(["first", "reminder"]),
  subject: z.string().min(1).max(300),
  body: z.string().min(1).max(20_000),
  ctaUrl: optionalText(500),
  ctaLabel: optionalText(80),
});

const leadBody = z.object({
  listId: z.string().min(1),
  email: z.string().email(),
  company: z.string().min(1).max(200),
  contactPerson: optionalText(200),
});

const leadPatch = z.object({
  listId: z.string().min(1).optional(),
  email: z.string().email().optional(),
  company: z.string().min(1).max(200).optional(),
  contactPerson: optionalText(200),
});

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function emptyToNull(value: string | null | undefined): string | null {
  if (!value || !value.trim()) return null;
  return value.trim();
}

function sendsByLead(rows: MarketingSend[]): Map<string, MarketingSend[]> {
  const map = new Map<string, MarketingSend[]>();
  for (const row of rows) {
    const list = map.get(row.leadId) ?? [];
    list.push(row);
    map.set(row.leadId, list);
  }
  return map;
}

function viewLead(lead: MarketingLead, sends: MarketingSend[], now = Date.now()) {
  const info = sendInfoFromRows(sends);
  return {
    ...lead,
    status: leadStatus(lead, info, now),
    firstSentAt: info.firstSentAt,
    reminderSentAt: info.reminderSentAt,
  };
}

function emptyListStats() {
  return {
    hasSends: false,
    sentCount: 0,
    reminderCount: 0,
    firstSentAt: null as Date | null,
    reminderSentAt: null as Date | null,
    lastSentAt: null as Date | null,
  };
}

/**
 * Liste inkl. Empfängerzahl, fälliger Erinnerungen und Versandstatistik.
 */
function viewList(
  list: typeof marketingLists.$inferSelect,
  members: {
    id: string;
    customerId: string | null;
    repliedAt: Date | null;
    doNotContact: boolean;
  }[],
  sendMap: Map<string, MarketingSend[]>,
  now = Date.now(),
) {
  let dueCount = 0;
  const listSends: MarketingSend[] = [];
  for (const lead of members) {
    const rows = sendMap.get(lead.id) ?? [];
    listSends.push(...rows);
    if (leadStatus(lead, sendInfoFromRows(rows), now) === "reminder_due") dueCount += 1;
  }
  const stats = listSendStats(listSends);
  return {
    ...list,
    leadCount: members.length,
    dueCount,
    ...stats,
  };
}

async function listHasSuccessfulSends(db: Db, listId: string): Promise<boolean> {
  const leadIds = (
    await db.select({ id: marketingLeads.id }).from(marketingLeads).where(eq(marketingLeads.listId, listId)).all()
  ).map((row) => row.id);
  if (leadIds.length === 0) return false;
  const row = await db
    .select({ id: marketingSends.id })
    .from(marketingSends)
    .where(and(inArray(marketingSends.leadId, leadIds), eq(marketingSends.ok, true)))
    .get();
  return Boolean(row);
}

async function archiveListAfterSend(db: Db, listId: string) {
  const existing = await db.select().from(marketingLists).where(eq(marketingLists.id, listId)).get();
  if (!existing || existing.archivedAt) return;
  await db.update(marketingLists).set({ archivedAt: new Date() }).where(eq(marketingLists.id, listId));
}

async function loadSendsForLeads(db: Db, leadIds: string[]): Promise<Map<string, MarketingSend[]>> {
  if (leadIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(marketingSends)
    .where(inArray(marketingSends.leadId, leadIds))
    .all();
  return sendsByLead(rows);
}

async function customerEmailSet(db: Db): Promise<Set<string>> {
  const rows = await db.select({ email: customers.email }).from(customers).all();
  const set = new Set<string>();
  for (const row of rows) {
    const email = normalizeEmail(row.email ?? "");
    if (email) set.add(email);
  }
  return set;
}

async function loadOrg(db: Db) {
  return db.select().from(orgSettings).where(eq(orgSettings.id, SETTINGS_ID)).get();
}

/**
 * Öffentliche Abmeldung (ohne Login). GET setzt `doNotContact`.
 */
export async function marketingPublicRoutes(app: FastifyInstance, db: Db) {
  app.get("/api/public/marketing/unsubscribe/:token", async (request, reply) => {
    const { token } = request.params as { token: string };
    if (!token || token.length < 16 || token.length > 80) {
      return reply.code(404).send({ ok: false, error: "Link nicht gefunden" });
    }
    const lead = await db
      .select()
      .from(marketingLeads)
      .where(eq(marketingLeads.unsubToken, token))
      .get();
    if (!lead) {
      return reply.code(404).send({ error: "Link nicht gefunden" });
    }
    if (!lead.doNotContact) {
      await db
        .update(marketingLeads)
        .set({ doNotContact: true, updatedAt: new Date() })
        .where(eq(marketingLeads.id, lead.id));
    }
    return { ok: true, company: lead.company, already: lead.doNotContact };
  });
}

/**
 * Staff-CRUD und Versand für Marketing-Listen, Leads und Textbausteine.
 */
export async function marketingRoutes(app: FastifyInstance, db: Db) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/marketing/signature", async () => {
    const org = await loadOrg(db);
    return { html: org?.marketingSignatureHtml ?? "" };
  });

  app.put("/api/marketing/signature", async (request, reply) => {
    const parsed = z.object({ html: z.string().max(80_000) }).safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe" });
    }
    const html = sanitizeSignatureHtml(parsed.data.html);
    const org = await loadOrg(db);
    const now = new Date();
    if (!org) {
      await db.insert(orgSettings).values({
        id: SETTINGS_ID,
        currency: "EUR",
        mailNotifyJson: "{}",
        smtpSecure: "starttls",
        marketingSignatureHtml: html || null,
        updatedAt: now,
      });
    } else {
      await db
        .update(orgSettings)
        .set({ marketingSignatureHtml: html || null, updatedAt: now })
        .where(eq(orgSettings.id, SETTINGS_ID));
    }
    return { html };
  });

  app.get("/api/marketing/lists", async () => {
    const lists = await db.select().from(marketingLists).orderBy(asc(marketingLists.name)).all();
    const leads = await db
      .select({
        id: marketingLeads.id,
        listId: marketingLeads.listId,
        customerId: marketingLeads.customerId,
        repliedAt: marketingLeads.repliedAt,
        doNotContact: marketingLeads.doNotContact,
      })
      .from(marketingLeads)
      .all();
    const sendMap = await loadSendsForLeads(
      db,
      leads.map((l) => l.id),
    );
    const now = Date.now();
    const views = lists.map((list) => viewList(list, leads.filter((l) => l.listId === list.id), sendMap, now));
    views.sort((a, b) => {
      const ar = Number(Boolean(a.archivedAt)) - Number(Boolean(b.archivedAt));
      if (ar !== 0) return ar;
      if (a.archivedAt && b.archivedAt) {
        const aKey = new Date(a.lastSentAt ?? a.archivedAt).getTime();
        const bKey = new Date(b.lastSentAt ?? b.archivedAt).getTime();
        return bKey - aKey;
      }
      return a.name.localeCompare(b.name, "de");
    });
    return views;
  });

  app.post("/api/marketing/lists", async (request, reply) => {
    const parsed = listBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }
    const now = new Date();
    const row = { id: createId("mlist"), name: parsed.data.name.trim(), createdAt: now, archivedAt: null };
    await db.insert(marketingLists).values(row);
    return reply.code(201).send({ ...row, leadCount: 0, dueCount: 0, ...emptyListStats() });
  });

  app.put("/api/marketing/lists/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(marketingLists).where(eq(marketingLists.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Liste nicht gefunden" });
    const parsed = listBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }
    await db.update(marketingLists).set({ name: parsed.data.name.trim() }).where(eq(marketingLists.id, id));
    return { ...existing, name: parsed.data.name.trim() };
  });

  app.delete("/api/marketing/lists/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(marketingLists).where(eq(marketingLists.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Liste nicht gefunden" });
    if (existing.archivedAt || (await listHasSuccessfulSends(db, id))) {
      return reply.code(409).send({
        error: "Versendete Listen bleiben im Archiv und können nicht gelöscht werden",
      });
    }
    await db.delete(marketingLists).where(eq(marketingLists.id, id));
    return { ok: true };
  });

  app.post("/api/marketing/lists/:id/archive", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(marketingLists).where(eq(marketingLists.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Liste nicht gefunden" });
    if (!existing.archivedAt) {
      await db.update(marketingLists).set({ archivedAt: new Date() }).where(eq(marketingLists.id, id));
    }
    const updated = await db.select().from(marketingLists).where(eq(marketingLists.id, id)).get();
    return updated;
  });

  app.post("/api/marketing/lists/:id/unarchive", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(marketingLists).where(eq(marketingLists.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Liste nicht gefunden" });
    if (existing.archivedAt) {
      await db.update(marketingLists).set({ archivedAt: null }).where(eq(marketingLists.id, id));
    }
    const updated = await db.select().from(marketingLists).where(eq(marketingLists.id, id)).get();
    return updated;
  });

  app.get("/api/marketing/templates", async (request) => {
    const q = z.object({ kind: z.enum(["first", "reminder"]).optional() }).safeParse(request.query);
    const kind = q.success ? q.data.kind : undefined;
    const rows = kind
      ? await db
          .select()
          .from(marketingTemplates)
          .where(eq(marketingTemplates.kind, kind))
          .orderBy(asc(marketingTemplates.name))
          .all()
      : await db.select().from(marketingTemplates).orderBy(asc(marketingTemplates.name)).all();
    return rows;
  });

  app.post("/api/marketing/templates", async (request, reply) => {
    const parsed = templateBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }
    const now = new Date();
    const row = {
      id: createId("mtpl"),
      name: parsed.data.name.trim(),
      kind: parsed.data.kind,
      subject: parsed.data.subject.trim(),
      body: parsed.data.body.trim(),
      ctaUrl: emptyToNull(parsed.data.ctaUrl),
      ctaLabel: emptyToNull(parsed.data.ctaLabel),
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(marketingTemplates).values(row);
    return reply.code(201).send(row);
  });

  app.put("/api/marketing/templates/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(marketingTemplates).where(eq(marketingTemplates.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Textbaustein nicht gefunden" });
    const parsed = templateBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }
    const updated = {
      name: parsed.data.name.trim(),
      kind: parsed.data.kind,
      subject: parsed.data.subject.trim(),
      body: parsed.data.body.trim(),
      ctaUrl: emptyToNull(parsed.data.ctaUrl),
      ctaLabel: emptyToNull(parsed.data.ctaLabel),
      updatedAt: new Date(),
    };
    await db.update(marketingTemplates).set(updated).where(eq(marketingTemplates.id, id));
    return { ...existing, ...updated };
  });

  app.delete("/api/marketing/templates/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(marketingTemplates).where(eq(marketingTemplates.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Textbaustein nicht gefunden" });
    await db.delete(marketingTemplates).where(eq(marketingTemplates.id, id));
    return { ok: true };
  });

  app.get("/api/marketing/leads", async (request, reply) => {
    const q = z.object({ listId: z.string().min(1) }).safeParse(request.query);
    if (!q.success) return reply.code(400).send({ error: "listId fehlt" });
    const leads = await db
      .select()
      .from(marketingLeads)
      .where(eq(marketingLeads.listId, q.data.listId))
      .orderBy(asc(marketingLeads.company))
      .all();
    const sendMap = await loadSendsForLeads(
      db,
      leads.map((l) => l.id),
    );
    const now = Date.now();
    return leads.map((lead) => viewLead(lead, sendMap.get(lead.id) ?? [], now));
  });

  app.post("/api/marketing/leads", async (request, reply) => {
    const parsed = leadBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }
    const list = await db
      .select()
      .from(marketingLists)
      .where(eq(marketingLists.id, parsed.data.listId))
      .get();
    if (!list) return reply.code(404).send({ error: "Liste nicht gefunden" });
    if (list.archivedAt) {
      return reply.code(409).send({ error: "Archivierte Listen nehmen keine neuen Empfänger auf" });
    }
    const email = normalizeEmail(parsed.data.email);
    const dup = await db.select().from(marketingLeads).where(eq(marketingLeads.email, email)).get();
    if (dup) return reply.code(409).send({ error: "Diese E-Mail ist bereits als Lead erfasst" });
    const now = new Date();
    const row: MarketingLead = {
      id: createId("mlead"),
      listId: parsed.data.listId,
      email,
      company: parsed.data.company.trim(),
      contactPerson: emptyToNull(parsed.data.contactPerson),
      repliedAt: null,
      replyNote: null,
      doNotContact: false,
      customerId: null,
      unsubToken: createUnsubToken(),
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(marketingLeads).values(row);
    return reply.code(201).send(viewLead(row, [], now.getTime()));
  });

  app.put("/api/marketing/leads/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(marketingLeads).where(eq(marketingLeads.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Lead nicht gefunden" });
    const parsed = leadPatch.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }
    if (parsed.data.listId && parsed.data.listId !== existing.listId) {
      const list = await db
        .select()
        .from(marketingLists)
        .where(eq(marketingLists.id, parsed.data.listId))
        .get();
      if (!list) return reply.code(404).send({ error: "Liste nicht gefunden" });
      if (list.archivedAt) {
        return reply.code(409).send({ error: "Archivierte Listen nehmen keine neuen Empfänger auf" });
      }
    }
    const email = parsed.data.email ? normalizeEmail(parsed.data.email) : existing.email;
    if (email !== existing.email) {
      const dup = await db.select().from(marketingLeads).where(eq(marketingLeads.email, email)).get();
      if (dup) return reply.code(409).send({ error: "Diese E-Mail ist bereits als Lead erfasst" });
    }
    const updated = {
      listId: parsed.data.listId ?? existing.listId,
      email,
      company: parsed.data.company?.trim() ?? existing.company,
      contactPerson:
        parsed.data.contactPerson !== undefined
          ? emptyToNull(parsed.data.contactPerson)
          : existing.contactPerson,
      updatedAt: new Date(),
    };
    await db.update(marketingLeads).set(updated).where(eq(marketingLeads.id, id));
    const sendMap = await loadSendsForLeads(db, [id]);
    return viewLead({ ...existing, ...updated }, sendMap.get(id) ?? []);
  });

  app.delete("/api/marketing/leads/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(marketingLeads).where(eq(marketingLeads.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Lead nicht gefunden" });
    const sent = await db
      .select({ id: marketingSends.id })
      .from(marketingSends)
      .where(and(eq(marketingSends.leadId, id), eq(marketingSends.ok, true)))
      .get();
    if (sent) {
      return reply.code(409).send({
        error: "Versendete Empfänger bleiben in der Liste (Versandhistorie)",
      });
    }
    await db.delete(marketingLeads).where(eq(marketingLeads.id, id));
    return { ok: true };
  });

  app.post("/api/marketing/leads/:id/replied", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(marketingLeads).where(eq(marketingLeads.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Lead nicht gefunden" });
    const parsed = z.object({ note: optionalText(2000) }).safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe" });
    }
    const updated = {
      repliedAt: existing.repliedAt ?? new Date(),
      replyNote: emptyToNull(parsed.data.note) ?? existing.replyNote,
      updatedAt: new Date(),
    };
    await db.update(marketingLeads).set(updated).where(eq(marketingLeads.id, id));
    const sendMap = await loadSendsForLeads(db, [id]);
    return viewLead({ ...existing, ...updated }, sendMap.get(id) ?? []);
  });

  app.post("/api/marketing/leads/:id/unreplied", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(marketingLeads).where(eq(marketingLeads.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Lead nicht gefunden" });
    const updated = { repliedAt: null as Date | null, replyNote: null as string | null, updatedAt: new Date() };
    await db.update(marketingLeads).set(updated).where(eq(marketingLeads.id, id));
    const sendMap = await loadSendsForLeads(db, [id]);
    return viewLead({ ...existing, ...updated }, sendMap.get(id) ?? []);
  });

  app.post("/api/marketing/leads/:id/do-not-contact", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(marketingLeads).where(eq(marketingLeads.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Lead nicht gefunden" });
    const parsed = z.object({ value: z.boolean() }).safeParse(request.body ?? {});
    const value = parsed.success ? parsed.data.value : true;
    const updated = { doNotContact: value, updatedAt: new Date() };
    await db.update(marketingLeads).set(updated).where(eq(marketingLeads.id, id));
    const sendMap = await loadSendsForLeads(db, [id]);
    return viewLead({ ...existing, ...updated }, sendMap.get(id) ?? []);
  });

  app.post("/api/marketing/leads/:id/convert", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.select().from(marketingLeads).where(eq(marketingLeads.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "Lead nicht gefunden" });
    if (existing.customerId) {
      const customer = await db.select().from(customers).where(eq(customers.id, existing.customerId)).get();
      return { lead: existing, customer, linked: true };
    }
    const now = new Date();
    const emailMatch =
      (
        await db
          .select()
          .from(customers)
          .where(sql`lower(${customers.email}) = ${existing.email}`)
          .all()
      )[0] ?? null;
    let customer = emailMatch;
    if (!customer) {
      customer = {
        id: createId("cus"),
        name: existing.company || existing.contactPerson || existing.email,
        company: existing.company,
        contactPerson: existing.contactPerson,
        email: existing.email,
        phone: null,
        mobile: null,
        address: null,
        zip: null,
        city: null,
        country: null,
        vatId: null,
        website: null,
        notes: existing.replyNote,
        kind: "contact",
        status: "active",
        createdAt: now,
        updatedAt: now,
      };
      await db.insert(customers).values(customer);
    }
    const updated = { customerId: customer.id, repliedAt: existing.repliedAt ?? now, updatedAt: now };
    await db.update(marketingLeads).set(updated).where(eq(marketingLeads.id, id));
    const sendMap = await loadSendsForLeads(db, [id]);
    return {
      lead: viewLead({ ...existing, ...updated }, sendMap.get(id) ?? []),
      customer,
      linked: Boolean(emailMatch),
    };
  });

  app.get("/api/marketing/preview", async (request, reply) => {
    const q = z
      .object({
        listId: z.string().min(1),
        kind: z.enum(["first", "reminder"]),
      })
      .safeParse(request.query);
    if (!q.success) return reply.code(400).send({ error: "listId und kind nötig" });
    const preview = await buildPreview(db, q.data.listId, q.data.kind);
    if (!preview) return reply.code(404).send({ error: "Liste nicht gefunden" });
    return preview;
  });

  app.post("/api/marketing/send", async (request, reply) => {
    return runCampaign(db, request, reply, "first");
  });

  app.post("/api/marketing/remind", async (request, reply) => {
    return runCampaign(db, request, reply, "reminder");
  });

  app.post("/api/marketing/test", async (request, reply) => {
    const parsed = z
      .object({
        templateId: z.string().min(1),
        listId: z.string().min(1).optional(),
      })
      .safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "templateId fehlt" });
    const settings = await loadMailPublic(db);
    if (!mailReady(settings)) {
      return reply.code(400).send({ error: "E-Mail ist nicht eingerichtet (Konto → SMTP)" });
    }
    const inbox = settings.mailStaffInbox.trim();
    if (!inbox) {
      return reply.code(400).send({ error: "Staff-Sammeladresse fehlt (Konto → E-Mail)" });
    }
    const template = await db
      .select()
      .from(marketingTemplates)
      .where(eq(marketingTemplates.id, parsed.data.templateId))
      .get();
    if (!template) return reply.code(404).send({ error: "Textbaustein nicht gefunden" });
    let sample = {
      company: "Muster GmbH",
      contactPerson: "Max Mustermann" as string | null,
      email: inbox,
      unsubToken: "test",
    };
    if (parsed.data.listId) {
      const lead = await db
        .select()
        .from(marketingLeads)
        .where(eq(marketingLeads.listId, parsed.data.listId))
        .orderBy(asc(marketingLeads.company))
        .get();
      if (lead) {
        sample = {
          company: lead.company,
          contactPerson: lead.contactPerson,
          email: inbox,
          unsubToken: lead.unsubToken,
        };
      }
    }
    const org = await loadOrg(db);
    const mail = buildMarketingMail({
      template,
      lead: sample,
      org,
      brand: settings.mailFromName,
      publicUrl: settings.mailPublicUrl,
    });
    const ok = await sendMail(db, { ...mail, to: inbox, subject: `[Test] ${mail.subject}` });
    if (!ok) return reply.code(500).send({ error: "Testmail konnte nicht gesendet werden" });
    return { ok: true, to: inbox };
  });
}

async function buildPreview(db: Db, listId: string, kind: MarketingSendKind) {
  const list = await db.select().from(marketingLists).where(eq(marketingLists.id, listId)).get();
  if (!list) return null;
  const leads = await db.select().from(marketingLeads).where(eq(marketingLeads.listId, listId)).all();
  const sendMap = await loadSendsForLeads(
    db,
    leads.map((l) => l.id),
  );
  const existing = await customerEmailSet(db);
  const now = Date.now();
  const send: { id: string; email: string; company: string }[] = [];
  const skip: {
    id: string;
    email: string;
    company: string;
    reason: MarketingSkipReason;
    reasonLabel: string;
  }[] = [];
  for (const lead of leads) {
    const info = sendInfoFromRows(sendMap.get(lead.id) ?? []);
    const reason = skipReason({
      kind,
      lead,
      info,
      existingCustomer: existing.has(lead.email),
      now,
    });
    if (reason) {
      skip.push({
        id: lead.id,
        email: lead.email,
        company: lead.company,
        reason,
        reasonLabel: skipReasonLabel[reason],
      });
    } else {
      send.push({ id: lead.id, email: lead.email, company: lead.company });
    }
  }
  return { listId, kind, sendCount: send.length, skipCount: skip.length, send, skip };
}

async function runCampaign(
  db: Db,
  request: FastifyRequest,
  reply: FastifyReply,
  kind: MarketingSendKind,
) {
  const parsed = z
    .object({ listId: z.string().min(1), templateId: z.string().min(1) })
    .safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "listId und templateId nötig" });
  const settings = await loadMailPublic(db);
  if (!mailReady(settings)) {
    return reply.code(400).send({ error: "E-Mail ist nicht eingerichtet (Konto → SMTP)" });
  }
  const template = await db
    .select()
    .from(marketingTemplates)
    .where(eq(marketingTemplates.id, parsed.data.templateId))
    .get();
  if (!template) return reply.code(404).send({ error: "Textbaustein nicht gefunden" });
  if (template.kind !== kind) {
    return reply.code(400).send({
      error:
        kind === "first"
          ? "Bitte einen Erstmail-Textbaustein wählen"
          : "Bitte einen Erinnerungs-Textbaustein wählen",
    });
  }
  const preview = await buildPreview(db, parsed.data.listId, kind);
  if (!preview) return reply.code(404).send({ error: "Liste nicht gefunden" });
  if (preview.send.length === 0) {
    return { ok: true, sent: 0, failed: 0, skipped: preview.skipCount, skip: preview.skip };
  }
  const org = await loadOrg(db);
  const ids = preview.send.map((s) => s.id);
  const leads = await db.select().from(marketingLeads).where(inArray(marketingLeads.id, ids)).all();
  const byId = new Map(leads.map((l) => [l.id, l]));
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < ids.length; i++) {
    const lead = byId.get(ids[i]);
    if (!lead) continue;
    const mail = buildMarketingMail({
      template,
      lead,
      org,
      brand: settings.mailFromName,
      publicUrl: settings.mailPublicUrl,
    });
    const ok = await sendMail(db, mail);
    await db.insert(marketingSends).values({
      id: createId("msend"),
      leadId: lead.id,
      templateId: template.id,
      kind,
      sentAt: new Date(),
      ok,
      error: ok ? null : "Versand fehlgeschlagen",
    });
    if (ok) sent += 1;
    else failed += 1;
    if (i < ids.length - 1) await sleep(SEND_PAUSE_MS);
  }
  if (sent > 0) await archiveListAfterSend(db, parsed.data.listId);
  return { ok: true, sent, failed, skipped: preview.skipCount, skip: preview.skip };
}
