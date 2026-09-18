import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { orgSettings } from "../db/schema.js";
import {
  encryptSmtpPass,
  isEmail,
  loadMailPublic,
  mailHtml,
  mailReady,
  sendMail,
  SETTINGS_ID,
} from "../lib/mail.js";
import {
  defaultMailNotify,
  mailCustomerKinds,
  mailStaffKinds,
  parseMailNotify,
  type MailNotifyConfig,
} from "../lib/mailNotify.js";
import { requireAdmin } from "../plugins/auth.js";

const smtpSecure = z.enum(["starttls", "ssl", "none"]);

const notifyShape = z.object({
  staff: z.record(z.boolean()).optional(),
  customer: z.record(z.boolean()).optional(),
  reminders: z
    .object({
      hours24: z.boolean().optional(),
      hours1: z.boolean().optional(),
      morning: z.boolean().optional(),
    })
    .optional(),
});

const saveBody = z.object({
  smtpHost: z.string().max(200).optional().nullable(),
  smtpPort: z.number().int().min(1).max(65535).optional().nullable(),
  smtpSecure: smtpSecure.optional(),
  smtpUser: z.string().max(200).optional().nullable(),
  smtpPassword: z.string().max(500).optional().nullable(),
  mailFromEmail: z.string().max(200).optional().nullable(),
  mailFromName: z.string().max(120).optional().nullable(),
  mailReplyTo: z.string().max(200).optional().nullable(),
  mailPublicUrl: z.string().max(500).optional().nullable(),
  mailStaffInbox: z.string().max(200).optional().nullable(),
  notify: notifyShape.optional(),
});

async function ensureOrg(db: Db) {
  const existing = await db.select().from(orgSettings).where(eq(orgSettings.id, SETTINGS_ID)).get();
  if (existing) return existing;
  const now = new Date();
  const row = {
    id: SETTINGS_ID,
    defaultHourlyRate: null as number | null,
    currency: "EUR",
    defaultVatPercent: 19 as number | null,
    invoiceNote: null as string | null,
    monitoringEnrollmentKey: null as string | null,
    smtpHost: null as string | null,
    smtpPort: null as number | null,
    smtpSecure: "starttls" as const,
    smtpUser: null as string | null,
    smtpPassEnc: null as string | null,
    mailFromEmail: null as string | null,
    mailFromName: null as string | null,
    mailReplyTo: null as string | null,
    mailPublicUrl: null as string | null,
    mailStaffInbox: null as string | null,
    mailNotifyJson: "{}",
    updatedAt: now,
  };
  await db.insert(orgSettings).values(row);
  return row;
}

function emptyToNull(value: string | null | undefined) {
  if (!value || !value.trim()) return null;
  return value.trim();
}

function mergeNotify(raw: string, patch?: z.infer<typeof notifyShape>): MailNotifyConfig {
  const current = parseMailNotify(raw);
  if (!patch) return current;
  const next = defaultMailNotify();
  for (const kind of mailStaffKinds) {
    next.staff[kind] = patch.staff?.[kind] ?? current.staff[kind];
  }
  for (const kind of mailCustomerKinds) {
    next.customer[kind] = patch.customer?.[kind] ?? current.customer[kind];
  }
  next.reminders = {
    hours24: patch.reminders?.hours24 ?? current.reminders.hours24,
    hours1: patch.reminders?.hours1 ?? current.reminders.hours1,
    morning: patch.reminders?.morning ?? current.reminders.morning,
  };
  return next;
}

/**
 * SMTP und Benachrichtigungs-Typen (Staff).
 */
export async function mailSettingsRoutes(app: FastifyInstance, db: Db) {
  app.addHook("preHandler", requireAdmin);

  app.get("/api/settings/mail", async () => {
    await ensureOrg(db);
    return loadMailPublic(db);
  });

  app.put("/api/settings/mail", async (request, reply) => {
    const parsed = saveBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }
    const existing = await ensureOrg(db);

    const from = emptyToNull(parsed.data.mailFromEmail) ?? existing.mailFromEmail;
    const inbox = emptyToNull(parsed.data.mailStaffInbox) ?? existing.mailStaffInbox;
    const replyTo = emptyToNull(parsed.data.mailReplyTo) ?? existing.mailReplyTo;
    if (from && !isEmail(from)) return reply.code(400).send({ error: "Absender-Adresse ungültig" });
    if (inbox && !isEmail(inbox)) return reply.code(400).send({ error: "Staff-Adresse ungültig" });
    if (replyTo && !isEmail(replyTo)) return reply.code(400).send({ error: "Reply-To ungültig" });

    let smtpPassEnc = existing.smtpPassEnc;
    if (parsed.data.smtpPassword !== undefined) {
      const pass = parsed.data.smtpPassword?.trim() ?? "";
      smtpPassEnc = pass ? encryptSmtpPass(pass) : existing.smtpPassEnc;
    }

    const publicUrl = emptyToNull(parsed.data.mailPublicUrl);
    await db
      .update(orgSettings)
      .set({
        smtpHost:
          parsed.data.smtpHost !== undefined ? emptyToNull(parsed.data.smtpHost) : existing.smtpHost,
        smtpPort: parsed.data.smtpPort !== undefined ? parsed.data.smtpPort : existing.smtpPort,
        smtpSecure: parsed.data.smtpSecure ?? existing.smtpSecure,
        smtpUser:
          parsed.data.smtpUser !== undefined ? emptyToNull(parsed.data.smtpUser) : existing.smtpUser,
        smtpPassEnc,
        mailFromEmail: parsed.data.mailFromEmail !== undefined ? from : existing.mailFromEmail,
        mailFromName:
          parsed.data.mailFromName !== undefined
            ? emptyToNull(parsed.data.mailFromName)
            : existing.mailFromName,
        mailReplyTo: parsed.data.mailReplyTo !== undefined ? replyTo : existing.mailReplyTo,
        mailPublicUrl:
          parsed.data.mailPublicUrl !== undefined
            ? publicUrl?.replace(/\/$/, "") ?? null
            : existing.mailPublicUrl,
        mailStaffInbox: parsed.data.mailStaffInbox !== undefined ? inbox : existing.mailStaffInbox,
        mailNotifyJson: JSON.stringify(mergeNotify(existing.mailNotifyJson, parsed.data.notify)),
        updatedAt: new Date(),
      })
      .where(eq(orgSettings.id, SETTINGS_ID));

    return loadMailPublic(db);
  });

  app.post("/api/settings/mail/test", async (request, reply) => {
    const settings = await loadMailPublic(db);
    if (!mailReady(settings)) {
      return reply.code(400).send({ error: "SMTP ist unvollständig (Host, Absender, ggf. Passwort)." });
    }
    if (!settings.mailStaffInbox || !isEmail(settings.mailStaffInbox)) {
      return reply.code(400).send({ error: "Staff-Adresse fehlt oder ist ungültig." });
    }
    const ok = await sendMail(db, {
      to: settings.mailStaffInbox,
      subject: "Testmail Systemhaus-Ess",
      ...mailHtml({
        title: "Testmail",
        intro: "SMTP ist eingerichtet. Diese Nachricht ging an die Staff-Sammeladresse.",
        href: settings.mailPublicUrl || undefined,
        button: settings.mailPublicUrl ? "App öffnen" : undefined,
      }),
    });
    if (!ok) return reply.code(502).send({ error: "Versand fehlgeschlagen. Server-Log prüfen." });
    return { ok: true };
  });
}
