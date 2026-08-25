import { simpleParser, type AddressObject, type Attachment, type ParsedMail } from "mailparser";
import type { EmailDirection } from "../db/schema.js";
import { APP_TIMEZONE } from "./dates.js";

export type ParsedEmlFields = {
  subject: string;
  fromAddress: string;
  toAddress: string;
  ccAddress: string;
  sentAt: string;
  bodyText: string;
  direction: EmailDirection;
  /** Nicht-inline Anhänge aus der EML (ohne die .eml selbst). */
  attachments: {
    filename: string;
    contentType: string;
    content: Buffer;
    size: number;
  }[];
};

function addressList(value: AddressObject | AddressObject[] | undefined): string {
  if (!value) return "";
  const list = Array.isArray(value) ? value : [value];
  const parts: string[] = [];
  for (const block of list) {
    for (const a of block.value ?? []) {
      const addr = (a.address ?? "").trim();
      const name = (a.name ?? "").trim();
      if (name && addr) parts.push(`${name} <${addr}>`);
      else if (addr) parts.push(addr);
      else if (name) parts.push(name);
    }
  }
  return parts.join(", ");
}

function firstEmail(value: AddressObject | AddressObject[] | undefined): string {
  if (!value) return "";
  const list = Array.isArray(value) ? value : [value];
  for (const block of list) {
    for (const a of block.value ?? []) {
      const addr = (a.address ?? "").trim().toLowerCase();
      if (addr) return addr;
    }
  }
  return "";
}

/** Kalendertag YYYY-MM-DD in App-Zeitzone. */
function toAppDateOnly(date: Date | undefined): string {
  const d = date && !Number.isNaN(date.getTime()) ? date : new Date();
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function htmlToPlain(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function extractBody(parsed: ParsedMail): string {
  const text = (parsed.text ?? "").trim();
  if (text) return text.slice(0, 100_000);
  const html = (parsed.html || "").toString().trim();
  if (html) return htmlToPlain(html).slice(0, 100_000);
  return "";
}

function isInlineAttachment(att: Attachment): boolean {
  const disp = String(att.contentDisposition ?? "").toLowerCase();
  if (disp === "inline") return true;
  if (att.related) return true;
  const cid = att.cid ?? att.contentId;
  return Boolean(cid);
}

/**
 * Richtung anhand Absender/Empfänger und Kunden-E-Mail schätzen.
 */
export function guessEmailDirection(opts: {
  from: string;
  to: string;
  cc: string;
  customerEmail?: string | null;
  outboundDomains?: string[];
}): EmailDirection {
  const from = opts.from.toLowerCase();
  const toCc = `${opts.to} ${opts.cc}`.toLowerCase();
  const customer = (opts.customerEmail ?? "").trim().toLowerCase();
  const domains = opts.outboundDomains?.length
    ? opts.outboundDomains
    : ["systemhaus-ess.de"];

  const fromIsOurs = domains.some((d) => from.includes(`@${d.toLowerCase()}`));
  const toIsOurs = domains.some((d) => toCc.includes(`@${d.toLowerCase()}`));

  if (customer) {
    if (from.includes(customer)) return "inbound";
    if (fromIsOurs && toCc.includes(customer)) return "outbound";
  }

  if (fromIsOurs && !toIsOurs) return "outbound";
  if (!fromIsOurs && toIsOurs) return "inbound";
  if (fromIsOurs && toIsOurs) return "internal";
  return "inbound";
}

function collectFileAttachments(parsed: ParsedMail) {
  const out: ParsedEmlFields["attachments"] = [];
  for (const att of parsed.attachments ?? []) {
    if (isInlineAttachment(att)) continue;
    const buf = Buffer.isBuffer(att.content)
      ? att.content
      : Buffer.from(att.content ?? []);
    if (!buf.length) continue;
    const filename =
      (att.filename && att.filename.trim()) ||
      `anhang-${out.length + 1}${att.contentType?.includes("pdf") ? ".pdf" : ""}`;
    out.push({
      filename: filename.slice(0, 180),
      contentType: att.contentType || "application/octet-stream",
      content: buf,
      size: buf.length,
    });
  }
  return out;
}

/**
 * Parst eine .eml-Datei (RFC822) in Archiv-Felder.
 */
export async function parseEmlBuffer(
  buffer: Buffer,
  opts?: { customerEmail?: string | null; outboundDomains?: string[] },
): Promise<ParsedEmlFields> {
  const parsed = await simpleParser(buffer, {
    skipHtmlToText: false,
    skipImageLinks: true,
    skipTextToHtml: true,
    skipTextLinks: true,
  });

  const fromAddress = addressList(parsed.from);
  const toAddress = addressList(parsed.to);
  const ccAddress = addressList(parsed.cc);
  const subject = (parsed.subject ?? "").trim() || "(ohne Betreff)";
  const sentAt = toAppDateOnly(parsed.date ?? undefined);
  const bodyText = extractBody(parsed);
  const direction = guessEmailDirection({
    from: firstEmail(parsed.from) || fromAddress,
    to: toAddress,
    cc: ccAddress,
    customerEmail: opts?.customerEmail,
    outboundDomains: opts?.outboundDomains,
  });

  return {
    subject: subject.slice(0, 500),
    fromAddress: fromAddress.slice(0, 320),
    toAddress: toAddress.slice(0, 1000),
    ccAddress: ccAddress.slice(0, 1000),
    sentAt,
    bodyText,
    direction,
    attachments: collectFileAttachments(parsed),
  };
}
