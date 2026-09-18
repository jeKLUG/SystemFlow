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

export type MailFact = { label: string; value: string };
export type MailTone = "neutral" | "info" | "warn" | "ok";

const TONE_BAR: Record<MailTone, string> = {
  neutral: "#2563eb",
  info: "#2563eb",
  warn: "#dc2626",
  ok: "#059669",
};

const FONT = 'Segoe UI,Roboto,Helvetica Neue,Arial,sans-serif';

function htmlLines(value: string): string {
  return escapeHtml(value).replace(/\n/g, "<br>");
}

/**
 * Schlichtes HTML für System-Mails (helle Karte, Infotabelle, Button). Outlook-tauglich.
 */
export function mailHtml(opts: {
  brand?: string;
  kicker?: string;
  title: string;
  intro?: string;
  facts?: MailFact[];
  body?: string;
  bodyLabel?: string;
  href?: string;
  button?: string;
  tone?: MailTone;
  footer?: string;
  note?: string;
}): { html: string; text: string } {
  const brand = opts.brand?.trim() || "Systemhaus-Ess";
  const tone = opts.tone ?? "neutral";
  const bar = TONE_BAR[tone];
  const kicker = [brand, opts.kicker].filter(Boolean).join(" · ");
  const facts = (opts.facts ?? []).filter((f) => f.value.trim());
  const factRows = facts
    .map((f, i) => {
      const last = i === facts.length - 1;
      const border = last ? "none" : "1px solid #eef2f6";
      return `<tr>
        <td style="padding:10px 0;width:148px;vertical-align:top;font-size:13px;line-height:1.4;color:#64748b;border-bottom:${border}">${escapeHtml(f.label)}</td>
        <td style="padding:10px 0;vertical-align:top;font-size:13px;line-height:1.4;color:#0f172a;font-weight:600;border-bottom:${border}">${htmlLines(f.value)}</td>
      </tr>`;
    })
    .join("");
  const factsBlock = factRows
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;border-top:1px solid #eef2f6">${factRows}</table>`
    : "";
  const bodyBlock = opts.body
    ? `${opts.bodyLabel ? `<p style="margin:0 0 8px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#94a3b8">${escapeHtml(opts.bodyLabel)}</p>` : ""}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px">
        <tr><td style="padding:14px 16px;background:#f8fafc;border-left:3px solid ${bar};font-size:14px;line-height:1.55;color:#334155">${htmlLines(opts.body)}</td></tr>
      </table>`
    : "";
  const btn =
    opts.href && opts.button
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 8px"><tr>
          <td bgcolor="${bar}" style="border-radius:8px">
            <a href="${escapeHtml(opts.href)}" style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:14px;font-weight:600;color:#ffffff;text-decoration:none">${escapeHtml(opts.button)}</a>
          </td>
        </tr></table>`
      : "";
  const intro = opts.intro
    ? `<p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#334155">${htmlLines(opts.intro)}</p>`
    : "";
  const note = opts.note
    ? `<p style="margin:16px 0 0;font-size:13px;line-height:1.45;color:#64748b">${htmlLines(opts.note)}</p>`
    : "";
  const footer =
    opts.footer ||
    "Automatische Benachrichtigung. Bitte nicht auf diese Nachricht antworten, sofern nicht anders angegeben.";
  const preheader = [opts.intro, facts.map((f) => `${f.label}: ${f.value}`).join(" · ")].filter(Boolean).join(" ");
  const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(opts.title)}</title>
</head>
<body style="margin:0;padding:0;background:#eef1f4">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f4">
  <tr>
    <td align="center" style="padding:32px 16px">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #e2e8f0">
        <tr><td style="height:4px;background:${bar};font-size:0;line-height:0">&nbsp;</td></tr>
        <tr>
          <td style="padding:28px 32px 8px;font-family:${FONT}">
            <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b">${escapeHtml(kicker)}</p>
            <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:650;color:#0f172a">${escapeHtml(opts.title)}</h1>
            ${intro}
            ${factsBlock}
            ${bodyBlock}
            ${btn}
            ${note}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 28px;font-family:${FONT};font-size:12px;line-height:1.5;color:#94a3b8;border-top:1px solid #eef2f6">
            ${escapeHtml(footer)}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
  const text = [
    kicker,
    opts.title,
    opts.intro,
    ...facts.map((f) => `${f.label}: ${f.value}`),
    opts.bodyLabel && opts.body ? `${opts.bodyLabel}:\n${opts.body}` : opts.body,
    opts.note,
    opts.href,
    footer,
  ]
    .filter(Boolean)
    .join("\n\n");
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
