import type { MailCustomerKind, MailNotifyConfig } from "../types";

export type MailNotifyGroupId = "tickets" | "appointments" | "monitoring";

export type MailNotifyGroupMeta = {
  id: MailNotifyGroupId;
  title: string;
  kinds: readonly MailCustomerKind[];
};

/** Ticket-, Termin- und Monitoring-Typen für die Benachrichtigungs-UI. */
export const mailNotifyGroups: readonly MailNotifyGroupMeta[] = [
  { id: "tickets", title: "Tickets", kinds: ["ticketCreated", "ticketComment", "ticketStatus"] },
  {
    id: "appointments",
    title: "Termine",
    kinds: ["appointmentCreated", "appointmentChanged", "appointmentReminder"],
  },
  { id: "monitoring", title: "Monitoring", kinds: ["monitoringOpen", "monitoringClose"] },
];

/** Kurzlabel in der Gruppe (die Überschrift liefert den Kontext). */
export const mailKindShortLabel: Record<MailCustomerKind, string> = {
  ticketCreated: "Neu",
  ticketComment: "Kommentar",
  ticketStatus: "Status",
  appointmentCreated: "Neu",
  appointmentChanged: "Geändert / gelöscht",
  appointmentReminder: "Erinnerung",
  monitoringOpen: "Warnung",
  monitoringClose: "Entwarnung",
};

/** Ein Satz, was die Mail auslöst. */
export const mailKindHint: Record<MailCustomerKind, string> = {
  ticketCreated: "Wenn ein Ticket angelegt wird",
  ticketComment: "Öffentliche Nachricht im Ticket",
  ticketStatus: "Status oder Lösung geändert",
  appointmentCreated: "Wenn ein Termin eingetragen wird",
  appointmentChanged: "Verschoben oder abgesagt",
  appointmentReminder: "Vor dem Termin",
  monitoringOpen: "Störung, Ticket wurde angelegt",
  monitoringClose: "Störung ist behoben",
};

export type MailReminderKey = keyof MailNotifyConfig["reminders"];

export const mailReminderOptions: { id: MailReminderKey; label: string; short: string }[] = [
  { id: "hours24", label: "24 Stunden vorher", short: "24h" },
  { id: "hours1", label: "1 Stunde vorher", short: "1h" },
  { id: "morning", label: "Am Termin-Tag 08:00", short: "08:00" },
];

/**
 * Kompakte Zusammenfassung je Gruppe, z. B. „Tickets · Termine: Neu, Erinnerung“.
 */
export function summarizeMailNotify(
  prefs: Record<MailCustomerKind, boolean> | undefined,
  allowed?: Record<MailCustomerKind, boolean>,
): string {
  const values = prefs ?? ({} as Record<MailCustomerKind, boolean>);
  const parts: string[] = [];
  for (const group of mailNotifyGroups) {
    const kinds = group.kinds.filter((kind) => (allowed ? allowed[kind] : true));
    if (!kinds.length) continue;
    const on = kinds.filter((kind) => values[kind] !== false);
    if (!on.length) continue;
    if (on.length === kinds.length) parts.push(group.title);
    else parts.push(`${group.title}: ${on.map((kind) => mailKindShortLabel[kind]).join(", ")}`);
  }
  return parts.length ? parts.join(" · ") : "Keine Mails";
}

/**
 * Wie viele Typen einer Gruppe an sind (optional nur global erlaubte).
 */
export function mailGroupCounts(
  values: Record<string, boolean>,
  group: MailNotifyGroupMeta,
  allowed?: Record<string, boolean>,
): { on: number; total: number } {
  const kinds = group.kinds.filter((kind) => (allowed ? allowed[kind] : true));
  return { on: kinds.filter((kind) => values[kind]).length, total: kinds.length };
}
