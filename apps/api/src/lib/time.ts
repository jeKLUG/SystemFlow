const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Parst eine Uhrzeit `HH:mm` in Minuten seit Mitternacht.
 */
export function parseTimeToMinutes(value: string): number | null {
  const m = TIME_RE.exec(value.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Berechnet Stunden aus Start-/Endzeit (`HH:mm`).
 * Endzeit vor Startzeit gilt als Übernacht (bis +24h).
 */
export function hoursFromRange(startTime: string, endTime: string): number | null {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  if (start == null || end == null) return null;
  let diff = end - start;
  if (diff <= 0) diff += 24 * 60;
  const hours = Math.round((diff / 60) * 100) / 100;
  if (hours <= 0 || hours > 24) return null;
  return hours;
}
