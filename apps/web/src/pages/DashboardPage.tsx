import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { ChartLegend, ColumnChart, DonutChart, HBarChart } from "../components/DashCharts";
import { customerDisplayName } from "../lib/customer";
import { localTodayIso } from "../lib/dates";
import { appointmentKindLabel, formatDateOnly } from "../lib/labels";
import {
  addDaysIso,
  dueLabel,
  filterTasksByView,
  priorityLabel,
  sortTasks,
  summarizeTasks,
} from "../lib/tasks";
import type {
  AppointmentItem,
  Reminders,
  Stats,
  TaskItem,
  TaskPriority,
} from "../types";

const prioColors: Record<TaskPriority, string> = {
  1: "#f87171",
  2: "#fbbf24",
  3: "#60a5fa",
  4: "#94a3b8",
};

/**
 * Kompaktes Start-Dashboard: Kennzahlen, drei Diagramme, Heute-Fokus.
 */
export function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [openTasks, setOpenTasks] = useState<TaskItem[]>([]);
  const [reminders, setReminders] = useState<Reminders | null>(null);
  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const todayIso = localTodayIso();
  const weekEnd = addDaysIso(todayIso, 6);

  useEffect(() => {
    void Promise.all([
      api.stats(),
      api.openTasks(),
      api.reminders(30),
      api.appointments({ from: todayIso, to: weekEnd }),
    ])
      .then(([s, t, rem, appts]) => {
        setStats(s);
        setOpenTasks(sortTasks(t, "due"));
        setReminders(rem);
        setAppointments(appts);
      })
      .finally(() => setLoading(false));
  }, [todayIso, weekEnd]);

  const summary = useMemo(() => summarizeTasks(openTasks), [openTasks]);

  const reminderTotal = useMemo(() => {
    if (!reminders) return 0;
    return reminders.warranties.length + reminders.contracts.length + reminders.tasks.length;
  }, [reminders]);

  const todayAppts = appointments.filter((a) => a.startDate === todayIso);
  const upcomingAppts = appointments.filter((a) => a.startDate !== todayIso).slice(0, 4);

  const focusTasks = useMemo(() => {
    const today = sortTasks(filterTasksByView(openTasks, "today"), "due");
    if (today.length > 0) return today.slice(0, 6);
    return sortTasks(openTasks.filter((t) => !t.done), "due").slice(0, 6);
  }, [openTasks]);

  const statusSlices = useMemo(
    () =>
      [
        { label: "Überfällig", value: summary.overdue, color: "#f87171" },
        {
          label: "Heute",
          value: Math.max(0, summary.today - summary.overdue),
          color: "#60a5fa",
        },
        {
          label: "Geplant",
          value: filterTasksByView(openTasks, "upcoming").length,
          color: "#34d399",
        },
        { label: "Inbox", value: summary.inbox, color: "#94a3b8" },
      ].filter((s) => s.value > 0),
    [summary, openTasks],
  );

  const prioBars = useMemo(() => {
    const counts: Record<TaskPriority, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const t of openTasks.filter((x) => !x.done)) {
      const p = (Number(t.priority) || 4) as TaskPriority;
      counts[p] += 1;
    }
    return ([1, 2, 3, 4] as TaskPriority[])
      .map((p) => ({
        label: priorityLabel[p],
        value: counts[p],
        color: prioColors[p],
      }))
      .filter((x) => x.value > 0);
  }, [openTasks]);

  const weekColumns = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const iso = addDaysIso(todayIso, i);
      const d = new Date(`${iso}T12:00:00`);
      const label = new Intl.DateTimeFormat("de-DE", { weekday: "short" }).format(d);
      const value = appointments.filter(
        (a) => a.startDate <= iso && (a.endDate || a.startDate) >= iso,
      ).length;
      return {
        label,
        value,
        active: iso === todayIso,
        tone: value > 0 ? "linear-gradient(180deg, #93c5fd, #3b82f6)" : undefined,
      };
    });
  }, [appointments, todayIso]);

  async function toggleDone(task: TaskItem) {
    setBusyId(task.id);
    try {
      await api.updateTask(task.id, { done: true });
      setOpenTasks((prev) => prev.filter((t) => t.id !== task.id));
    } finally {
      setBusyId(null);
    }
  }

  const greet = greeting();
  const dateLabel = new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  const taskSlices =
    statusSlices.length > 0
      ? statusSlices
      : summary.open > 0
        ? [{ label: "Offen", value: summary.open, color: "#60a5fa" }]
        : [];

  return (
    <div className="page dashboard-page dash-compact">
      <header className="page-header dashboard-header">
        <div>
          <p className="eyebrow">{dateLabel}</p>
          <h2>{greet}</h2>
        </div>
        <div className="page-actions dashboard-actions">
          <Link className="btn btn-ghost btn-sm" to="/calendar">
            Kalender
          </Link>
          <Link className="btn btn-ghost btn-sm dashboard-action-secondary" to="/customers">
            Kunden
          </Link>
          <Link className="btn btn-primary btn-sm" to="/quick-note">
            + Notiz
          </Link>
        </div>
      </header>

      <section className="dash-kpis dash-kpis-4" aria-label="Kennzahlen">
        <Link className="dash-kpi" to="/reminders">
          <span className="dash-kpi-label">Heute</span>
          <strong className={summary.overdue > 0 ? "is-alert" : undefined}>
            {loading ? "–" : summary.today}
          </strong>
          <span className="dash-kpi-meta">
            {summary.overdue > 0 ? `${summary.overdue} überfällig` : "Aufgaben"}
          </span>
        </Link>
        <div className="dash-kpi">
          <span className="dash-kpi-label">Offen</span>
          <strong>{loading ? "–" : summary.open}</strong>
          <span className="dash-kpi-meta">{summary.inbox} Inbox</span>
        </div>
        <Link className="dash-kpi" to="/calendar">
          <span className="dash-kpi-label">Termine</span>
          <strong>{loading ? "–" : todayAppts.length}</strong>
          <span className="dash-kpi-meta">{appointments.length} diese Woche</span>
        </Link>
        <Link className="dash-kpi" to="/reminders">
          <span className="dash-kpi-label">Abläufe</span>
          <strong>{loading ? "–" : reminderTotal}</strong>
          <span className="dash-kpi-meta">
            {stats?.activeCount ?? "–"} Kunden aktiv
          </span>
        </Link>
      </section>

      <section className="dash-analytics dash-analytics-3" aria-label="Diagramme">
        <article className="panel dash-chart-card">
          <div className="dash-chart-head">
            <h3>Aufgaben</h3>
          </div>
          {loading ? (
            <p className="empty">Lade…</p>
          ) : taskSlices.length === 0 ? (
            <p className="empty">Alles erledigt.</p>
          ) : (
            <div className="dash-chart-body is-split">
              <DonutChart
                slices={taskSlices}
                size={104}
                thickness={7}
                centerValue={summary.open}
                centerLabel="offen"
              />
              <ChartLegend slices={taskSlices} />
            </div>
          )}
        </article>

        <article className="panel dash-chart-card">
          <div className="dash-chart-head">
            <h3>Woche</h3>
            <Link className="dash-chart-link" to="/calendar">
              Kalender
            </Link>
          </div>
          {loading ? <p className="empty">Lade…</p> : <ColumnChart columns={weekColumns} />}
        </article>

        <article className="panel dash-chart-card">
          <div className="dash-chart-head">
            <h3>Prioritäten</h3>
          </div>
          {loading ? (
            <p className="empty">Lade…</p>
          ) : prioBars.length === 0 ? (
            <p className="empty">Keine offenen Aufgaben.</p>
          ) : (
            <HBarChart items={prioBars} />
          )}
        </article>
      </section>

      <div className="dash-focus">
        <section className="panel dash-panel dash-focus-tasks">
          <div className="dash-focus-head">
            <h3>Fokus heute</h3>
            <Link className="dash-chart-link" to="/reminders">
              Alle
            </Link>
          </div>
          {loading ? (
            <p className="empty">Lade…</p>
          ) : focusTasks.length === 0 ? (
            <p className="empty">Keine dringenden Aufgaben.</p>
          ) : (
            <ul className="dash-focus-list">
              {focusTasks.map((task) => (
                <li key={task.id}>
                  <FocusTaskRow
                    task={task}
                    busy={busyId === task.id}
                    onToggle={() => void toggleDone(task)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel dash-panel dash-focus-cal">
          <div className="dash-focus-head">
            <h3>Termine</h3>
            <Link className="dash-chart-link" to="/calendar">
              Öffnen
            </Link>
          </div>
          {loading ? (
            <p className="empty">Lade…</p>
          ) : todayAppts.length === 0 && upcomingAppts.length === 0 ? (
            <p className="empty">Keine Termine diese Woche.</p>
          ) : (
            <ul className="dash-focus-list">
              {todayAppts.map((a) => (
                <li key={a.id}>
                  <ApptRow appointment={a} today />
                </li>
              ))}
              {upcomingAppts.map((a) => (
                <li key={a.id}>
                  <ApptRow appointment={a} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function FocusTaskRow({
  task,
  busy,
  onToggle,
}: {
  task: TaskItem;
  busy: boolean;
  onToggle: () => void;
}) {
  const prio = (Number(task.priority) || 4) as TaskPriority;
  const due = dueLabel(task.dueDate, false);
  const customer = customerDisplayName({
    name: task.customerName ?? "",
    company: task.customerCompany ?? null,
  });

  return (
    <article className={`dash-focus-row prio-${prio}${busy ? " is-busy" : ""}`}>
      <button
        type="button"
        className="dash-task-check"
        aria-label={`„${task.title}“ erledigen`}
        disabled={busy}
        onClick={onToggle}
      />
      <Link className="dash-focus-main" to={`/customers/${task.customerId}/tasks`}>
        <strong>{task.title}</strong>
        <span className="dash-focus-meta">
          <span className={`tone-${due.tone}`}>{due.text}</span>
          <span>·</span>
          <span>{customer}</span>
        </span>
      </Link>
    </article>
  );
}

function ApptRow({ appointment: a, today }: { appointment: AppointmentItem; today?: boolean }) {
  const when = today
    ? a.allDay
      ? "Ganztägig"
      : a.startTime?.slice(0, 5) || "–"
    : formatDateOnly(a.startDate);

  return (
    <Link className="dash-focus-row dash-focus-appt" to="/calendar">
      <span className={`dash-focus-when${today ? " is-today" : ""}`}>{when}</span>
      <span className="dash-focus-main">
        <strong>{a.title}</strong>
        <span className="dash-focus-meta">
          {appointmentKindLabel[a.kind]}
          {a.customerName
            ? ` · ${customerDisplayName({
                name: a.customerName,
                company: a.customerCompany ?? null,
              })}`
            : ""}
        </span>
      </span>
    </Link>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 11) return "Guten Morgen";
  if (h < 18) return "Guten Tag";
  return "Guten Abend";
}
