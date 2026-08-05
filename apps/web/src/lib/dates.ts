/** Standard-Zeitzone der Plattform (DE). */
export const APP_TIMEZONE = "Europe/Berlin";

/**
 * Heutiges Datum als `YYYY-MM-DD` in lokaler Browser-Zeit
 * (nicht UTC – vermeidet Off-by-one abends/nachts).
 */
export function localTodayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Parst ein reines Datum `YYYY-MM-DD` als lokalen Kalendertag (mittags).
 * Vermeidet UTC-Mitternacht, die in DE oft als Vortag angezeigt wird.
 */
export function parseDateOnly(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return new Date(iso);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
}

/** Addiert Minuten zu einer `HH:mm`-Uhrzeit (lokal, wrappt über Mitternacht). */
export function addMinutesToTime(time: string, minutes: number): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return time;
  const total = (Number(m[1]) * 60 + Number(m[2]) + minutes + 24 * 60) % (24 * 60);
  const h = Math.floor(total / 60);
  const min = total % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
