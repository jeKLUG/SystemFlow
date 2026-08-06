import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { customerDisplayName } from "../lib/customer";
import { localTodayIso } from "../lib/dates";
import {
  appointmentKindLabel,
  documentTypeLabel,
  formatDate,
  formatDateOnly,
} from "../lib/labels";
import {
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
  RecentDocument,
  Reminders,
  Stats,
  TaskItem,
  TaskPriority,
} from "../types";

type TaskFilter = "open" | "today" | "upcoming" | "inbox";

const taskFilters: { id: TaskFilter; label: string }[] = [
  { id: "open", label: "Alle offen" },
  { id: "today", label: "Heute / überfällig" },
  { id: "upcoming", label: "Geplant" },
  { id: "inbox", label: "Inbox" },
];

/**
 * Start-Dashboard: Kennzahlen, Aufgabenüberblick, Termine und Erinnerungen.
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

  useEffect(() => {
    void Promise.all([
      api.stats(),
      api.recentDocuments(),
      api.openTasks(),
      api.reminders(30),
      api.appointments({ upcoming: true, limit: 8 }),
    ])
      .then(([s, r, t, rem, appts]) => {
        setStats(s);
        setRecent(r.slice(0, 6));
        setOpenTasks(sortTasks(t, "due"));
        setReminders(rem);
        setAppointments(appts);
      })
      .finally(() => setLoading(false));
  }, []);

  const summary = useMemo(() => summarizeTasks(openTasks), [openTasks]);

  const reminderCount =
    (reminders?.warranties.length ?? 0) +
    (reminders?.contracts.length ?? 0) +
    (reminders?.tasks.length ?? 0);

  const filteredTasks = useMemo(() => {
    const view = filter as TaskView;
    return sortTasks(filterTasksByView(openTasks, view), "due");
  }, [openTasks, filter]);

  const taskGroups = useMemo(() => {
    if (filter !== "open") return null;
    return groupOpenTasks(sortTasks(openTasks, "due")).filter((g) => g.key !== "done");
  }, [openTasks, filter]);

  const todayIso = localTodayIso();
  const todayAppts = appointments.filter((a) => a.startDate === todayIso);
  const laterAppts = appointments.filter((a) => a.startDate !== todayIso).slice(0, 5);

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

  return (
    <div className="page dashboard-page">
      <header className="page-header dashboard-header">
        <div>
          <p className="eyebrow">{dateLabel}</p>
          <h2>{greet}</h2>
          <p>Aktuelle Lage: Aufgaben, Termine und Abläufe auf einen Blick.</p>
        </div>
        <div className="page-actions">
          <Link className="btn btn-ghost" to="/calendar">
            Kalender
          </Link>
          <Link className="btn btn-ghost" to="/customers">
            Kunden
          </Link>
          <Link className="btn btn-primary" to="/quick-note">
            + Schnellnotiz
          </Link>
        </div>
      </header>

      <section className="dash-kpis" aria-label="Kennzahlen">
        <Link className="dash-kpi" to="/customers">
          <span className="dash-kpi-label">Kunden</span>
          <strong>{stats?.customerCount ?? "–"}</strong>
          <span className="dash-kpi-meta">{stats?.activeCount ?? "–"} aktiv</span>
        </Link>
        <button
          type="button"
          className={`dash-kpi is-warn${filter === "today" ? " is-active" : ""}`}
          onClick={() => setFilter("today")}
        >
          <span className="dash-kpi-label">Überfällig / Heute</span>
          <strong>{summary.today}</strong>
          <span className="dash-kpi-meta">
            {summary.overdue > 0 ? `${summary.overdue} überfällig` : "Nichts überfällig"}
          </span>
        </button>
        <button
          type="button"
          className={`dash-kpi${filter === "open" ? " is-active" : ""}`}
          onClick={() => setFilter("open")}
        >
          <span className="dash-kpi-label">Offen</span>
          <strong>{summary.open}</strong>
          <span className="dash-kpi-meta">systemweit</span>
        </button>
        <button
          type="button"
          className={`dash-kpi${filter === "inbox" ? " is-active" : ""}`}
          onClick={() => setFilter("inbox")}
        >
          <span className="dash-kpi-label">Inbox</span>
          <strong>{summary.inbox}</strong>
          <span className="dash-kpi-meta">ohne Datum</span>
        </button>
        <Link className="dash-kpi" to="/reminders">
          <span className="dash-kpi-label">Abläufe</span>
          <strong>{reminderCount}</strong>
          <span className="dash-kpi-meta">nächste 30 Tage</span>
        </Link>
        <Link className="dash-kpi" to="/calendar">
          <span className="dash-kpi-label">Termine heute</span>
          <strong>{todayAppts.length}</strong>
          <span className="dash-kpi-meta">{appointments.length} kommend</span>
        </Link>
      </section>

      <nav className="dash-quick" aria-label="Schnellzugriff">
        <Link to="/customers?new=1">+ Kunde</Link>
        <Link to="/search">Suche</Link>
        <Link to="/vault">Tresor</Link>
        <Link to="/reminders">Erinnerungen</Link>
      </nav>

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
                {tab.label}
                <span>
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
                    <Link
                      className="dash-side-row"
                      to={`/customers/${c.customerId}/ops`}
                    >
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
