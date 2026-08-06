import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { ChartLegend, ColumnChart, DonutChart, HBarChart } from "../components/DashCharts";
import { customerDisplayName } from "../lib/customer";
import { localTodayIso } from "../lib/dates";
import {
  appointmentKindLabel,
  documentTypeLabel,
  formatDate,
  formatDateOnly,
} from "../lib/labels";
import {
  addDaysIso,
  dueLabel,
  filterTasksByView,
  groupOpenTasks,
  priorityLabel,
  sortTasks,
  summarizeTasks,
  type TaskView,
} from "../lib/tasks";
import type {
  AppointmentItem,
  AppointmentKind,
  RecentDocument,
  Reminders,
  Stats,
  TaskItem,
  TaskPriority,
} from "../types";

type TaskFilter = "open" | "today" | "upcoming" | "inbox";

const taskFilters: { id: TaskFilter; label: string; short: string }[] = [
  { id: "open", label: "Alle offen", short: "Offen" },
  { id: "today", label: "Heute / überfällig", short: "Heute" },
  { id: "upcoming", label: "Geplant", short: "Geplant" },
  { id: "inbox", label: "Inbox", short: "Inbox" },
];

const prioColors: Record<TaskPriority, string> = {
  1: "#f87171",
  2: "#fbbf24",
  3: "#60a5fa",
  4: "#94a3b8",
};

const kindColors: Record<AppointmentKind, string> = {
  customer: "#34d399",
  internal: "#38bdf8",
  personal: "#fbbf24",
  other: "#94a3b8",
};

/**
 * Start-Dashboard: Kennzahlen, Diagramme, Aufgaben, Termine und Erinnerungen.
 */
export function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<RecentDocument[]>([]);
  const [openTasks, setOpenTasks] = useState<TaskItem[]>([]);
  const [reminders, setReminders] = useState<Reminders | null>(null);
  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [filter, setFilter] = useState<TaskFilter>("open");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const todayIso = localTodayIso();
  const weekEnd = addDaysIso(todayIso, 6);

  useEffect(() => {
    void Promise.all([
      api.stats(),
      api.recentDocuments(),
      api.openTasks(),
      api.reminders(30),
      api.appointments({ from: todayIso, to: weekEnd }),
    ])
      .then(([s, r, t, rem, appts]) => {
        setStats(s);
        setRecent(r.slice(0, 6));
        setOpenTasks(sortTasks(t, "due"));
        setReminders(rem);
        setAppointments(appts);
      })
      .finally(() => setLoading(false));
  }, [todayIso, weekEnd]);

  const summary = useMemo(() => summarizeTasks(openTasks), [openTasks]);

  const reminderCounts = useMemo(() => {
    const warranties = reminders?.warranties.length ?? 0;
    const contracts = reminders?.contracts.length ?? 0;
    const tasks = reminders?.tasks.length ?? 0;
    return { warranties, contracts, tasks, total: warranties + contracts + tasks };
  }, [reminders]);

  const filteredTasks = useMemo(() => {
    const view = filter as TaskView;
    return sortTasks(filterTasksByView(openTasks, view), "due");
  }, [openTasks, filter]);

  const taskGroups = useMemo(() => {
    if (filter !== "open") return null;
    return groupOpenTasks(sortTasks(openTasks, "due")).filter((g) => g.key !== "done");
  }, [openTasks, filter]);

  const todayAppts = appointments.filter((a) => a.startDate === todayIso);
  const laterAppts = appointments
    .filter((a) => a.startDate !== todayIso)
    .slice(0, 5);

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
    return ([1, 2, 3, 4] as TaskPriority[]).map((p) => ({
      label: priorityLabel[p],
      value: counts[p],
      color: prioColors[p],
    }));
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
        tone: value > 0 ? "linear-gradient(180deg, #7ab0ff, #3b82f6)" : undefined,
      };
    });
  }, [appointments, todayIso]);

  const kindSlices = useMemo(() => {
    const map: Record<AppointmentKind, number> = {
      customer: 0,
      internal: 0,
      personal: 0,
      other: 0,
    };
    for (const a of appointments) map[a.kind] += 1;
    return (Object.keys(map) as AppointmentKind[])
      .map((k) => ({
        label: appointmentKindLabel[k],
        value: map[k],
        color: kindColors[k],
      }))
      .filter((s) => s.value > 0);
  }, [appointments]);

  const reminderBars = useMemo(
    () =>
      [
        { label: "Garantien", value: reminderCounts.warranties, color: "#fbbf24" },
        { label: "Verträge", value: reminderCounts.contracts, color: "#60a5fa" },
        { label: "Aufgaben", value: reminderCounts.tasks, color: "#34d399" },
      ].filter((x) => x.value > 0),
    [reminderCounts],
  );

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

  const inactiveCustomers = Math.max(0, (stats?.customerCount ?? 0) - (stats?.activeCount ?? 0));

  return (
    <div className="page dashboard-page">
      <header className="page-header dashboard-header">
        <div>
          <p className="eyebrow">{dateLabel}</p>
          <h2>{greet}</h2>
          <p className="dashboard-lede">
            Lagebild mit Kennzahlen, Diagrammen und dem, was heute zählt.
          </p>
        </div>
        <div className="page-actions dashboard-actions">
          <Link className="btn btn-ghost dashboard-action-secondary" to="/calendar">
            Kalender
          </Link>
          <Link className="btn btn-ghost dashboard-action-secondary" to="/customers">
            Kunden
          </Link>
          <Link className="btn btn-primary" to="/quick-note">
            + Notiz
          </Link>
        </div>
      </header>

      <section className="dash-kpis" aria-label="Kennzahlen">
        <Link className="dash-kpi" to="/customers">
          <span className="dash-kpi-label">Kunden</span>
          <strong>{stats?.customerCount ?? "–"}</strong>
          <span className="dash-kpi-meta">
            {stats?.activeCount ?? "–"} aktiv
            {inactiveCustomers > 0 ? ` · ${inactiveCustomers} inaktiv` : ""}
          </span>
        </Link>
        <button
          type="button"
          className={`dash-kpi is-warn${filter === "today" ? " is-active" : ""}`}
          onClick={() => setFilter("today")}
        >
          <span className="dash-kpi-label">Heute</span>
          <strong>{loading ? "–" : summary.today}</strong>
          <span className="dash-kpi-meta">
            {summary.overdue > 0 ? `${summary.overdue} überfällig` : "im Plan"}
          </span>
        </button>
        <button
          type="button"
          className={`dash-kpi${filter === "open" ? " is-active" : ""}`}
          onClick={() => setFilter("open")}
        >
          <span className="dash-kpi-label">Offen</span>
          <strong>{loading ? "–" : summary.open}</strong>
          <span className="dash-kpi-meta">Aufgaben</span>
        </button>
        <button
          type="button"
          className={`dash-kpi${filter === "inbox" ? " is-active" : ""}`}
          onClick={() => setFilter("inbox")}
        >
          <span className="dash-kpi-label">Inbox</span>
          <strong>{loading ? "–" : summary.inbox}</strong>
          <span className="dash-kpi-meta">ohne Datum</span>
        </button>
        <Link className="dash-kpi" to="/reminders">
          <span className="dash-kpi-label">Abläufe</span>
          <strong>{loading ? "–" : reminderCounts.total}</strong>
          <span className="dash-kpi-meta">30 Tage</span>
        </Link>
        <Link className="dash-kpi" to="/calendar">
          <span className="dash-kpi-label">Termine</span>
          <strong>{loading ? "–" : todayAppts.length}</strong>
          <span className="dash-kpi-meta">heute · {appointments.length} diese Woche</span>
        </Link>
      </section>

      <nav className="dash-quick" aria-label="Schnellzugriff">
        <Link to="/customers?new=1">+ Kunde</Link>
        <Link to="/search">Suche</Link>
        <Link to="/vault">Tresor</Link>
        <Link to="/reminders">Erinnerungen</Link>
        <Link to="/calendar">Kalender</Link>
      </nav>

      <section className="dash-analytics" aria-label="Diagramme">
        <article className="panel dash-chart-card">
          <div className="dash-chart-head">
            <div>
              <h3>Aufgabenlage</h3>
              <p className="muted">Verteilung der offenen To-dos</p>
            </div>
          </div>
          {loading ? (
            <p className="empty">Lade Diagramm…</p>
          ) : summary.open === 0 ? (
            <p className="empty">Keine offenen Aufgaben.</p>
          ) : (
            <div className="dash-chart-body is-split">
              <DonutChart
                slices={statusSlices.length ? statusSlices : [{ label: "Offen", value: summary.open, color: "#60a5fa" }]}
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
              <h3>Prioritäten</h3>
              <p className="muted">Gewicht der offenen Aufgaben</p>
            </div>
          </div>
          {loading ? (
            <p className="empty">Lade Diagramm…</p>
          ) : summary.open === 0 ? (
            <p className="empty">Keine Daten.</p>
          ) : (
            <HBarChart items={prioBars} />
          )}
        </article>

        <article className="panel dash-chart-card">
          <div className="dash-chart-head">
            <div>
              <h3>Woche</h3>
              <p className="muted">Termine der nächsten 7 Tage</p>
            </div>
            <Link className="btn btn-ghost btn-sm" to="/calendar">
              Öffnen
            </Link>
          </div>
          {loading ? (
            <p className="empty">Lade Diagramm…</p>
          ) : (
            <ColumnChart columns={weekColumns} />
          )}
        </article>

        <article className="panel dash-chart-card">
          <div className="dash-chart-head">
            <div>
              <h3>Terminarten</h3>
              <p className="muted">Diese Woche nach Art</p>
            </div>
          </div>
          {loading ? (
            <p className="empty">Lade Diagramm…</p>
          ) : kindSlices.length === 0 ? (
            <p className="empty">Keine Termine in dieser Woche.</p>
          ) : (
            <div className="dash-chart-body is-split">
              <DonutChart
                slices={kindSlices}
                size={148}
                thickness={18}
                centerValue={appointments.length}
                centerLabel="Termine"
              />
              <ChartLegend slices={kindSlices} />
            </div>
          )}
        </article>

        <article className="panel dash-chart-card dash-chart-wide">
          <div className="dash-chart-head">
            <div>
              <h3>Abläufe & Bestand</h3>
              <p className="muted">Garantien, Verträge und Kundenstatus</p>
            </div>
            <Link className="btn btn-ghost btn-sm" to="/reminders">
              Alle
            </Link>
          </div>
          <div className="dash-stock">
            <div>
              <h4>Erinnerungen (30 Tage)</h4>
              {reminderBars.length === 0 ? (
                <p className="empty">Nichts fällig.</p>
              ) : (
                <HBarChart items={reminderBars} />
              )}
            </div>
            <div>
              <h4>Kunden</h4>
              <div className="dash-chart-body is-split">
                <DonutChart
                  slices={[
                    { label: "Aktiv", value: stats?.activeCount ?? 0, color: "#34d399" },
                    { label: "Inaktiv", value: inactiveCustomers, color: "#64748b" },
                  ].filter((s) => s.value > 0)}
                  size={132}
                  thickness={16}
                  centerValue={stats?.customerCount ?? 0}
                  centerLabel="gesamt"
                />
                <ul className="dash-stat-list">
                  <li>
                    <span>Aktiv</span>
                    <strong>{stats?.activeCount ?? 0}</strong>
                  </li>
                  <li>
                    <span>Inaktiv</span>
                    <strong>{inactiveCustomers}</strong>
                  </li>
                  <li>
                    <span>Dokumente kürzlich</span>
                    <strong>{recent.length}</strong>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </article>
      </section>

      <div className="dash-layout">
        <section className="panel dash-panel dash-tasks">
          <div className="section-head row-between">
            <div>
              <h2>Aufgabenüberblick</h2>
              <p>Priorität, Fälligkeit und Kunde – direkt abhaken.</p>
            </div>
            <Link className="btn btn-ghost btn-sm" to="/reminders">
              Erinnerungen
            </Link>
          </div>

          <div className="dash-task-tabs" role="tablist" aria-label="Aufgabenfilter">
            {taskFilters.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={filter === tab.id}
                className={filter === tab.id ? "is-active" : undefined}
                onClick={() => setFilter(tab.id)}
              >
                <span className="dash-tab-label">{tab.label}</span>
                <span className="dash-tab-short">{tab.short}</span>
                <span className="dash-tab-count">
                  {tab.id === "open"
                    ? summary.open
                    : tab.id === "today"
                      ? summary.today
                      : tab.id === "upcoming"
                        ? filterTasksByView(openTasks, "upcoming").length
                        : summary.inbox}
                </span>
              </button>
            ))}
          </div>

          {loading ? (
            <p className="empty">Lade Aufgaben…</p>
          ) : filteredTasks.length === 0 ? (
            <div className="dash-empty">
              <strong>Alles erledigt in dieser Ansicht</strong>
              <p className="muted">Keine offenen Aufgaben für den gewählten Filter.</p>
            </div>
          ) : taskGroups ? (
            <div className="dash-task-groups">
              {taskGroups.map((group) => (
                <div key={group.key} className="dash-task-group">
                  <h3>
                    {group.title}
                    <span>{group.items.length}</span>
                  </h3>
                  <ul className="dash-task-list">
                    {group.items.map((task) => (
                      <li key={task.id}>
                        <DashTaskRow
                          task={task}
                          busy={busyId === task.id}
                          onToggle={() => void toggleDone(task)}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <ul className="dash-task-list">
              {filteredTasks.map((task) => (
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

        <aside className="dash-side">
          <section className="panel dash-panel">
            <div className="section-head row-between">
              <div>
                <h2>Kalender</h2>
                <p>Heute und demnächst.</p>
              </div>
              <Link className="btn btn-ghost btn-sm" to="/calendar">
                Öffnen
              </Link>
            </div>
            {appointments.length === 0 ? (
              <p className="empty">Keine kommenden Termine.</p>
            ) : (
              <ul className="dash-side-list">
                {todayAppts.map((a) => (
                  <li key={a.id}>
                    <Link className="dash-side-row" to="/calendar">
                      <span className="dash-side-when is-today">
                        {a.allDay ? "Ganztägig" : a.startTime?.slice(0, 5) || "–"}
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
                  </li>
                ))}
                {laterAppts.map((a) => (
                  <li key={a.id}>
                    <Link className="dash-side-row" to="/calendar">
                      <span className="dash-side-when">{formatDateOnly(a.startDate)}</span>
                      <span className="dash-side-body">
                        <strong>{a.title}</strong>
                        <span className="muted">
                          {a.allDay ? "Ganztägig" : a.startTime?.slice(0, 5) || "–"}
                          {a.customerName
                            ? ` · ${customerDisplayName({
                                name: a.customerName,
                                company: a.customerCompany ?? null,
                              })}`
                            : ""}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel dash-panel">
            <div className="section-head row-between">
              <div>
                <h2>Erinnerungen</h2>
                <p>Garantien & Verträge.</p>
              </div>
              <Link className="btn btn-ghost btn-sm" to="/reminders">
                Alle
              </Link>
            </div>
            {!reminders ||
            (reminders.warranties.length === 0 && reminders.contracts.length === 0) ? (
              <p className="empty">Keine Abläufe in 30 Tagen.</p>
            ) : (
              <ul className="dash-side-list">
                {reminders.warranties.slice(0, 4).map((w) => (
                  <li key={`w-${w.id}`}>
                    <Link className="dash-side-row" to={`/customers/${w.customerId}`}>
                      <span className="dash-side-when is-warn">{formatDateOnly(w.warrantyUntil)}</span>
                      <span className="dash-side-body">
                        <strong>{w.name}</strong>
                        <span className="muted">
                          Garantie ·{" "}
                          {customerDisplayName({
                            name: w.customerName,
                            company: w.customerCompany,
                          })}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
                {reminders.contracts.slice(0, 4).map((c) => (
                  <li key={`c-${c.id}`}>
                    <Link className="dash-side-row" to={`/customers/${c.customerId}/ops`}>
                      <span className="dash-side-when is-warn">{formatDateOnly(c.endDate)}</span>
                      <span className="dash-side-body">
                        <strong>{c.title}</strong>
                        <span className="muted">
                          Vertrag ·{" "}
                          {customerDisplayName({
                            name: c.customerName,
                            company: c.customerCompany,
                          })}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel dash-panel">
            <div className="section-head row-between">
              <div>
                <h2>Zuletzt bearbeitet</h2>
                <p>Dokumente & Notizen.</p>
              </div>
              <Link className="btn btn-ghost btn-sm" to="/quick-note">
                + Notiz
              </Link>
            </div>
            {recent.length === 0 ? (
              <p className="empty">Noch keine Dokumente.</p>
            ) : (
              <ul className="dash-side-list">
                {recent.map((doc) => (
                  <li key={doc.id}>
                    <Link className="dash-side-row" to={`/documents/${doc.id}`}>
                      <span className="dash-doc-mark" aria-hidden>
                        {doc.title.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="dash-side-body">
                        <strong>{doc.title}</strong>
                        <span className="muted">
                          {doc.customerName} · {documentTypeLabel[doc.type]} ·{" "}
                          {formatDate(doc.updatedAt)}
                        </span>
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
  const customer = customerDisplayName({
    name: task.customerName ?? "",
    company: task.customerCompany ?? null,
  });

  return (
    <article className={`dash-task-row prio-${prio}${busy ? " is-busy" : ""}`}>
      <button
        type="button"
        className="dash-task-check"
        aria-label={`„${task.title}“ erledigen`}
        disabled={busy}
        onClick={onToggle}
      />
      <Link className="dash-task-main" to={`/customers/${task.customerId}/tasks`}>
        <strong>{task.title}</strong>
        <span className="dash-task-meta">
          <span className={`task-chip task-prio-chip prio-${prio}`}>{priorityLabel[prio]}</span>
          <span className={`task-chip task-due tone-${due.tone}`}>{due.text}</span>
          {task.projectName ? <span className="task-chip">{task.projectName}</span> : null}
          <span className="task-chip is-muted">{customer}</span>
        </span>
        {task.description ? (
          <span className="dash-task-desc muted">{task.description}</span>
        ) : null}
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
