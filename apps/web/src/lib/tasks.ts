import { localTodayIso, parseDateOnly } from "./dates";
import type { TaskItem, TaskPriority } from "../types";

export type TaskView = "today" | "upcoming" | "inbox" | "open" | "done";

export const taskViewTabs: { id: TaskView; label: string; hint: string }[] = [
  { id: "today", label: "Heute", hint: "Fällig heute oder überfällig" },
  { id: "upcoming", label: "Geplant", hint: "Mit Datum in der Zukunft" },
  { id: "inbox", label: "Inbox", hint: "Ohne Fälligkeit" },
  { id: "open", label: "Offen", hint: "Alle offenen Aufgaben" },
  { id: "done", label: "Erledigt", hint: "Abgehakte Aufgaben" },
];

export const priorityLabel: Record<TaskPriority, string> = {
  1: "Dringend",
  2: "Hoch",
  3: "Mittel",
  4: "Normal",
};

/** API-View für Kunden-Tasks (`open` → alle offenen). */
export function apiViewFor(view: TaskView): string | undefined {
  if (view === "open") return undefined;
  return view;
}

/** Relatives Fälligkeitslabel (Heute / Morgen / Überfällig …). */
export function dueLabel(dueDate: string | null | undefined, done = false): {
  text: string;
  tone: "muted" | "today" | "soon" | "overdue" | "ok";
} {
  if (!dueDate) return { text: "Kein Datum", tone: "muted" };
  if (done) return { text: formatShortDue(dueDate), tone: "muted" };

  const today = localTodayIso();
  if (dueDate < today) return { text: `Überfällig · ${formatShortDue(dueDate)}`, tone: "overdue" };
  if (dueDate === today) return { text: "Heute", tone: "today" };

  const tomorrow = addDaysIsoLocal(today, 1);
  if (dueDate === tomorrow) return { text: "Morgen", tone: "soon" };

  const inDays = daysBetween(today, dueDate);
  if (inDays <= 7) return { text: `In ${inDays} Tagen`, tone: "soon" };
  return { text: formatShortDue(dueDate), tone: "ok" };
}

function formatShortDue(iso: string): string {
  try {
    return new Intl.DateTimeFormat("de-DE", {
      day: "2-digit",
      month: "short",
    }).format(parseDateOnly(iso));
  } catch {
    return iso;
  }
}

function addDaysIsoLocal(iso: string, days: number): string {
  const d = parseDateOnly(iso);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = parseDateOnly(fromIso).getTime();
  const b = parseDateOnly(toIso).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function tomorrowIso(): string {
  return addDaysIsoLocal(localTodayIso(), 1);
}

/** Gruppiert offene Aufgaben für die Ansicht „Offen“. */
export function groupOpenTasks(tasks: TaskItem[]): { key: string; title: string; items: TaskItem[] }[] {
  const today = localTodayIso();
  const buckets: Record<string, TaskItem[]> = {
    overdue: [],
    today: [],
    upcoming: [],
    inbox: [],
    done: [],
  };

  for (const t of tasks) {
    if (t.done) {
      buckets.done!.push(t);
      continue;
    }
    if (!t.dueDate) buckets.inbox!.push(t);
    else if (t.dueDate < today) buckets.overdue!.push(t);
    else if (t.dueDate === today) buckets.today!.push(t);
    else buckets.upcoming!.push(t);
  }

  const order: { key: string; title: string }[] = [
    { key: "overdue", title: "Überfällig" },
    { key: "today", title: "Heute" },
    { key: "upcoming", title: "Geplant" },
    { key: "inbox", title: "Inbox" },
    { key: "done", title: "Erledigt" },
  ];

  return order
    .map((o) => ({ ...o, items: buckets[o.key] ?? [] }))
    .filter((g) => g.items.length > 0);
}
