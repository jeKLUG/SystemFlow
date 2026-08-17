import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { ChartLegend, ColumnChart, DonutChart } from "../components/DashCharts";
import { customerDisplayName } from "../lib/customer";
import { localTodayIso } from "../lib/dates";
import { withOfflineFallback } from "../lib/offlineCache";
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

/**
 * Kompaktes Start-Dashboard: Kennzahlen, Diagramme und Heute-Liste.
 */
export function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [openTasks, setOpenTasks] = useState<TaskItem[]>([]);
  const [reminders, setReminders] = useState<Reminders | null>(null);
  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState(false);

  const todayIso = localTodayIso();
  const weekEnd = addDaysIso(todayIso, 6);

  useEffect(() => {
    void withOfflineFallback(`dashboard:${todayIso}`, () =>
      Promise.all([
        api.stats(),
        api.openTasks(),
        api.reminders(30),
        api.appointments({ from: todayIso, to: weekEnd }),
      ]),
    )
      .then(({ data, fromCache: cached }) => {
        const [s, t, rem, appts] = data;
        setStats(s);
        setOpenTasks(sortTasks(t, "due"));
        setReminders(rem);
        setAppointments(appts);
        setFromCache(cached);
      })
      .finally(() => setLoading(false));
  }, [todayIso, weekEnd]);

  const summary = useMemo(() => summarizeTasks(openTasks), [openTasks]);

  const reminderTotal = useMemo(() => {
    if (!reminders) return 0;
    return reminders.warranties.length + reminders.contracts.length + reminders.tasks.length;
  }, [reminders]);

  const focusTasks = useMemo(() => {
    const today = sortTasks(filterTasksByView(openTasks, "today"), "due");
    if (today.length >= 5) return today.slice(0, 5);
    const rest = sortTasks(
      openTasks.filter((t) => !t.done && !today.some((x) => x.id === t.id)),
      "due",
    );
    return [...today, ...rest].slice(0, 5);
  }, [openTasks]);

  const todayAppts = appointments.filter((a) => a.startDate === todayIso).slice(0, 4);
  const soonAppts = appointments
    .filter((a) => a.startDate !== todayIso)
    .slice(0, 3);

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

  const sideReminders = [
    ...(reminders?.warranties.slice(0, 2).map((w) => ({
      id: `w-${w.id}`,
      when: w.warrantyUntil,
      title: w.name,
      meta: `Garantie · ${customerDisplayName({
        name: w.customerName,
        company: w.customerCompany,
      })}`,
      to: `/customers/${w.customerId}`,
    })) ?? []),
    ...(reminders?.contracts.slice(0, 2).map((c) => ({
      id: `c-${c.id}`,
      when: c.endDate,
      title: c.title,
      meta: `Vertrag · ${customerDisplayName({
        name: c.customerName,
        company: c.customerCompany,
      })}`,
      to: `/customers/${c.customerId}/wiki?view=contracts`,
    })) ?? []),
  ].slice(0, 3);

  return (
    <div className="page dashboard-page">
      <header className="dashboard-hero">
        <div>
          <p className="eyebrow">{dateLabel}</p>
          <h2>{greet}</h2>
          {fromCache ? (
            <p className="muted">Offline-Stand – zuletzt synchronisierte Daten</p>
          ) : null}
        </div>
      </header>

      <section className="dash-kpis dash-kpis-compact" aria-label="Kennzahlen">
        <Link className="dash-kpi" to="/customers">
          <span className="dash-kpi-label">Kontakte</span>
          <strong>{loading ? "–" : (stats?.activeCount ?? "–")}</strong>
          <span className="dash-kpi-meta">aktiv</span>
        </Link>
        <div className={`dash-kpi${summary.today > 0 ? " is-warn" : ""}`}>
          <span className="dash-kpi-label">Heute</span>
          <strong>{loading ? "–" : summary.today}</strong>
          <span className="dash-kpi-meta">
            {summary.overdue > 0 ? `${summary.overdue} überfällig` : "Aufgaben"}
          </span>
        </div>
        <Link className="dash-kpi" to="/calendar">
          <span className="dash-kpi-label">Termine</span>
          <strong>{loading ? "–" : todayAppts.length}</strong>
          <span className="dash-kpi-meta">{appointments.length} diese Woche</span>
        </Link>
        <Link className="dash-kpi" to="/tasks">
          <span className="dash-kpi-label">Abläufe</span>
          <strong>{loading ? "–" : reminderTotal}</strong>
          <span className="dash-kpi-meta">30 Tage</span>
        </Link>
      </section>

      <section className="dash-analytics dash-analytics-compact" aria-label="Diagramme">
        <article className="panel dash-chart-card">
          <div className="dash-chart-head">
            <div>
              <h3>Aufgaben</h3>
              <p className="muted">Offene To-dos</p>
            </div>
          </div>
          {loading ? (
            <p className="empty">Lade…</p>
          ) : summary.open === 0 ? (
            <p className="empty">Keine offenen Aufgaben.</p>
          ) : (
            <div className="dash-chart-body is-split">
              <DonutChart
                slices={
                  statusSlices.length
                    ? statusSlices
                    : [{ label: "Offen", value: summary.open, color: "#60a5fa" }]
                }
                size={104}
                thickness={7}
                centerValue={summary.open}
                centerLabel="offen"
              />
              <ChartLegend
                slices={
                  statusSlices.length
                    ? statusSlices
                    : [{ label: "Offen", value: summary.open, color: "#60a5fa" }]
                }
              />
            </div>
          )}
        </article>

        <article className="panel dash-chart-card">
          <div className="dash-chart-head">
            <div>
              <h3>Woche</h3>
              <p className="muted">Termine · 7 Tage</p>
            </div>
            <Link className="btn btn-ghost btn-sm" to="/calendar">
              Öffnen
            </Link>
          </div>
          {loading ? <p className="empty">Lade…</p> : <ColumnChart columns={weekColumns} />}
        </article>
      </section>

      <div className="dash-focus">
        <section className="panel dash-panel dash-focus-tasks">
          <div className="section-head row-between">
            <div>
              <h2>Fokus</h2>
              <p>Heute und als Nächstes</p>
            </div>
            <Link className="btn btn-ghost btn-sm" to="/tasks">
              Alle ({summary.open})
            </Link>
          </div>
          {loading ? (
            <p className="empty">Lade Aufgaben…</p>
          ) : focusTasks.length === 0 ? (
            <p className="empty">Nichts Offenes – gut so.</p>
          ) : (
            <ul className="dash-task-list">
              {focusTasks.map((task) => (
                <li key={task.id}>
                  <DashTaskRow
                    task={task}
                    busy={busyId === task.id}
                    onToggle={() => void toggleDone(task)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="dash-focus-side">
          <section className="panel dash-panel">
            <div className="section-head row-between">
              <div>
                <h2>Kalender</h2>
                <p>Heute & demnächst</p>
              </div>
              <Link className="btn btn-ghost btn-sm" to="/calendar">
                Öffnen
              </Link>
            </div>
            {appointments.length === 0 ? (
              <p className="empty">Keine Termine diese Woche.</p>
            ) : (
              <ul className="dash-side-list">
                {todayAppts.map((a) => (
                  <li key={a.id}>
                    <ApptRow appointment={a} today />
                  </li>
                ))}
                {soonAppts.map((a) => (
                  <li key={a.id}>
                    <ApptRow appointment={a} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel dash-panel">
            <div className="section-head row-between">
              <div>
                <h2>Abläufe</h2>
                <p>Garantien & Verträge</p>
              </div>
              <Link className="btn btn-ghost btn-sm" to="/tasks">
                Alle
              </Link>
            </div>
            {sideReminders.length === 0 ? (
              <p className="empty">Nichts in 30 Tagen.</p>
            ) : (
              <ul className="dash-side-list">
                {sideReminders.map((r) => (
                  <li key={r.id}>
                    <Link className="dash-side-row" to={r.to}>
                      <span className="dash-side-when is-warn">{formatDateOnly(r.when)}</span>
                      <span className="dash-side-body">
                        <strong>{r.title}</strong>
                        <span className="muted">{r.meta}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function ApptRow({ appointment: a, today }: { appointment: AppointmentItem; today?: boolean }) {
  return (
    <Link className="dash-side-row" to="/calendar">
      <span className={`dash-side-when${today ? " is-today" : ""}`}>
        {today
          ? a.allDay
            ? "Ganztägig"
            : a.startTime?.slice(0, 5) || "–"
          : formatDateOnly(a.startDate)}
      </span>
      <span className="dash-side-body">
        <strong>{a.title}</strong>
        <span className="muted">
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

function DashTaskRow({
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
  const customer = task.customerId
    ? customerDisplayName({
        name: task.customerName ?? "",
        company: task.customerCompany ?? null,
      })
    : "Intern";
  const taskTo = task.customerId ? `/customers/${task.customerId}/tasks` : "/tasks";

  return (
    <article className={`dash-task-row prio-${prio}${busy ? " is-busy" : ""}`}>
      <button
        type="button"
        className="dash-task-check"
        aria-label={`„${task.title}“ erledigen`}
        disabled={busy}
        onClick={onToggle}
      />
      <Link className="dash-task-main" to={taskTo}>
        <strong>{task.title}</strong>
        <span className="dash-task-meta">
          <span className={`task-chip task-prio-chip prio-${prio}`}>{priorityLabel[prio]}</span>
          <span className={`task-chip task-due tone-${due.tone}`}>{due.text}</span>
          <span className="task-chip is-muted">{customer}</span>
        </span>
      </Link>
    </article>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 11) return "Guten Morgen";
  if (h < 18) return "Guten Tag";
  return "Guten Abend";
}
