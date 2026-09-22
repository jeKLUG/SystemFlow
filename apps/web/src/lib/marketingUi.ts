import type { MarketingLeadStatus, MarketingTemplateKind } from "../types";

export const marketingStatusLabel: Record<MarketingLeadStatus, string> = {
  new: "Neu",
  sent: "Gesendet",
  reminder_due: "Erinnerung fällig",
  reminded: "Erinnert",
  replied: "Geantwortet",
  contact: "Kontakt",
  unsubscribed: "Abgemeldet",
};

export const marketingKindLabel: Record<MarketingTemplateKind, string> = {
  first: "Erstmail",
  reminder: "Erinnerung",
};

/** Vorschau der Platzhalter wie auf dem Server. */
export function interpolatePreview(
  text: string,
  lead: { company: string; contactPerson?: string | null },
): string {
  const company = lead.company.trim() || "";
  const person = lead.contactPerson?.trim() || (company ? `Team ${company}` : "Ihr Team");
  return text.replaceAll("{{firma}}", company).replaceAll("{{ansprechpartner}}", person);
}

export function formatSentAt(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

/** Kalendertag für Listen-Archiv und kompakte Zeilen. */
export function formatSentDay(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}
