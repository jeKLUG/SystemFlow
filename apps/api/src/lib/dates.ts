/** Standard-Zeitzone für „heute“ / Erinnerungen (Deploy oft UTC). */
export const APP_TIMEZONE = process.env.APP_TIMEZONE || "Europe/Berlin";

/**
 * Kalendertag `YYYY-MM-DD` in der App-Zeitzone (nicht Server-UTC).
 */
export function todayIso(timeZone: string = APP_TIMEZONE): string {
  // en-CA liefert YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Addiert Tage zu einem ISO-Datum `YYYY-MM-DD` (kalendarisch).
 */
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + days));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
