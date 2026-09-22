import { randomBytes } from "node:crypto";
import { contractorPartyLines } from "./orgAddress.js";
import { mailHtml, type OutgoingMail } from "./mail.js";
import type { MarketingLead, MarketingSend, MarketingSendKind, OrgSettings } from "../db/schema.js";

/** Erinnerung frühestens 7 Tage nach erfolgreicher Erstmail. */
export const MARKETING_REMINDER_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export type MarketingLeadStatus =
  | "new"
  | "sent"
  | "reminder_due"
  | "reminded"
  | "replied"
  | "contact"
  | "unsubscribed";

export type MarketingSkipReason =
  | "already_sent"
  | "already_reminded"
  | "replied"
  | "unsubscribed"
  | "existing_customer"
  | "not_due"
  | "no_first_send";

export type LeadSendInfo = {
  firstSentAt: Date | null;
  reminderSentAt: Date | null;
};

/**
 * Zufälliges Token für den öffentlichen Abmelde-Link.
 */
export function createUnsubToken(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Normalisiert E-Mail-Adressen für Vergleich und Unique-Check.
 */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Anrede: Ansprechpartner, sonst „Team Firma“.
 */
export function leadGreeting(lead: { company: string; contactPerson?: string | null }): string {
  const person = lead.contactPerson?.trim();
  if (person) return person;
  const company = lead.company.trim();
  return company ? `Team ${company}` : "Ihr Team";
}

/**
 * Ersetzt `{{firma}}` und `{{ansprechpartner}}` im Textbaustein.
 */
export function interpolateMarketing(text: string, lead: { company: string; contactPerson?: string | null }): string {
  const company = lead.company.trim() || "";
  return text
    .replaceAll("{{firma}}", company)
    .replaceAll("{{ansprechpartner}}", leadGreeting(lead));
}

/**
 * CTA-URL: `http(s)` unverändert, Telefonnummern als `tel:`.
 */
export function normalizeCtaUrl(raw: string | null | undefined): string | undefined {
  const value = (raw ?? "").trim();
  if (!value) return undefined;
  if (/^https?:\/\//i.test(value) || /^tel:/i.test(value) || /^mailto:/i.test(value)) return value;
  if (/^[+\d][\d\s()/.-]{5,}$/.test(value)) return `tel:${value.replace(/[^\d+]/g, "")}`;
  return value;
}

export function sendInfoFromRows(sends: MarketingSend[]): LeadSendInfo {
  let firstSentAt: Date | null = null;
  let reminderSentAt: Date | null = null;
  for (const row of sends) {
    if (!row.ok) continue;
    if (row.kind === "first") {
      if (!firstSentAt || row.sentAt < firstSentAt) firstSentAt = row.sentAt;
    } else if (row.kind === "reminder") {
      if (!reminderSentAt || row.sentAt < reminderSentAt) reminderSentAt = row.sentAt;
    }
  }
  return { firstSentAt, reminderSentAt };
}

/**
 * Pipeline-Status eines Leads für die Liste.
 */
export function leadStatus(
  lead: Pick<MarketingLead, "customerId" | "repliedAt" | "doNotContact">,
  info: LeadSendInfo,
  now = Date.now(),
): MarketingLeadStatus {
  if (lead.customerId) return "contact";
  if (lead.repliedAt) return "replied";
  if (lead.doNotContact) return "unsubscribed";
  if (info.reminderSentAt) return "reminded";
  if (info.firstSentAt) {
    if (now - info.firstSentAt.getTime() >= MARKETING_REMINDER_AFTER_MS) return "reminder_due";
    return "sent";
  }
  return "new";
}

/**
 * Warum ein Lead nicht in den aktuellen Versand gehört, oder `null` wenn senden.
 */
export function skipReason(opts: {
  kind: MarketingSendKind;
  lead: Pick<MarketingLead, "repliedAt" | "doNotContact">;
  info: LeadSendInfo;
  existingCustomer: boolean;
  now?: number;
}): MarketingSkipReason | null {
  const now = opts.now ?? Date.now();
  if (opts.lead.doNotContact) return "unsubscribed";
  if (opts.lead.repliedAt) return "replied";
  if (opts.existingCustomer) return "existing_customer";
  if (opts.kind === "first") {
    if (opts.info.firstSentAt) return "already_sent";
    return null;
  }
  if (opts.info.reminderSentAt) return "already_reminded";
  if (!opts.info.firstSentAt) return "no_first_send";
  if (now - opts.info.firstSentAt.getTime() < MARKETING_REMINDER_AFTER_MS) return "not_due";
  return null;
}

export const skipReasonLabel: Record<MarketingSkipReason, string> = {
  already_sent: "schon erhalten",
  already_reminded: "Erinnerung schon gesendet",
  replied: "geantwortet",
  unsubscribed: "abgemeldet",
  existing_customer: "bestehende Kunden-E-Mail",
  not_due: "noch keine 7 Tage",
  no_first_send: "keine Erstmail",
};

const SIGNATURE_MAX = 80_000;

const SIGNATURE_TAGS = new Set([
  "a",
  "b",
  "br",
  "div",
  "em",
  "font",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "li",
  "ol",
  "p",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
]);

const SIGNATURE_ATTR: Record<string, Set<string>> = {
  "*": new Set(["align", "bgcolor", "border", "class", "color", "dir", "height", "id", "style", "title", "valign", "width"]),
  a: new Set(["href", "rel", "target"]),
  img: new Set(["alt", "border", "height", "src", "width"]),
  td: new Set(["colspan", "rowspan", "background"]),
  th: new Set(["colspan", "rowspan", "background"]),
  table: new Set(["cellpadding", "cellspacing", "role"]),
  font: new Set(["face", "size"]),
};

const VOID_TAGS = new Set(["br", "hr", "img"]);

function extractSignatureFragment(html: string): string {
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return (body ? body[1] : html).trim();
}

function safeUrl(value: string, kind: "href" | "src"): string | null {
  const v = value.trim().replace(/^['"]|['"]$/g, "");
  if (/^(https?:|mailto:|tel:)/i.test(v)) return v;
  if (kind === "src" && (/^cid:/i.test(v) || /^data:image\//i.test(v))) return v;
  return null;
}

function sanitizeStyle(value: string): string {
  const lower = value.toLowerCase();
  if (lower.includes("expression") || lower.includes("javascript:") || lower.includes("behavior") || lower.includes("-moz-binding")) {
    return "";
  }
  return value.replace(/\/\*.*?\*\//g, "").trim();
}

function sanitizeAttrs(tag: string, raw: string): string {
  const allowed = new Set([...(SIGNATURE_ATTR["*"] ?? []), ...(SIGNATURE_ATTR[tag] ?? [])]);
  const out: string[] = [];
  const re = /([a-zA-Z:_][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) {
    const name = match[1].toLowerCase();
    if (name.startsWith("on") || name === "srcset" || name.startsWith("xmlns")) continue;
    if (!allowed.has(name)) continue;
    const value = match[3] ?? match[4] ?? match[5] ?? "";
    if (name === "href" || name === "src" || name === "background") {
      const url = safeUrl(value, name === "href" ? "href" : "src");
      if (!url) continue;
      out.push(`${name}="${url.replace(/"/g, "&quot;")}"`);
      continue;
    }
    if (name === "style") {
      const style = sanitizeStyle(value);
      if (!style) continue;
      out.push(`style="${style.replace(/"/g, "&quot;")}"`);
      continue;
    }
    if (name === "target") {
      out.push(`target="_blank" rel="noopener noreferrer"`);
      continue;
    }
    out.push(`${name}="${value.replace(/"/g, "&quot;")}"`);
  }
  return out.length ? ` ${out.join(" ")}` : "";
}

/**
 * Bereinigt eingefügtes Outlook-/HTML-Signaturmarkup (kein Script, nur gängige Mail-Tags).
 */
export function sanitizeSignatureHtml(raw: string | null | undefined): string {
  let html = extractSignatureFragment(raw ?? "");
  if (!html) return "";
  if (html.length > SIGNATURE_MAX) html = html.slice(0, SIGNATURE_MAX);
  html = html.replace(/<!--[\s\S]*?-->/g, "");
  html = html.replace(/<(script|iframe|object|embed|form|link|meta|base|svg|math|style|textarea|input|button)(\s[^>]*)?>[\s\S]*?<\/\1>/gi, "");
  html = html.replace(/<(script|iframe|object|embed|form|link|meta|base|svg|math|style|textarea|input|button)(\s[^>]*)?\/?>/gi, "");
  html = html.replace(/<\/?(html|head|body|xml|o:[a-z]+)[^>]*>/gi, "");
  return html.replace(/<\/?([a-zA-Z][\w:-]*)([^>]*)>/g, (full, name: string, attrs: string) => {
    if (full.startsWith("<!--") || full.startsWith("<!")) return "";
    const tag = name.toLowerCase();
    const closing = full.startsWith("</");
    if (!SIGNATURE_TAGS.has(tag)) return "";
    if (closing) return VOID_TAGS.has(tag) ? "" : `</${tag}>`;
    const clean = sanitizeAttrs(tag, attrs);
    if (VOID_TAGS.has(tag) || /\/>\s*$/.test(full)) return `<${tag}${clean} />`;
    return `<${tag}${clean}>`;
  });
}

/**
 * Signatur-HTML als groben Klartext für die Text-Alternative.
 */
export function signatureHtmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Baut HTML/Text einer Akquise-Mail im App-Look inkl. Impressum und Abmelde-Link.
 */
export function buildMarketingMail(opts: {
  template: { subject: string; body: string; ctaUrl?: string | null; ctaLabel?: string | null };
  lead: { company: string; contactPerson?: string | null; email: string; unsubToken: string };
  org?: Pick<
    OrgSettings,
    | "orgName"
    | "orgTagline"
    | "orgAddress"
    | "orgZip"
    | "orgCity"
    | "orgCountry"
    | "orgEmail"
    | "orgPhone"
    | "marketingSignatureHtml"
  > | null;
  brand?: string;
  publicUrl?: string;
}): OutgoingMail & { interpolatedSubject: string; interpolatedBody: string } {
  const subject = interpolateMarketing(opts.template.subject, opts.lead);
  const body = interpolateMarketing(opts.template.body, opts.lead);
  const brand = opts.brand?.trim() || opts.org?.orgName?.trim() || "Systemhaus-Ess";
  const address = contractorPartyLines(opts.org).join(" · ");
  const unsubHref =
    opts.publicUrl && opts.lead.unsubToken
      ? `${opts.publicUrl.replace(/\/$/, "")}/m/unsubscribe/${opts.lead.unsubToken}`
      : undefined;
  const href = normalizeCtaUrl(opts.template.ctaUrl);
  const button = opts.template.ctaLabel?.trim() || (href ? "Jetzt Termin vereinbaren" : undefined);
  const signatureHtml = sanitizeSignatureHtml(opts.org?.marketingSignatureHtml);
  const rendered = mailHtml({
    brand,
    kicker: "Geschäftsbrief",
    title: subject,
    intro: body,
    href: href && button ? href : undefined,
    button: href && button ? button : undefined,
    signatureHtml: signatureHtml || undefined,
    signatureText: signatureHtml ? signatureHtmlToText(signatureHtml) : undefined,
    footer: `${address}\nDies ist eine geschäftliche Nachricht.`,
    footerLink: unsubHref
      ? { href: unsubHref, label: "Nicht mehr anschreiben" }
      : undefined,
  });
  return {
    to: opts.lead.email,
    subject,
    html: rendered.html,
    text: rendered.text,
    interpolatedSubject: subject,
    interpolatedBody: body,
  };
}
