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

/**
 * Baut HTML/Text einer Akquise-Mail im App-Look inkl. Impressum und Abmelde-Link.
 */
export function buildMarketingMail(opts: {
  template: { subject: string; body: string; ctaUrl?: string | null; ctaLabel?: string | null };
  lead: { company: string; contactPerson?: string | null; email: string; unsubToken: string };
  org?: Pick<
    OrgSettings,
    "orgName" | "orgTagline" | "orgAddress" | "orgZip" | "orgCity" | "orgCountry" | "orgEmail" | "orgPhone"
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
  const rendered = mailHtml({
    brand,
    kicker: "Geschäftsbrief",
    title: subject,
    intro: body,
    href: href && button ? href : undefined,
    button: href && button ? button : undefined,
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
