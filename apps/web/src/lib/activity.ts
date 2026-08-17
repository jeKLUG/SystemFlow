import { formatDateOnly } from "./labels";

export type ActivityKind =
  | "time"
  | "wiki"
  | "appointment"
  | "project"
  | "asset"
  | "email"
  | "manual";

const kindMeta: Record<
  ActivityKind,
  { label: string; className: string }
> = {
  time: { label: "Zeit", className: "is-time" },
  wiki: { label: "Wiki", className: "is-wiki" },
  appointment: { label: "Termin", className: "is-appointment" },
  project: { label: "Projekt", className: "is-project" },
  asset: { label: "Gerät", className: "is-asset" },
  email: { label: "E-Mail", className: "is-email" },
  manual: { label: "Einsatz", className: "is-manual" },
};

/**
 * Leitet die Aktivitätsart aus dem Titel ab (automatische Einträge nutzen feste Präfixe).
 */
export function detectActivityKind(title: string): ActivityKind {
  const t = title.trim().toLowerCase();
  if (t.startsWith("zeit erfasst")) return "time";
  if (t.startsWith("wiki")) return "wiki";
  if (t.startsWith("termin")) return "appointment";
  if (t.startsWith("projekt")) return "project";
  if (t.startsWith("e-mail") || t.startsWith("email")) return "email";
  if (t.includes("anlage") || t.includes("gerät") || t.includes("netzwerk")) return "asset";
  return "manual";
}

/** Anzeige-Metadaten zur Aktivitätsart. */
export function activityKindMeta(kind: ActivityKind) {
  return kindMeta[kind];
}

/** Kalendertag `YYYY-MM-DD` lokal aus Timestamp. */
export function activityDayKey(value: string | Date): string {
  const d = new Date(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Gruppierungsschlüssel-Label (Heute / Gestern / Datum). */
export function activityDayLabel(dayKey: string): string {
  const today = activityDayKey(new Date());
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = activityDayKey(yesterdayDate);
  if (dayKey === today) return "Heute";
  if (dayKey === yesterday) return "Gestern";
  return formatDateOnly(dayKey);
}

/**
 * Formatiert ISO-Daten in Titeln/Beschreibungen für die Anzeige.
 */
export function polishActivityText(text: string): string {
  return text
    .replace(/\bam (\d{4}-\d{2}-\d{2})\b/g, (_, iso: string) => `am ${formatDateOnly(iso)}`)
    .replace(
      /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}:\d{2}))?$/,
      (_, iso: string, time?: string) =>
        time ? `${formatDateOnly(iso)} · ${time}` : formatDateOnly(iso),
    );
}

/**
 * Gruppiert Aktivitäten nach lokalem Kalendertag (neueste zuerst).
 */
export function groupActivitiesByDay<T extends { occurredAt: string }>(
  items: T[],
): { dayKey: string; label: string; items: T[] }[] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = activityDayKey(item.occurredAt);
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, group]) => ({
      dayKey: key,
      label: activityDayLabel(key),
      items: group,
    }));
}
