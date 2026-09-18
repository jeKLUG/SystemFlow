import type { Appointment } from "../db/schema.js";
import { APP_TIMEZONE, addDaysIso } from "./dates.js";

function icsEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length) {
    parts.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }
  return parts.join("\r\n");
}

function stamp(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const h = String(date.getUTCHours()).padStart(2, "0");
  const min = String(date.getUTCMinutes()).padStart(2, "0");
  const s = String(date.getUTCSeconds()).padStart(2, "0");
  return `${y}${m}${d}T${h}${min}${s}Z`;
}

function dateValue(iso: string): string {
  return iso.replace(/-/g, "");
}

/**
 * Baut eine iCalendar-Datei für einen Termin (REQUEST oder CANCEL).
 */
export function appointmentIcs(apt: Appointment, method: "REQUEST" | "CANCEL"): string {
  const uid = `${apt.id}@systemhaus-ess`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Systemhaus-Ess//DE",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp(new Date())}`,
  ];
  if (apt.allDay || !apt.startTime) {
    const start = dateValue(apt.startDate);
    const end = dateValue(addDaysIso(apt.endDate || apt.startDate, 1));
    lines.push(`DTSTART;VALUE=DATE:${start}`);
    lines.push(`DTEND;VALUE=DATE:${end}`);
  } else {
    const start = `${dateValue(apt.startDate)}T${apt.startTime.replace(":", "")}00`;
    const endTime = apt.endTime || apt.startTime;
    const endDate = apt.endDate || apt.startDate;
    const end = `${dateValue(endDate)}T${endTime.replace(":", "")}00`;
    lines.push(`DTSTART;TZID=${APP_TIMEZONE}:${start}`);
    lines.push(`DTEND;TZID=${APP_TIMEZONE}:${end}`);
  }
  lines.push(`SUMMARY:${icsEscape(apt.title)}`);
  if (apt.description) lines.push(`DESCRIPTION:${icsEscape(apt.description)}`);
  if (apt.location) lines.push(`LOCATION:${icsEscape(apt.location)}`);
  if (method === "CANCEL") lines.push("STATUS:CANCELLED");
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
