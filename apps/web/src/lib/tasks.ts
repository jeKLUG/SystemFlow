import { localTodayIso, parseDateOnly } from "./dates";
import type { TaskItem, TaskPriority } from "../types";

export type TaskView = "today" | "upcoming" | "inbox" | "open" | "done";
export type TaskSort = "priority" | "due" | "title" | "updated";
export type TaskGroupBy = "auto" | "project" | "none";

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

export const sortOptions: { id: TaskSort; label: string }[] = [
  { id: "priority", label: "Priorität" },
  { id: "due", label: "Fälligkeit" },
  { id: "title", label: "Titel" },
  { id: "updated", label: "Zuletzt" },
];

/** API-View für Kunden-Tasks (`open` → alle). */
export function apiViewFor(view: TaskView): string | undefined {
  if (view === "open") return undefined;
  return view;
}

/** Relatives Fälligkeitslabel (Heute / Morgen / Überfällig …). */
export function dueLabel(
  dueDate: string | null | undefined,
  done = false,
): {
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

/** Nächster Montag (oder +7 Tage ab heute, wenn heute Montag). */
export function nextWeekIso(): string {
  const today = parseDateOnly(localTodayIso());
  const day = today.getDay(); // 0 So … 6 Sa
  const daysUntilMonday = day === 0 ? 1 : day === 1 ? 7 : 8 - day;
  return addDaysIsoLocal(localTodayIso(), daysUntilMonday);
}

export function addDaysIso(iso: string, days: number): string {
  return addDaysIsoLocal(iso, days);
}

/** Filtert Aufgaben nach Ansicht (clientseitig). */
export function filterTasksByView(tasks: TaskItem[], view: TaskView): TaskItem[] {
  const today = localTodayIso();
  switch (view) {
    case "today":
      return tasks.filter((t) => !t.done && t.dueDate && t.dueDate <= today);
    case "upcoming":
      return tasks.filter((t) => !t.done && t.dueDate && t.dueDate > today);
    case "inbox":
      return tasks.filter((t) => !t.done && !t.dueDate);
    case "open":
      return tasks.filter((t) => !t.done);
    case "done":
      return tasks.filter((t) => t.done);
    default:
      return tasks;
  }
}

/** Zählt Aufgaben je Ansicht. */
export function countTasksByView(tasks: TaskItem[]): Record<TaskView, number> {
  return {
    today: filterTasksByView(tasks, "today").length,
    upcoming: filterTasksByView(tasks, "upcoming").length,
    inbox: filterTasksByView(tasks, "inbox").length,
    open: filterTasksByView(tasks, "open").length,
    done: filterTasksByView(tasks, "done").length,
  };
}

/** Kennzahlen für Hero. */
export function summarizeTasks(tasks: TaskItem[]) {
  const today = localTodayIso();
  const open = tasks.filter((t) => !t.done);
  return {
    open: open.length,
    overdue: open.filter((t) => t.dueDate && t.dueDate < today).length,
    today: open.filter((t) => t.dueDate && t.dueDate <= today).length,
    inbox: open.filter((t) => !t.dueDate).length,
    done: tasks.filter((t) => t.done).length,
  };
}

/** Sortiert Aufgaben. */
export function sortTasks(tasks: TaskItem[], sort: TaskSort): TaskItem[] {
  const list = [...tasks];
  const prio = (t: TaskItem) => Number(t.priority || 4);
  switch (sort) {
    case "priority":
      return list.sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        if (prio(a) !== prio(b)) return prio(a) - prio(b);
        return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
      });
    case "due":
      return list.sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        const da = a.dueDate ?? "9999";
        const db = b.dueDate ?? "9999";
        if (da !== db) return da.localeCompare(db);
        return prio(a) - prio(b);
      });
    case "title":
      return list.sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        return a.title.localeCompare(b.title, "de");
      });
    case "updated":
      return list.sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
      });
    default:
      return list;
  }
}

export type TaskGroup = { key: string; title: string; items: TaskItem[] };

/** Gruppiert offene Aufgaben für die Ansicht „Offen“. */
export function groupOpenTasks(tasks: TaskItem[]): TaskGroup[] {
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

/** Gruppiert geplante Aufgaben nach Fälligkeitstag. */
export function groupByDueDate(tasks: TaskItem[]): TaskGroup[] {
  const map = new Map<string, TaskItem[]>();
  for (const t of tasks) {
    const key = t.dueDate || "none";
    const list = map.get(key);
    if (list) list.push(t);
    else map.set(key, [t]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, items]) => ({
      key,
      title: key === "none" ? "Ohne Datum" : dueDayHeading(key),
      items,
    }));
}

function dueDayHeading(iso: string): string {
  const due = dueLabel(iso);
  if (due.tone === "today" || due.tone === "soon" || due.tone === "overdue") {
    try {
      const weekday = new Intl.DateTimeFormat("de-DE", { weekday: "long" }).format(
        parseDateOnly(iso),
      );
      return `${due.text} · ${weekday}`;
    } catch {
      return due.text;
    }
  }
  try {
    return new Intl.DateTimeFormat("de-DE", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(parseDateOnly(iso));
  } catch {
    return formatShortDue(iso);
  }
}

/** Gruppiert nach Projekt. */
export function groupByProject(tasks: TaskItem[]): TaskGroup[] {
  const map = new Map<string, { title: string; items: TaskItem[] }>();
  for (const t of tasks) {
    const key = t.projectId || "none";
    const title = t.projectName?.trim() || "Ohne Projekt";
    const entry = map.get(key);
    if (entry) entry.items.push(t);
    else map.set(key, { title, items: [t] });
  }
  return [...map.entries()]
    .sort((a, b) => {
      if (a[0] === "none") return 1;
      if (b[0] === "none") return -1;
      return a[1].title.localeCompare(b[1].title, "de");
    })
    .map(([key, g]) => ({ key, title: g.title, items: g.items }));
}

/** Baut Gruppen je nach Ansicht und Gruppierungsmodus. */
export function buildTaskGroups(
  tasks: TaskItem[],
  view: TaskView,
  groupBy: TaskGroupBy,
): TaskGroup[] {
  if (groupBy === "project") return groupByProject(tasks);
  if (groupBy === "none") return [{ key: "flat", title: "", items: tasks }];
  if (view === "open") return groupOpenTasks(tasks);
  if (view === "upcoming") return groupByDueDate(tasks);
  return [{ key: "flat", title: "", items: tasks }];
}
