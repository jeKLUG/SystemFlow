import { createHash } from "node:crypto";
import nodemailer from "nodemailer";
import { eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { orgSettings } from "../db/schema.js";
import { loadConfig } from "./config.js";
import { decryptText, encryptText } from "./vaultCrypto.js";
import { parseMailNotify, type MailNotifyConfig } from "./mailNotify.js";

const SETTINGS_ID = "default";

export type SmtpSecure = "starttls" | "ssl" | "none";

export type MailPublicSettings = {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: SmtpSecure;
  smtpUser: string;
  smtpPasswordSet: boolean;
  mailFromEmail: string;
  mailFromName: string;
  mailReplyTo: string;
  mailPublicUrl: string;
  mailStaffInbox: string;
  notify: MailNotifyConfig;
};

type MailRuntime = MailPublicSettings & {
  smtpPass: string;
};

function mailKey(): Buffer {
  return createHash("sha256").update(loadConfig().sessionSecret).digest();
}

export function encryptSmtpPass(plain: string): string {
  return encryptText(mailKey(), plain);
}

function decryptSmtpPass(enc: string | null | undefined): string {
  if (!enc) return "";
  try {
    return decryptText(mailKey(), enc);
  } catch {
    return "";
  }
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function emptyToNull(value: string | null | undefined): string | null {
  if (!value || !value.trim()) return null;
  return value.trim();
}

function stripUrl(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\/$/, "");
}

/**
 * SMTP- und Notify-Einstellungen ohne Passwort.
 */
export async function loadMailPublic(db: Db): Promise<MailPublicSettings> {
  const row = await db.select().from(orgSettings).where(eq(orgSettings.id, SETTINGS_ID)).get();
  return {
    smtpHost: row?.smtpHost?.trim() ?? "",
    smtpPort: row?.smtpPort ?? 587,
    smtpSecure: row?.smtpSecure ?? "starttls",
    smtpUser: row?.smtpUser?.trim() ?? "",
    smtpPasswordSet: Boolean(row?.smtpPassEnc),
    mailFromEmail: row?.mailFromEmail?.trim() ?? "",
    mailFromName: row?.mailFromName?.trim() ?? "",
    mailReplyTo: row?.mailReplyTo?.trim() ?? "",
    mailPublicUrl: stripUrl(row?.mailPublicUrl),
    mailStaffInbox: row?.mailStaffInbox?.trim() ?? "",
    notify: parseMailNotify(row?.mailNotifyJson),
  };
}

async function loadMailRuntime(db: Db): Promise<MailRuntime | null> {
  const row = await db.select().from(orgSettings).where(eq(orgSettings.id, SETTINGS_ID)).get();
  if (!row) return null;
  const smtpPass = decryptSmtpPass(row.smtpPassEnc);
  return {
    smtpHost: row.smtpHost?.trim() ?? "",
    smtpPort: row.smtpPort ?? 587,
    smtpSecure: row.smtpSecure ?? "starttls",
    smtpUser: row.smtpUser?.trim() ?? "",
    smtpPasswordSet: Boolean(row.smtpPassEnc),
    smtpPass,
    mailFromEmail: row.mailFromEmail?.trim() ?? "",
    mailFromName: row.mailFromName?.trim() ?? "",
    mailReplyTo: row.mailReplyTo?.trim() ?? "",
    mailPublicUrl: stripUrl(row.mailPublicUrl),
    mailStaffInbox: row.mailStaffInbox?.trim() ?? "",
    notify: parseMailNotify(row.mailNotifyJson),
  };
}

export function mailReady(s: MailPublicSettings & { smtpPass?: string }): boolean {
  const pass = s.smtpPass ?? (s.smtpPasswordSet ? "x" : "");
  return Boolean(
    s.smtpHost &&
      s.smtpPort &&
      s.mailFromEmail &&
      isEmail(s.mailFromEmail) &&
      (s.smtpUser ? pass : true),
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Einfache HTML-Mail mit optionalem Button.
 */
export function mailHtml(opts: {
  title: string;
  intro: string;
  body?: string;
  href?: string;
  button?: string;
}): { html: string; text: string } {
  const paras = [opts.intro, opts.body].filter(Boolean).map((p) => `<p>${escapeHtml(p!)}</p>`);
  const btn =
    opts.href && opts.button
      ? `<p style="margin:24px 0"><a href="${escapeHtml(opts.href)}" style="background:#2563eb;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;display:inline-block">${escapeHtml(opts.button)}</a></p>`
      : "";
  const html = `<!DOCTYPE html><html><body style="font-family:Segoe UI,Helvetica,Arial,sans-serif;background:#0f172a;color:#e2e8f0;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#1e293b;border-radius:16px;padding:24px">
    <h1 style="font-size:18px;margin:0 0 12px">${escapeHtml(opts.title)}</h1>
    ${paras.join("")}
    ${btn}
  </div>
</body></html>`;
  const text = [opts.title, opts.intro, opts.body, opts.href].filter(Boolean).join("\n\n");
  return { html, text };
}

export type OutgoingMail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  ics?: { filename: string; content: string };
};

/**
 * Sendet eine Mail. Fehler werden geloggt, nie geworfen.
 */
export async function sendMail(db: Db, mail: OutgoingMail): Promise<boolean> {
  const runtime = await loadMailRuntime(db);
  if (!runtime || !mailReady(runtime) || !isEmail(mail.to)) return false;
  const fromName = runtime.mailFromName || "Systemhaus-Ess";
  const from = `${fromName} <${runtime.mailFromEmail}>`;
  const transporter = nodemailer.createTransport({
    host: runtime.smtpHost,
    port: runtime.smtpPort,
    secure: runtime.smtpSecure === "ssl",
    requireTLS: runtime.smtpSecure === "starttls",
    ignoreTLS: runtime.smtpSecure === "none",
    auth: runtime.smtpUser ? { user: runtime.smtpUser, pass: runtime.smtpPass } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  try {
    await transporter.sendMail({
      from,
      to: mail.to,
      replyTo: runtime.mailReplyTo && isEmail(runtime.mailReplyTo) ? runtime.mailReplyTo : undefined,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      attachments: mail.ics
        ? [
            {
              filename: mail.ics.filename,
              content: mail.ics.content,
              contentType: "text/calendar; charset=utf-8",
            },
          ]
        : undefined,
    });
    return true;
  } catch (err) {
    console.error("Mail:", err);
    return false;
  }
}

export { emptyToNull, SETTINGS_ID };
