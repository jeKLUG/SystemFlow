const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Berechnet Stunden aus Start-/Endzeit (`HH:mm`), inkl. Übernacht.
 */
export function hoursFromRange(startTime: string, endTime: string): number | null {
  const sm = TIME_RE.exec(startTime.trim());
  const em = TIME_RE.exec(endTime.trim());
  if (!sm || !em) return null;
  const start = Number(sm[1]) * 60 + Number(sm[2]);
  const end = Number(em[1]) * 60 + Number(em[2]);
  let diff = end - start;
  if (diff <= 0) diff += 24 * 60;
  const hours = Math.round((diff / 60) * 100) / 100;
  if (hours <= 0 || hours > 24) return null;
  return hours;
}

/**
 * Formatiert Stunden lesbar (z. B. `2,5 h` / `2h 30m`).
 */
export function formatHours(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 0) return `${h}h`;
  if (h === 0) return `${m}min`;
  return `${h}h ${m}min`;
}
