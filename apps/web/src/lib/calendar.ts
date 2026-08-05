/** ISO-Datum YYYY-MM-DD aus lokalem Date. */
export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Datum aus ISO YYYY-MM-DD (mittags, Zeitzonen-sicher). */
export function fromIsoDate(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
}

/** Ersten Tag des Monats (lokal). */
export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Letzten Tag des Monats (lokal). */
export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

/** Montag der Woche (lokal). */
export function startOfWeek(d: Date): Date {
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const offset = (day.getDay() + 6) % 7;
  day.setDate(day.getDate() - offset);
  return day;
}

/** 7 Tage ab Montag der Woche. */
export function buildWeekDays(anchor: Date): Date[] {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

/**
 * Kalendergitter Mo–So für einen Monat (immer 6 Wochen / 42 Tage).
 */
export function buildMonthGrid(month: Date): Date[] {
  const first = startOfMonth(month);
  const startOffset = (first.getDay() + 6) % 7;
  const cursor = new Date(first);
  cursor.setDate(first.getDate() - startOffset);
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export function monthLabel(d: Date): string {
  return new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" }).format(d);
}

export function weekLabel(anchor: Date): string {
  const days = buildWeekDays(anchor);
  const a = days[0]!;
  const b = days[6]!;
  const sameMonth = a.getMonth() === b.getMonth();
  const left = new Intl.DateTimeFormat("de-DE", {
    day: "numeric",
    month: sameMonth ? undefined : "short",
  }).format(a);
  const right = new Intl.DateTimeFormat("de-DE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(b);
  return `${left} – ${right}`;
}

export function dayLabel(iso: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(fromIsoDate(iso));
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Ob ein Termin an einem Kalendertag liegt (inkl. Mehrtägig). */
export function appointmentTouchesDate(
  startDate: string,
  endDate: string | null | undefined,
  dayIso: string,
): boolean {
  const end = endDate || startDate;
  return dayIso >= startDate && dayIso <= end;
}

export function formatAppointmentTime(opts: {
  allDay: boolean;
  startTime: string | null;
  endTime: string | null;
}): string {
  if (opts.allDay || !opts.startTime) return "Ganztägig";
  if (opts.endTime) return `${opts.startTime}–${opts.endTime}`;
  return opts.startTime;
}

/** Minuten seit Mitternacht aus HH:mm. */
export function timeToMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Position eines Termins in einer Tageszeitleiste (Prozent von oben / Höhe).
 * @param dayStartHour Startstunde der sichtbaren Leiste
 * @param dayEndHour Endstunde der sichtbaren Leiste
 */
export function timedEventLayout(
  opts: { allDay: boolean; startTime: string | null; endTime: string | null },
  dayStartHour = 7,
  dayEndHour = 20,
): { top: number; height: number } | null {
  if (opts.allDay || !opts.startTime) return null;
  const startMin = timeToMinutes(opts.startTime);
  if (startMin == null) return null;
  const endMin = timeToMinutes(opts.endTime) ?? startMin + 60;
  const rangeStart = dayStartHour * 60;
  const rangeEnd = dayEndHour * 60;
  const span = rangeEnd - rangeStart;
  const clampedStart = Math.max(rangeStart, Math.min(rangeEnd, startMin));
  const clampedEnd = Math.max(clampedStart + 20, Math.min(rangeEnd, endMin));
  return {
    top: ((clampedStart - rangeStart) / span) * 100,
    height: ((clampedEnd - clampedStart) / span) * 100,
  };
}

/** Stunden-Labels für die Zeitleiste. */
export function hourLabels(dayStartHour = 7, dayEndHour = 20): number[] {
  const hours: number[] = [];
  for (let h = dayStartHour; h < dayEndHour; h++) hours.push(h);
  return hours;
}

export function formatHour(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}
