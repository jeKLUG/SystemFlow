export const mailStaffKinds = [
  "ticketCreated",
  "ticketComment",
  "ticketStatus",
  "appointmentCreated",
  "appointmentChanged",
  "appointmentReminder",
  "monitoringOpen",
  "monitoringClose",
] as const;

export const mailCustomerKinds = [
  "ticketCreated",
  "ticketComment",
  "ticketStatus",
  "appointmentCreated",
  "appointmentChanged",
  "appointmentReminder",
  "monitoringOpen",
] as const;

export type MailStaffKind = (typeof mailStaffKinds)[number];
export type MailCustomerKind = (typeof mailCustomerKinds)[number];

export type MailNotifyConfig = {
  staff: Record<MailStaffKind, boolean>;
  customer: Record<MailCustomerKind, boolean>;
  reminders: { hours24: boolean; hours1: boolean; morning: boolean };
};

export type CustomerMailNotify = Record<MailCustomerKind, boolean>;

function allTrue<T extends string>(keys: readonly T[]): Record<T, boolean> {
  return Object.fromEntries(keys.map((k) => [k, true])) as Record<T, boolean>;
}

/** Standard: alle Typen an, Erinnerung 24h und 1h. */
export function defaultMailNotify(): MailNotifyConfig {
  return {
    staff: allTrue(mailStaffKinds),
    customer: allTrue(mailCustomerKinds),
    reminders: { hours24: true, hours1: true, morning: false },
  };
}

export function defaultCustomerMailNotify(): CustomerMailNotify {
  return allTrue(mailCustomerKinds);
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/**
 * Liest globale Mail-Schalter aus JSON; unbekannte Felder fallen auf Default.
 */
export function parseMailNotify(raw: string | null | undefined): MailNotifyConfig {
  const base = defaultMailNotify();
  if (!raw?.trim()) return base;
  try {
    const parsed = JSON.parse(raw) as Partial<MailNotifyConfig>;
    const staff = { ...base.staff };
    for (const kind of mailStaffKinds) staff[kind] = asBool(parsed.staff?.[kind], staff[kind]);
    const customer = { ...base.customer };
    for (const kind of mailCustomerKinds) customer[kind] = asBool(parsed.customer?.[kind], customer[kind]);
    return {
      staff,
      customer,
      reminders: {
        hours24: asBool(parsed.reminders?.hours24, base.reminders.hours24),
        hours1: asBool(parsed.reminders?.hours1, base.reminders.hours1),
        morning: asBool(parsed.reminders?.morning, base.reminders.morning),
      },
    };
  } catch {
    return base;
  }
}

/**
 * Liest Kunden-Opt-in; fehlende Keys gelten als an.
 */
export function parseCustomerMailNotify(raw: string | null | undefined): CustomerMailNotify {
  const base = defaultCustomerMailNotify();
  if (!raw?.trim()) return base;
  try {
    const parsed = JSON.parse(raw) as Partial<CustomerMailNotify>;
    const next = { ...base };
    for (const kind of mailCustomerKinds) next[kind] = asBool(parsed[kind], true);
    return next;
  } catch {
    return base;
  }
}

export const mailKindLabel: Record<MailStaffKind, string> = {
  ticketCreated: "Neues Ticket",
  ticketComment: "Ticket-Kommentar",
  ticketStatus: "Ticket-Status",
  appointmentCreated: "Termin angelegt",
  appointmentChanged: "Termin geändert / gelöscht",
  appointmentReminder: "Termin-Erinnerung",
  monitoringOpen: "Monitoring-Warnung",
  monitoringClose: "Monitoring-Entwarnung",
};
