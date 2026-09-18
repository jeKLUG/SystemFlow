import { eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import {
  customerUsers,
  customers,
  type Appointment,
  type Ticket,
  type TicketPriority,
  type TicketSource,
  type TicketStatus,
} from "../db/schema.js";
import { APP_TIMEZONE } from "./dates.js";
import { loadMailPublic, mailHtml, mailReady, sendMail, isEmail, type MailFact, type MailTone } from "./mail.js";
import { appointmentIcs } from "./mailIcs.js";
import {
  parseCustomerMailNotify,
  type MailCustomerKind,
  type MailStaffKind,
} from "./mailNotify.js";
import { richTextPlain } from "./richtext.js";

const staffStatusLabel: Record<TicketStatus, string> = {
  open: "Offen",
  in_progress: "In Bearbeitung",
  waiting_customer: "Wartet auf Kunde",
  resolved: "Gelöst",
  closed: "Geschlossen",
};

const portalStatusLabel: Record<TicketStatus, string> = {
  open: "Eingegangen",
  in_progress: "In Bearbeitung",
  waiting_customer: "Rückmeldung nötig",
  resolved: "Gelöst",
  closed: "Abgeschlossen",
};

const portalStatusHint: Record<TicketStatus, string> = {
  open: "Wir haben Ihre Anfrage erhalten.",
  in_progress: "Wir kümmern uns darum.",
  waiting_customer: "Bitte antworten Sie uns im Ticket.",
  resolved: "Die Anfrage ist erledigt.",
  closed: "Das Ticket ist geschlossen.",
};

const priorityLabel: Record<TicketPriority, string> = {
  low: "Niedrig",
  normal: "Normal",
  high: "Hoch",
  critical: "Kritisch",
};

const sourceLabel: Record<TicketSource, string> = {
  portal: "Kundenportal",
  staff: "Intern",
  monitoring: "Monitoring",
};

const appointmentKindLabel: Record<Appointment["kind"], string> = {
  customer: "Kundentermin",
  internal: "Intern",
  personal: "Persönlich",
  other: "Sonstiges",
};

const reminderLabel = {
  hours24: "in 24 Stunden",
  hours1: "in 1 Stunde",
  morning: "heute Morgen",
} as const;

export type AppointmentReminderKind = keyof typeof reminderLabel;

async function customerName(db: Db, customerId: string): Promise<string> {
  const row = await db.select().from(customers).where(eq(customers.id, customerId)).get();
  return row?.company || row?.name || "Kunde";
}

async function mailCtx(db: Db) {
  const settings = await loadMailPublic(db);
  return {
    brand: settings.mailFromName?.trim() || "Systemhaus-Ess",
    staffHref: (path: string) =>
      settings.mailPublicUrl ? `${settings.mailPublicUrl}${path}` : undefined,
  };
}

function formatIsoDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: APP_TIMEZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function appointmentWhen(apt: Appointment): string {
  const startDate = formatIsoDate(apt.startDate);
  if (apt.allDay || !apt.startTime) {
    if (apt.endDate && apt.endDate !== apt.startDate) {
      return `${startDate} – ${formatIsoDate(apt.endDate)}, ganztägig`;
    }
    return `${startDate}, ganztägig`;
  }
  if (apt.endDate && apt.endDate !== apt.startDate) {
    const endTime = apt.endTime ? `, ${apt.endTime} Uhr` : "";
    return `${startDate}, ${apt.startTime} Uhr – ${formatIsoDate(apt.endDate)}${endTime}`;
  }
  if (apt.endTime && apt.endTime !== apt.startTime) {
    return `${startDate}, ${apt.startTime}–${apt.endTime} Uhr`;
  }
  return `${startDate}, ${apt.startTime} Uhr`;
}

function staffFooter(brand: string): string {
  return `Automatische Nachricht von ${brand}.`;
}

function customerFooter(brand: string, hasPortal: boolean): string {
  return hasPortal
    ? `Automatische Nachricht von ${brand}. Benachrichtigungen können Sie im Portal unter Konto anpassen.`
    : `Automatische Nachricht von ${brand}.`;
}

function ticketFacts(
  ticket: Ticket,
  name: string,
  audience: "staff" | "customer",
  extra: MailFact[] = [],
): MailFact[] {
  const status = audience === "staff" ? staffStatusLabel[ticket.status] : portalStatusLabel[ticket.status];
  const rows: MailFact[] = [
    { label: "Kunde", value: name },
    { label: "Ticket", value: ticket.number },
    { label: "Betreff", value: ticket.title },
    { label: "Status", value: status },
    { label: "Priorität", value: priorityLabel[ticket.priority] },
  ];
  if (audience === "staff") {
    rows.push({ label: "Quelle", value: sourceLabel[ticket.source] });
  }
  rows.push(...extra);
  return rows;
}

async function sendStaff(db: Db, kind: MailStaffKind, mail: Parameters<typeof sendMail>[1]) {
  const settings = await loadMailPublic(db);
  if (!mailReady(settings) || !settings.notify.staff[kind] || !settings.mailStaffInbox) return;
  await sendMail(db, { ...mail, to: settings.mailStaffInbox });
}

async function sendCustomer(
  db: Db,
  customerId: string,
  kind: MailCustomerKind,
  build: (href?: string) => Parameters<typeof sendMail>[1],
) {
  const settings = await loadMailPublic(db);
  if (!mailReady(settings) || !settings.notify.customer[kind]) return;
  const user = await db
    .select()
    .from(customerUsers)
    .where(eq(customerUsers.customerId, customerId))
    .get();
  if (user && !user.enabled) return;
  const customer = await db.select().from(customers).where(eq(customers.id, customerId)).get();
  const to = (user?.email?.trim() || customer?.email?.trim() || "");
  if (!isEmail(to)) {
    console.warn(`Mail Kunde ${kind}: keine gültige Adresse für ${customerId}`);
    return;
  }
  const prefs = parseCustomerMailNotify(user?.mailNotifyJson);
  if (!prefs[kind]) return;
  const href = settings.mailPublicUrl ? `${settings.mailPublicUrl}/portal` : undefined;
  const ok = await sendMail(db, { ...build(href), to });
  if (!ok) console.warn(`Mail Kunde ${kind}: Versand an ${to} fehlgeschlagen`);
}

function ticketTone(priority: TicketPriority): MailTone {
  return priority === "critical" || priority === "high" ? "warn" : "info";
}

/**
 * Neues Ticket: Staff-Postfach und Portal-Kunde.
 */
export async function notifyTicketCreated(db: Db, ticket: Ticket): Promise<void> {
  try {
    const ctx = await mailCtx(db);
    const name = await customerName(db, ticket.customerId);
    const excerpt = richTextPlain(ticket.description, 800);
    const created = formatDateTime(ticket.createdAt);
    await sendStaff(db, "ticketCreated", {
      to: "",
      subject: `[${ticket.number}] Neues Ticket: ${ticket.title}`,
      ...mailHtml({
        brand: ctx.brand,
        kicker: "Neues Ticket",
        title: ticket.title,
        intro:
          ticket.source === "portal"
            ? `${name} hat ein neues Ticket im Portal eröffnet.`
            : `Neues Ticket für ${name}.`,
        facts: ticketFacts(ticket, name, "staff", [{ label: "Eingegangen", value: created }]),
        body: excerpt || undefined,
        bodyLabel: excerpt ? "Beschreibung" : undefined,
        href: ctx.staffHref(`/tickets/${ticket.id}`),
        button: "Ticket öffnen",
        tone: ticketTone(ticket.priority),
        footer: staffFooter(ctx.brand),
      }),
    });
    await sendCustomer(db, ticket.customerId, "ticketCreated", (href) => ({
      to: "",
      subject: `Ticket ${ticket.number} eingegangen`,
      ...mailHtml({
        brand: ctx.brand,
        kicker: "Ticket",
        title: "Ihre Anfrage ist eingegangen",
        intro: portalStatusHint.open,
        facts: ticketFacts(ticket, name, "customer", [{ label: "Eingegangen", value: created }]),
        body: excerpt || undefined,
        bodyLabel: excerpt ? "Ihre Nachricht" : undefined,
        href: href ? `${href}/tickets/${ticket.id}` : undefined,
        button: "Im Portal öffnen",
        tone: "info",
        footer: customerFooter(ctx.brand, Boolean(href)),
      }),
    }));
  } catch (err) {
    console.error("Mail notifyTicketCreated:", err);
  }
}

/**
 * Öffentlicher Ticket-Kommentar.
 */
export async function notifyTicketComment(
  db: Db,
  ticket: Ticket,
  body: string,
  authorRole: "admin" | "customer",
): Promise<void> {
  try {
    const ctx = await mailCtx(db);
    const name = await customerName(db, ticket.customerId);
    const excerpt = richTextPlain(body, 800);
    const who = authorRole === "admin" ? `Antwort von ${ctx.brand}` : `Kommentar von ${name}`;
    await sendStaff(db, "ticketComment", {
      to: "",
      subject: `[${ticket.number}] ${who}`,
      ...mailHtml({
        brand: ctx.brand,
        kicker: "Ticket-Kommentar",
        title: ticket.title,
        intro: who,
        facts: ticketFacts(ticket, name, "staff", [
          { label: "Verfasser", value: authorRole === "admin" ? ctx.brand : name },
        ]),
        body: excerpt || undefined,
        bodyLabel: excerpt ? "Nachricht" : undefined,
        href: ctx.staffHref(`/tickets/${ticket.id}`),
        button: "Ticket öffnen",
        tone: "info",
        footer: staffFooter(ctx.brand),
      }),
    });
    await sendCustomer(db, ticket.customerId, "ticketComment", (href) => ({
      to: "",
      subject: `Neues zum Ticket ${ticket.number}`,
      ...mailHtml({
        brand: ctx.brand,
        kicker: "Ticket",
        title: ticket.title,
        intro: who,
        facts: ticketFacts(ticket, name, "customer"),
        body: excerpt || undefined,
        bodyLabel: excerpt ? "Nachricht" : undefined,
        href: href ? `${href}/tickets/${ticket.id}` : undefined,
        button: "Im Portal öffnen",
        tone: "info",
        footer: customerFooter(ctx.brand, Boolean(href)),
      }),
    }));
  } catch (err) {
    console.error("Mail notifyTicketComment:", err);
  }
}

/**
 * Ticket-Statuswechsel (explizit, nicht durch Kommentar).
 */
export async function notifyTicketStatus(
  db: Db,
  ticket: Ticket,
  from: TicketStatus,
  to: TicketStatus,
): Promise<void> {
  if (from === to) return;
  try {
    const ctx = await mailCtx(db);
    const name = await customerName(db, ticket.customerId);
    await sendStaff(db, "ticketStatus", {
      to: "",
      subject: `[${ticket.number}] Status: ${staffStatusLabel[to]}`,
      ...mailHtml({
        brand: ctx.brand,
        kicker: "Ticket-Status",
        title: ticket.title,
        intro: `Status von ${staffStatusLabel[from]} auf ${staffStatusLabel[to]} geändert.`,
        facts: ticketFacts(ticket, name, "staff", [
          { label: "Vorher", value: staffStatusLabel[from] },
          { label: "Jetzt", value: staffStatusLabel[to] },
        ]),
        href: ctx.staffHref(`/tickets/${ticket.id}`),
        button: "Ticket öffnen",
        tone: to === "resolved" || to === "closed" ? "ok" : "info",
        footer: staffFooter(ctx.brand),
      }),
    });
    await sendCustomer(db, ticket.customerId, "ticketStatus", (href) => ({
      to: "",
      subject: `Ticket ${ticket.number}: ${portalStatusLabel[to]}`,
      ...mailHtml({
        brand: ctx.brand,
        kicker: "Ticket",
        title: portalStatusLabel[to],
        intro: portalStatusHint[to],
        facts: ticketFacts(ticket, name, "customer", [
          { label: "Vorher", value: portalStatusLabel[from] },
        ]),
        href: href ? `${href}/tickets/${ticket.id}` : undefined,
        button: "Im Portal öffnen",
        tone: to === "resolved" || to === "closed" ? "ok" : "info",
        footer: customerFooter(ctx.brand, Boolean(href)),
      }),
    }));
  } catch (err) {
    console.error("Mail notifyTicketStatus:", err);
  }
}

async function notifyAppointment(
  db: Db,
  apt: Appointment,
  kind: "appointmentCreated" | "appointmentChanged" | "appointmentReminder",
  title: string,
  intro: string,
  method: "REQUEST" | "CANCEL",
  reminder?: AppointmentReminderKind,
): Promise<void> {
  try {
    const ctx = await mailCtx(db);
    const name = apt.customerId ? await customerName(db, apt.customerId) : "";
    const when = appointmentWhen(apt);
    const ics = { filename: `${apt.id}.ics`, content: appointmentIcs(apt, method) };
    const desc = apt.description?.trim() || "";
    const staffFacts: MailFact[] = [
      { label: "Termin", value: apt.title },
      { label: "Wann", value: when },
      { label: "Ort", value: apt.location?.trim() || "" },
      { label: "Art", value: appointmentKindLabel[apt.kind] },
      { label: "Kunde", value: name },
    ];
    if (reminder) staffFacts.push({ label: "Erinnerung", value: reminderLabel[reminder] });
    const tone: MailTone = method === "CANCEL" ? "warn" : kind === "appointmentReminder" ? "info" : "neutral";
    const icsNote =
      method === "CANCEL"
        ? "Die Absage liegt als Kalenderdatei (.ics) bei."
        : "Der Termin liegt als Kalenderdatei (.ics) bei.";
    await sendStaff(db, kind, {
      to: "",
      subject: title,
      ...mailHtml({
        brand: ctx.brand,
        kicker: kind === "appointmentReminder" ? "Termin-Erinnerung" : "Termin",
        title: apt.title,
        intro,
        facts: staffFacts,
        body: desc || undefined,
        bodyLabel: desc ? "Beschreibung" : undefined,
        href: ctx.staffHref("/calendar"),
        button: "Kalender öffnen",
        tone,
        note: icsNote,
        footer: staffFooter(ctx.brand),
      }),
      ics,
    });
    if (apt.kind === "customer" && apt.customerId) {
      const customerFacts: MailFact[] = [
        { label: "Termin", value: apt.title },
        { label: "Wann", value: when },
        { label: "Ort", value: apt.location?.trim() || "" },
      ];
      if (reminder) customerFacts.push({ label: "Erinnerung", value: reminderLabel[reminder] });
      await sendCustomer(db, apt.customerId, kind, (href) => ({
        to: "",
        subject: title,
        ...mailHtml({
          brand: ctx.brand,
          kicker: kind === "appointmentReminder" ? "Erinnerung" : "Termin",
          title: apt.title,
          intro,
          facts: customerFacts,
          body: desc || undefined,
          bodyLabel: desc ? "Hinweise" : undefined,
          href,
          button: "Portal öffnen",
          tone,
          note: icsNote,
          footer: customerFooter(ctx.brand, Boolean(href)),
        }),
        ics,
      }));
    }
  } catch (err) {
    console.error("Mail notifyAppointment:", err);
  }
}

export async function notifyAppointmentCreated(db: Db, apt: Appointment): Promise<void> {
  await notifyAppointment(db, apt, "appointmentCreated", `Termin: ${apt.title}`, "Ein neuer Termin wurde eingetragen.", "REQUEST");
}

export async function notifyAppointmentChanged(db: Db, apt: Appointment): Promise<void> {
  await notifyAppointment(db, apt, "appointmentChanged", `Termin geändert: ${apt.title}`, "Der Termin wurde aktualisiert.", "REQUEST");
}

export async function notifyAppointmentCancelled(db: Db, apt: Appointment): Promise<void> {
  await notifyAppointment(db, apt, "appointmentChanged", `Termin abgesagt: ${apt.title}`, "Der Termin wurde abgesagt.", "CANCEL");
}

export async function notifyAppointmentReminder(
  db: Db,
  apt: Appointment,
  reminder: AppointmentReminderKind = "hours24",
): Promise<void> {
  await notifyAppointment(
    db,
    apt,
    "appointmentReminder",
    `Erinnerung: ${apt.title}`,
    `Der Termin beginnt ${reminderLabel[reminder]}.`,
    "REQUEST",
    reminder,
  );
}

/**
 * Monitoring-Warnung neu (Staff und Kunde).
 */
export async function notifyMonitoringOpen(db: Db, ticket: Ticket): Promise<void> {
  try {
    const ctx = await mailCtx(db);
    const name = await customerName(db, ticket.customerId);
    const excerpt = richTextPlain(ticket.description, 800);
    const detected = formatDateTime(ticket.createdAt);
    await sendStaff(db, "monitoringOpen", {
      to: "",
      subject: `[${ticket.number}] Monitoring: ${ticket.title}`,
      ...mailHtml({
        brand: ctx.brand,
        kicker: "Monitoring-Warnung",
        title: ticket.title,
        intro: `Neue Warnung bei ${name}.`,
        facts: ticketFacts(ticket, name, "staff", [{ label: "Erkannt", value: detected }]),
        body: excerpt || undefined,
        bodyLabel: "Meldung",
        href: ctx.staffHref(`/tickets/${ticket.id}`),
        button: "Ticket öffnen",
        tone: "warn",
        footer: staffFooter(ctx.brand),
      }),
    });
    await sendCustomer(db, ticket.customerId, "monitoringOpen", (href) => ({
      to: "",
      subject: `Ticket ${ticket.number}: ${ticket.title}`,
      ...mailHtml({
        brand: ctx.brand,
        kicker: "Monitoring",
        title: ticket.title,
        intro: "An einem Ihrer Geräte ist eine Warnung aufgetreten. Wir haben automatisch ein Ticket eröffnet.",
        facts: ticketFacts(ticket, name, "customer", [{ label: "Erkannt", value: detected }]),
        body: excerpt || undefined,
        bodyLabel: excerpt ? "Meldung" : undefined,
        href: href ? `${href}/tickets/${ticket.id}` : undefined,
        button: "Im Portal öffnen",
        tone: "warn",
        footer: customerFooter(ctx.brand, Boolean(href)),
      }),
    }));
  } catch (err) {
    console.error("Mail notifyMonitoringOpen:", err);
  }
}

/**
 * Monitoring-Entwarnung (nur Staff).
 */
export async function notifyMonitoringClose(db: Db, ticket: Ticket, reason: string): Promise<void> {
  try {
    const ctx = await mailCtx(db);
    const name = await customerName(db, ticket.customerId);
    await sendStaff(db, "monitoringClose", {
      to: "",
      subject: `[${ticket.number}] Entwarnung: ${ticket.title}`,
      ...mailHtml({
        brand: ctx.brand,
        kicker: "Monitoring-Entwarnung",
        title: ticket.title,
        intro: `Die Warnung bei ${name} ist behoben.`,
        facts: ticketFacts(ticket, name, "staff"),
        body: reason || undefined,
        bodyLabel: reason ? "Grund" : undefined,
        href: ctx.staffHref(`/tickets/${ticket.id}`),
        button: "Ticket öffnen",
        tone: "ok",
        footer: staffFooter(ctx.brand),
      }),
    });
  } catch (err) {
    console.error("Mail notifyMonitoringClose:", err);
  }
}
