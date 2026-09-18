import { eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import {
  customerUsers,
  customers,
  type Appointment,
  type Ticket,
  type TicketStatus,
} from "../db/schema.js";
import { loadMailPublic, mailHtml, mailReady, sendMail } from "./mail.js";
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

async function customerName(db: Db, customerId: string): Promise<string> {
  const row = await db.select().from(customers).where(eq(customers.id, customerId)).get();
  return row?.company || row?.name || "Kunde";
}

async function staffHref(db: Db, path: string): Promise<string | undefined> {
  const settings = await loadMailPublic(db);
  if (!settings.mailPublicUrl) return undefined;
  return `${settings.mailPublicUrl}${path}`;
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
  if (!user?.enabled || !user.email) return;
  const prefs = parseCustomerMailNotify(user.mailNotifyJson);
  if (!prefs[kind]) return;
  const href = settings.mailPublicUrl ? `${settings.mailPublicUrl}/portal` : undefined;
  await sendMail(db, { ...build(href), to: user.email });
}

/**
 * Neues Ticket: Staff-Postfach und Portal-Kunde.
 */
export async function notifyTicketCreated(db: Db, ticket: Ticket): Promise<void> {
  try {
    const name = await customerName(db, ticket.customerId);
    const excerpt = richTextPlain(ticket.description);
    const staffLink = await staffHref(db, `/tickets/${ticket.id}`);
    await sendStaff(db, "ticketCreated", {
      to: "",
      subject: `[${ticket.number}] Neues Ticket: ${ticket.title}`,
      ...mailHtml({
        title: `Neues Ticket ${ticket.number}`,
        intro: `${name}: ${ticket.title}`,
        body: excerpt || undefined,
        href: staffLink,
        button: "Ticket öffnen",
      }),
    });
    await sendCustomer(db, ticket.customerId, "ticketCreated", (href) => ({
      to: "",
      subject: `Ticket ${ticket.number} eingegangen`,
      ...mailHtml({
        title: "Wir haben Ihre Anfrage erhalten",
        intro: `${ticket.number}: ${ticket.title}`,
        body: excerpt || undefined,
        href: href ? `${href}/tickets/${ticket.id}` : undefined,
        button: "Im Portal öffnen",
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
    const name = await customerName(db, ticket.customerId);
    const excerpt = richTextPlain(body);
    const who = authorRole === "admin" ? "Antwort vom Systemhaus" : `Kommentar von ${name}`;
    const staffLink = await staffHref(db, `/tickets/${ticket.id}`);
    await sendStaff(db, "ticketComment", {
      to: "",
      subject: `[${ticket.number}] ${who}`,
      ...mailHtml({
        title: who,
        intro: `${ticket.number}: ${ticket.title}`,
        body: excerpt || undefined,
        href: staffLink,
        button: "Ticket öffnen",
      }),
    });
    await sendCustomer(db, ticket.customerId, "ticketComment", (href) => ({
      to: "",
      subject: `Neues zum Ticket ${ticket.number}`,
      ...mailHtml({
        title: who,
        intro: `${ticket.number}: ${ticket.title}`,
        body: excerpt || undefined,
        href: href ? `${href}/tickets/${ticket.id}` : undefined,
        button: "Im Portal öffnen",
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
    const name = await customerName(db, ticket.customerId);
    const staffLink = await staffHref(db, `/tickets/${ticket.id}`);
    await sendStaff(db, "ticketStatus", {
      to: "",
      subject: `[${ticket.number}] Status: ${staffStatusLabel[to]}`,
      ...mailHtml({
        title: `Status ${staffStatusLabel[from]} → ${staffStatusLabel[to]}`,
        intro: `${name}: ${ticket.number} ${ticket.title}`,
        href: staffLink,
        button: "Ticket öffnen",
      }),
    });
    await sendCustomer(db, ticket.customerId, "ticketStatus", (href) => ({
      to: "",
      subject: `Ticket ${ticket.number}: ${portalStatusLabel[to]}`,
      ...mailHtml({
        title: portalStatusLabel[to],
        intro: `${ticket.number}: ${ticket.title}`,
        href: href ? `${href}/tickets/${ticket.id}` : undefined,
        button: "Im Portal öffnen",
      }),
    }));
  } catch (err) {
    console.error("Mail notifyTicketStatus:", err);
  }
}

function appointmentWhen(apt: Appointment): string {
  const time = apt.allDay || !apt.startTime ? "ganztägig" : apt.startTime;
  const end = apt.endDate && apt.endDate !== apt.startDate ? ` bis ${apt.endDate}` : "";
  return `${apt.startDate} ${time}${end}${apt.location ? ` · ${apt.location}` : ""}`;
}

async function notifyAppointment(
  db: Db,
  apt: Appointment,
  kind: "appointmentCreated" | "appointmentChanged" | "appointmentReminder",
  title: string,
  method: "REQUEST" | "CANCEL",
): Promise<void> {
  try {
    const when = appointmentWhen(apt);
    const ics = { filename: `${apt.id}.ics`, content: appointmentIcs(apt, method) };
    const staffLink = await staffHref(db, "/calendar");
    await sendStaff(db, kind, {
      to: "",
      subject: title,
      ...mailHtml({
        title,
        intro: `${apt.title} · ${when}`,
        body: apt.description || undefined,
        href: staffLink,
        button: "Kalender öffnen",
      }),
      ics,
    });
    if (apt.kind === "customer" && apt.customerId) {
      await sendCustomer(db, apt.customerId, kind, (href) => ({
        to: "",
        subject: title,
        ...mailHtml({
          title,
          intro: `${apt.title} · ${when}`,
          body: apt.description || undefined,
          href,
          button: "Portal öffnen",
        }),
        ics,
      }));
    }
  } catch (err) {
    console.error("Mail notifyAppointment:", err);
  }
}

export async function notifyAppointmentCreated(db: Db, apt: Appointment): Promise<void> {
  await notifyAppointment(db, apt, "appointmentCreated", `Termin: ${apt.title}`, "REQUEST");
}

export async function notifyAppointmentChanged(db: Db, apt: Appointment): Promise<void> {
  await notifyAppointment(db, apt, "appointmentChanged", `Termin geändert: ${apt.title}`, "REQUEST");
}

export async function notifyAppointmentCancelled(db: Db, apt: Appointment): Promise<void> {
  await notifyAppointment(db, apt, "appointmentChanged", `Termin abgesagt: ${apt.title}`, "CANCEL");
}

export async function notifyAppointmentReminder(db: Db, apt: Appointment): Promise<void> {
  await notifyAppointment(db, apt, "appointmentReminder", `Erinnerung: ${apt.title}`, "REQUEST");
}

/**
 * Monitoring-Warnung neu (nur Staff).
 */
export async function notifyMonitoringOpen(db: Db, ticket: Ticket): Promise<void> {
  try {
    const name = await customerName(db, ticket.customerId);
    const staffLink = await staffHref(db, `/tickets/${ticket.id}`);
    await sendStaff(db, "monitoringOpen", {
      to: "",
      subject: `[${ticket.number}] Monitoring: ${ticket.title}`,
      ...mailHtml({
        title: "Monitoring-Warnung",
        intro: `${name}: ${ticket.title}`,
        body: richTextPlain(ticket.description) || undefined,
        href: staffLink,
        button: "Ticket öffnen",
      }),
    });
  } catch (err) {
    console.error("Mail notifyMonitoringOpen:", err);
  }
}

/**
 * Monitoring-Entwarnung (nur Staff).
 */
export async function notifyMonitoringClose(db: Db, ticket: Ticket, reason: string): Promise<void> {
  try {
    const name = await customerName(db, ticket.customerId);
    const staffLink = await staffHref(db, `/tickets/${ticket.id}`);
    await sendStaff(db, "monitoringClose", {
      to: "",
      subject: `[${ticket.number}] Entwarnung: ${ticket.title}`,
      ...mailHtml({
        title: "Monitoring-Entwarnung",
        intro: `${name}: ${ticket.title}`,
        body: reason,
        href: staffLink,
        button: "Ticket öffnen",
      }),
    });
  } catch (err) {
    console.error("Mail notifyMonitoringClose:", err);
  }
}
