/** ISO-Datum YYYY-MM-DD aus lokalem Date. */
export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Ersten Tag des Monats (lokal). */
export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Letzten Tag des Monats (lokal). */
export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
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
