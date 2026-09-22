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

const BRAND = {
  bg: "#080d16",
  card: "#121b29",
  inset: "#182233",
  text: "#f1f5fb",
  muted: "#8b9cb3",
  body: "#c5d0de",
  accent: "#3b82f6",
  accentBright: "#6babff",
  border: "#2a384c",
};

const FONT = "Segoe UI,Roboto,Helvetica Neue,Arial,sans-serif";

function htmlLines(value: string): string {
  return escapeHtml(value).replace(/\n/g, "<br>");
}

/**
 * HTML-Mail im App-Look: dunkel, Akzentblau, Infotabelle, Button.
 * Optional `footerLink` im Footer und `signatureHtml` (bereits bereinigt) unter dem Inhalt.
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
  /** Optionaler Link im Footer (z. B. Abmelden). */
  footerLink?: { href: string; label: string };
  /** Bereits bereinigtes HTML, z. B. Marketing-Signatur unter dem Text. */
  signatureHtml?: string;
  /** Klartext zur Signatur (Plain-Text-Alternative). */
  signatureText?: string;
}): { html: string; text: string } {
  const brand = opts.brand?.trim() || "Systemhaus-Ess";
  const facts = (opts.facts ?? []).filter((f) => f.value.trim());
  const factRows = facts
    .map((f, i) => {
      const last = i === facts.length - 1;
      const border = last ? "none" : `1px solid ${BRAND.border}`;
      return `<tr>
        <td style="padding:11px 0;width:132px;vertical-align:top;font-size:12px;line-height:1.45;color:${BRAND.muted};border-bottom:${border}">${escapeHtml(f.label)}</td>
        <td style="padding:11px 0;vertical-align:top;font-size:14px;line-height:1.45;color:${BRAND.text};font-weight:600;border-bottom:${border}">${htmlLines(f.value)}</td>
      </tr>`;
    })
    .join("");
  const factsBlock = factRows
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${BRAND.inset}" style="margin:0 0 22px;background:${BRAND.inset};border:1px solid ${BRAND.border}">
        <tr><td style="padding:4px 20px 6px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${factRows}</table>
        </td></tr>
      </table>`
    : "";
  const bodyBlock = opts.body
    ? `${opts.bodyLabel ? `<p style="margin:0 0 8px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND.muted}">${escapeHtml(opts.bodyLabel)}</p>` : ""}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px">
        <tr><td bgcolor="${BRAND.inset}" style="padding:14px 16px 14px 18px;background:${BRAND.inset};border-left:3px solid ${BRAND.accent};font-size:14px;line-height:1.6;color:${BRAND.body}">${htmlLines(opts.body)}</td></tr>
      </table>`
    : "";
  const btn =
    opts.href && opts.button
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 4px"><tr>
          <td bgcolor="${BRAND.accent}" style="border-radius:10px">
            <a href="${escapeHtml(opts.href)}" style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:14px;font-weight:650;color:#ffffff;text-decoration:none">${escapeHtml(opts.button)}</a>
          </td>
        </tr></table>`
      : "";
  const intro = opts.intro
    ? `<p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:${BRAND.body}">${htmlLines(opts.intro)}</p>`
    : "";
  const note = opts.note
    ? `<p style="margin:18px 0 0;font-size:13px;line-height:1.5;color:${BRAND.muted}">${htmlLines(opts.note)}</p>`
    : "";
  const signature = opts.signatureHtml?.trim()
    ? `<div style="margin:22px 0 8px;padding:14px 16px;background:#ffffff;color:#1f2937;border-radius:8px;font-size:13px;line-height:1.5">${opts.signatureHtml.trim()}</div>`
    : "";
  const footer =
    opts.footer ||
    "Automatische Benachrichtigung. Bitte nicht auf diese Nachricht antworten, sofern nicht anders angegeben.";
  const kickerLine = opts.kicker
    ? `<span style="color:${BRAND.muted}"> · ${escapeHtml(opts.kicker)}</span>`
    : "";
  const preheader = [opts.intro, facts.map((f) => `${f.label}: ${f.value}`).join(" · ")].filter(Boolean).join(" ");
  const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${escapeHtml(opts.title)}</title>
<style>
  :root { color-scheme: dark; }
  a { color: ${BRAND.accentBright}; }
</style>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${BRAND.bg}" style="background:${BRAND.bg}">
  <tr>
    <td align="center" style="padding:36px 16px">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" bgcolor="${BRAND.card}" style="width:100%;max-width:560px;background:${BRAND.card};border:1px solid ${BRAND.border}">
        <tr><td bgcolor="${BRAND.accent}" style="height:3px;background:${BRAND.accent};font-size:0;line-height:0">&nbsp;</td></tr>
        <tr>
          <td style="padding:28px 32px 10px;font-family:${FONT}">
            <p style="margin:0 0 14px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;font-weight:650">
              <span style="color:${BRAND.accentBright}">${escapeHtml(brand)}</span>${kickerLine}
            </p>
            <h1 style="margin:0 0 12px;font-size:22px;line-height:1.35;font-weight:650;color:${BRAND.text}">${escapeHtml(opts.title)}</h1>
            ${intro}
            ${factsBlock}
            ${bodyBlock}
            ${btn}
            ${signature}
            ${note}
          </td>
        </tr>
        <tr>
          <td style="padding:18px 32px 26px;font-family:${FONT};font-size:12px;line-height:1.5;color:${BRAND.muted};border-top:1px solid ${BRAND.border}">
            ${htmlLines(footer)}${
              opts.footerLink
                ? `<br><a href="${escapeHtml(opts.footerLink.href)}" style="color:${BRAND.accentBright};text-decoration:underline">${escapeHtml(opts.footerLink.label)}</a>`
                : ""
            }
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
  const kickerText = [brand, opts.kicker].filter(Boolean).join(" · ");
  const text = [
    kickerText,
    opts.title,
    opts.intro,
    ...facts.map((f) => `${f.label}: ${f.value}`),
    opts.bodyLabel && opts.body ? `${opts.bodyLabel}:\n${opts.body}` : opts.body,
    opts.note,
    opts.href,
    opts.signatureText,
    footer,
    opts.footerLink ? `${opts.footerLink.label}: ${opts.footerLink.href}` : "",
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
  if (!runtime || !mailReady(runtime)) return false;
  const to = mail.to.trim();
  if (!isEmail(to)) {
    console.error("Mail: ungültige Empfängeradresse", mail.to);
    return false;
  }
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
      to,
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
    console.error(`Mail an ${to}:`, err);
    return false;
  }
}

export { emptyToNull, SETTINGS_ID };
