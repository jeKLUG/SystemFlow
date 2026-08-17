import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Checkbox } from "../components/Checkbox";
import { CustomerPicker } from "../components/CustomerPicker";
import { Modal } from "../components/Modal";
import { customerDisplayName } from "../lib/customer";
import { localTodayIso } from "../lib/dates";
import { assetKindLabel, formatDateOnly } from "../lib/labels";
import {
  addDaysIso,
  countTasksByView,
  dueLabel,
  filterTasksByView,
  priorityLabel,
  sortTasks,
  summarizeTasks,
  taskViewTabs,
  tomorrowIso,
  type TaskView,
} from "../lib/tasks";
import type { Reminders, TaskItem, TaskPriority } from "../types";

type ScopeFilter = "all" | "customer" | "internal";

/**
 * Globaler Aufgaben-Hub inkl. Abläufe (Garantien / Verträge).
 */
export function RemindersPage() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [reminders, setReminders] = useState<Reminders | null>(null);
  const [view, setView] = useState<TaskView>("today");
  const [scope, setScope] = useState<ScopeFilter>("all");
  const [days, setDays] = useState(90);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [quickTitle, setQuickTitle] = useState("");
  const [form, setForm] = useState({
    title: "",
    description: "",
    dueDate: "",
    customerId: "",
    priority: "4" as `${TaskPriority}`,
  });

  async function reloadTasks() {
    const list = await api.allTasks({
      limit: 300,
      scope: scope === "all" ? undefined : scope,
    });
    setTasks(list);
  }

  useEffect(() => {
    setLoading(true);
    void Promise.all([reloadTasks(), api.reminders(days)])
      .then(([, rem]) => setReminders(rem))
      .finally(() => setLoading(false));
  }, [scope, days]);

  const stats = useMemo(() => summarizeTasks(tasks), [tasks]);
  const viewCounts = useMemo(() => countTasksByView(tasks), [tasks]);

  const filtered = useMemo(() => {
    return sortTasks(filterTasksByView(tasks, view), "due");
  }, [tasks, view]);

  function openCreate(defaults?: Partial<typeof form>) {
    setForm({
      title: "",
      description: "",
      dueDate: view === "today" ? localTodayIso() : view === "upcoming" ? tomorrowIso() : "",
      customerId: "",
      priority: "4",
      ...defaults,
    });
    setError("");
    setOpen(true);
  }

  async function onQuickAdd(e: FormEvent) {
    e.preventDefault();
    const title = quickTitle.trim();
    if (!title) return;
    await api.createGlobalTask({
      title,
      dueDate: view === "today" ? localTodayIso() : view === "upcoming" ? tomorrowIso() : "",
      priority: 4,
    });
    setQuickTitle("");
    await reloadTasks();
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api.createGlobalTask({
        title: form.title.trim(),
        description: form.description.trim() || null,
        dueDate: form.dueDate || null,
        customerId: form.customerId || null,
        priority: Number(form.priority),
      });
      setOpen(false);
      await reloadTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    }
  }

  async function toggleDone(task: TaskItem) {
    setBusyId(task.id);
    try {
      await api.updateTask(task.id, { done: !task.done });
      await reloadTasks();
    } finally {
      setBusyId(null);
    }
  }

  const expiryCount =
    (reminders?.warranties.length ?? 0) + (reminders?.contracts.length ?? 0);

  return (
    <div className="page tasks-hub-page">
      <div className="page-header">
        <div>
          <h2>Aufgaben</h2>
          <p>
            {stats.open} offen
            {stats.overdue ? ` · ${stats.overdue} überfällig` : ""}
            {expiryCount ? ` · ${expiryCount} Abläufe` : ""}
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-primary" onClick={() => openCreate()}>
            Aufgabe anlegen
          </button>
        </div>
      </div>

      <div className="stat-strip tasks-hub-stats">
        <button type="button" className="stat-chip" onClick={() => setView("today")}>
          <strong>{viewCounts.today}</strong>
          <span>Heute</span>
        </button>
        <button type="button" className="stat-chip" onClick={() => setView("upcoming")}>
          <strong>{viewCounts.upcoming}</strong>
          <span>Geplant</span>
        </button>
        <button type="button" className="stat-chip" onClick={() => setView("inbox")}>
          <strong>{viewCounts.inbox}</strong>
          <span>Inbox</span>
        </button>
        <button type="button" className="stat-chip" onClick={() => setView("open")}>
          <strong>{stats.open}</strong>
          <span>Offen</span>
        </button>
      </div>

      <form className="panel tasks-hub-quick" onSubmit={onQuickAdd}>
        <input
          value={quickTitle}
          onChange={(e) => setQuickTitle(e.target.value)}
          placeholder="Schnelle Aufgabe… (Enter zum Anlegen)"
          aria-label="Schnelle Aufgabe"
        />
        <button className="btn btn-primary" type="submit" disabled={!quickTitle.trim()}>
          Hinzufügen
        </button>
      </form>

      <div className="tasks-hub-toolbar panel">
        <div className="filter-chips" role="tablist" aria-label="Ansicht">
          {taskViewTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={view === tab.id}
              className={view === tab.id ? "chip chip-active" : "chip"}
              onClick={() => setView(tab.id)}
            >
              {tab.label}
              <em className="tasks-hub-count">{viewCounts[tab.id] ?? 0}</em>
            </button>
          ))}
        </div>
        <div className="filter-chips" role="group" aria-label="Bereich">
          {(
            [
              ["all", "Alle"],
              ["customer", "Mit Kunde"],
              ["internal", "Intern"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={scope === key ? "chip chip-active" : "chip"}
              onClick={() => setScope(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <section className="section tasks-hub-list">
        <div className="section-head">
          <h2>{taskViewTabs.find((t) => t.id === view)?.label ?? "Aufgaben"}</h2>
          <p>{taskViewTabs.find((t) => t.id === view)?.hint}</p>
        </div>

        {loading ? (
          <p className="empty">Lade…</p>
        ) : filtered.length === 0 ? (
          <p className="empty">Keine Aufgaben in dieser Ansicht.</p>
        ) : (
          <ul className="list task-hub-list">
            {filtered.map((task) => {
              const due = dueLabel(task.dueDate, task.done);
              const prio = Number(task.priority || 4) as TaskPriority;
              return (
                <li key={task.id}>
                  <div className={`list-row task-hub-row${task.done ? " is-done" : ""}`}>
                    <Checkbox
                      checked={task.done}
                      disabled={busyId === task.id}
                      onChange={() => void toggleDone(task)}
                      aria-label="Erledigt"
                    />
                    <div className="task-hub-main">
                      <strong>{task.title}</strong>
                      <span className="muted">
                        {task.customerId
                          ? customerDisplayName({
                              name: task.customerName ?? "",
                              company: task.customerCompany ?? null,
                            })
                          : "Intern"}
                        {task.projectName ? ` · ${task.projectName}` : ""}
                        {` · ${priorityLabel[prio]}`}
                      </span>
                    </div>
                    <div className="list-meta">
                      <span className={`badge badge-due-${due.tone}`}>{due.text}</span>
                      {task.customerId ? (
                        <Link
                          className="btn btn-ghost btn-sm"
                          to={`/customers/${task.customerId}/tasks`}
                        >
                          Kunde
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="section tasks-hub-expiry">
        <div className="section-head row-between">
          <div>
            <h2>Abläufe</h2>
            <p>Garantien und Verträge, die bald fällig werden.</p>
          </div>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            aria-label="Zeitraum Abläufe"
          >
            <option value={30}>30 Tage</option>
            <option value={90}>90 Tage</option>
            <option value={180}>180 Tage</option>
          </select>
        </div>

        <div className="tasks-hub-expiry-grid">
          <div className="panel">
            <h3>Garantien</h3>
            {!reminders?.warranties.length ? (
              <p className="empty">Keine ablaufenden Garantien.</p>
            ) : (
              <ul className="list">
                {reminders.warranties.map((w) => (
                  <li key={w.id}>
                    <Link className="list-row" to={`/customers/${w.customerId}/assets`}>
                      <div>
                        <strong>{w.name}</strong>
                        <span className="muted">
                          {customerDisplayName({
                            name: w.customerName,
                            company: w.customerCompany,
                          })}{" "}
                          · {assetKindLabel[w.kind]}
                        </span>
                      </div>
                      <span className="badge badge-warn">{formatDateOnly(w.warrantyUntil)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="panel">
            <h3>Verträge</h3>
            {!reminders?.contracts.length ? (
              <p className="empty">Keine auslaufenden Verträge.</p>
            ) : (
              <ul className="list">
                {reminders.contracts.map((c) => (
                  <li key={c.id}>
                    <Link className="list-row" to={`/customers/${c.customerId}/ops`}>
                      <div>
                        <strong>{c.title}</strong>
                        <span className="muted">
                          {customerDisplayName({
                            name: c.customerName,
                            company: c.customerCompany,
                          })}
                          {c.slaResponseHours ? ` · SLA ${c.slaResponseHours}h` : ""}
                        </span>
                      </div>
                      <span className="badge badge-warn">{formatDateOnly(c.endDate)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <Modal open={open} title="Aufgabe anlegen" onClose={() => setOpen(false)}>
        <form className="form-grid" onSubmit={onSave}>
          <label className="field full">
            <span>Titel *</span>
            <input
              required
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              autoFocus
            />
          </label>
          <label className="field full">
            <span>Kunde / Kontakt</span>
            <CustomerPicker
              value={form.customerId}
              onChange={(id) => setForm((f) => ({ ...f, customerId: id }))}
              allowEmpty
              emptyLabel="Intern (ohne Kunde)"
            />
          </label>
          <label className="field">
            <span>Fällig am</span>
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
            />
          </label>
          <label className="field">
            <span>Priorität</span>
            <select
              value={form.priority}
              onChange={(e) =>
                setForm((f) => ({ ...f, priority: e.target.value as `${TaskPriority}` }))
              }
            >
              <option value="1">Dringend</option>
              <option value="2">Hoch</option>
              <option value="3">Mittel</option>
              <option value="4">Normal</option>
            </select>
          </label>
          <div className="field full filter-chips">
            <button
              type="button"
              className="chip"
              onClick={() => setForm((f) => ({ ...f, dueDate: localTodayIso() }))}
            >
              Heute
            </button>
            <button
              type="button"
              className="chip"
              onClick={() => setForm((f) => ({ ...f, dueDate: tomorrowIso() }))}
            >
              Morgen
            </button>
            <button
              type="button"
              className="chip"
              onClick={() => setForm((f) => ({ ...f, dueDate: addDaysIso(localTodayIso(), 7) }))}
            >
              +7 Tage
            </button>
          </div>
          <label className="field full">
            <span>Beschreibung</span>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </label>
          {error ? <p className="form-error full">{error}</p> : null}
          <div className="full cta-row">
            <button className="btn btn-primary" type="submit">
              Speichern
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setOpen(false)}>
              Abbrechen
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
