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

  const activeTab = taskViewTabs.find((t) => t.id === view);

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
      <div className="tasks-hub-hero panel">
        <div className="tasks-hub-hero-top">
          <div>
            <h2>Aufgaben</h2>
            <p className="muted">
              {stats.open} offen
              {stats.overdue ? ` · ${stats.overdue} überfällig` : ""}
            </p>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => openCreate()}>
            + Aufgabe
          </button>
        </div>

        <div className="tasks-hub-views" role="tablist" aria-label="Ansicht">
          {taskViewTabs.map((tab) => {
            const count = viewCounts[tab.id] ?? 0;
            const warn = tab.id === "today" && stats.overdue > 0;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={view === tab.id}
                className={`tasks-hub-view${view === tab.id ? " is-active" : ""}${
                  warn ? " is-warn" : ""
                }`}
                onClick={() => setView(tab.id)}
              >
                <strong>{count}</strong>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <form className="tasks-hub-quick panel" onSubmit={onQuickAdd}>
        <span className="tasks-hub-quick-icon" aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
        </span>
        <input
          value={quickTitle}
          onChange={(e) => setQuickTitle(e.target.value)}
          placeholder="Schnelle Aufgabe… Enter zum Anlegen"
          aria-label="Schnelle Aufgabe"
        />
        <button className="btn btn-primary" type="submit" disabled={!quickTitle.trim()}>
          Hinzufügen
        </button>
      </form>

      <div className="tasks-hub-scope" role="group" aria-label="Bereich">
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
            className={`tasks-hub-scope-btn${scope === key ? " is-active" : ""}`}
            onClick={() => setScope(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <section className="tasks-hub-board panel" aria-labelledby="tasks-hub-board-title">
        <div className="tasks-hub-board-head">
          <div>
            <p className="eyebrow">To-dos</p>
            <h3 id="tasks-hub-board-title">{activeTab?.label ?? "Aufgaben"}</h3>
          </div>
          <span className="muted">{filtered.length}</span>
        </div>

        {loading ? (
          <p className="empty">Lade…</p>
        ) : filtered.length === 0 ? (
          <div className="tasks-hub-empty">
            <strong>Keine Aufgaben</strong>
            <p className="muted">
              {view === "done"
                ? "Noch nichts erledigt."
                : "Lege eine Aufgabe an oder wechsle die Ansicht."}
            </p>
            {view !== "done" ? (
              <button type="button" className="btn btn-primary" onClick={() => openCreate()}>
                Aufgabe anlegen
              </button>
            ) : null}
          </div>
        ) : (
          <ul className="tasks-hub-list">
            {filtered.map((task) => {
              const due = dueLabel(task.dueDate, task.done);
              const prio = Number(task.priority || 4) as TaskPriority;
              const customerLabel = task.customerId
                ? customerDisplayName({
                    name: task.customerName ?? "",
                    company: task.customerCompany ?? null,
                  })
                : null;
              return (
                <li key={task.id}>
                  <div
                    className={`tasks-hub-row prio-${prio}${task.done ? " is-done" : ""}${
                      busyId === task.id ? " is-busy" : ""
                    }`}
                  >
                    <Checkbox
                      checked={task.done}
                      disabled={busyId === task.id}
                      onChange={() => void toggleDone(task)}
                      aria-label={`${task.title} erledigt`}
                    />
                    <div className="tasks-hub-row-main">
                      <strong>{task.title}</strong>
                      <div className="tasks-hub-row-meta">
                        {customerLabel ? (
                          <Link
                            className="tasks-hub-chip is-customer"
                            to={`/customers/${task.customerId}/tasks`}
                          >
                            {customerLabel}
                          </Link>
                        ) : (
                          <span className="tasks-hub-chip">Intern</span>
                        )}
                        {task.projectName ? (
                          <span className="tasks-hub-chip">{task.projectName}</span>
                        ) : null}
                        {prio <= 2 ? (
                          <span className={`tasks-hub-chip is-prio-${prio}`}>
                            {priorityLabel[prio]}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <span className={`tasks-hub-due is-${due.tone}`}>{due.text}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="tasks-hub-split" role="separator" aria-hidden />

      <section className="tasks-hub-expiry panel" aria-labelledby="tasks-hub-expiry-title">
        <div className="tasks-hub-expiry-head">
          <div>
            <p className="eyebrow">Fristen</p>
            <h3 id="tasks-hub-expiry-title">Abläufe</h3>
            <p className="muted">
              {expiryCount
                ? `${expiryCount} in den nächsten ${days} Tagen`
                : `Keine in den nächsten ${days} Tagen`}
            </p>
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
          <div>
            <h4>Garantien</h4>
            {!reminders?.warranties.length ? (
              <p className="empty">Keine ablaufenden Garantien.</p>
            ) : (
              <ul className="tasks-hub-expiry-list">
                {reminders.warranties.map((w) => (
                  <li key={w.id}>
                    <Link to={`/customers/${w.customerId}/assets`}>
                      <span className="tasks-hub-expiry-title">{w.name}</span>
                      <span className="muted">
                        {customerDisplayName({
                          name: w.customerName,
                          company: w.customerCompany,
                        })}{" "}
                        · {assetKindLabel[w.kind]}
                      </span>
                      <em>{formatDateOnly(w.warrantyUntil)}</em>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h4>Verträge</h4>
            {!reminders?.contracts.length ? (
              <p className="empty">Keine auslaufenden Verträge.</p>
            ) : (
              <ul className="tasks-hub-expiry-list">
                {reminders.contracts.map((c) => (
                  <li key={c.id}>
                    <Link to={`/customers/${c.customerId}/wiki?view=contracts`}>
                      <span className="tasks-hub-expiry-title">{c.title}</span>
                      <span className="muted">
                        {customerDisplayName({
                          name: c.customerName,
                          company: c.customerCompany,
                        })}
                        {c.slaResponseHours ? ` · SLA ${c.slaResponseHours}h` : ""}
                      </span>
                      <em>{formatDateOnly(c.endDate)}</em>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <Modal
        open={open}
        title="Aufgabe anlegen"
        onClose={() => setOpen(false)}
        className="modal-task"
      >
        <form className="form-grid task-form" onSubmit={onSave}>
          <label className="field full">
            <span>Titel *</span>
            <input
              required
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              autoFocus
              placeholder="Was ist zu tun?"
            />
          </label>

          <label className="field full">
            <span>Kunde / Kontakt</span>
            <CustomerPicker
              value={form.customerId}
              onChange={(id) => setForm((f) => ({ ...f, customerId: id }))}
              allowEmpty
              emptyLabel="Intern (ohne Kunde)"
              placeholder="Optional suchen…"
            />
          </label>

          <div className="full task-due-block">
            <label className="field task-due-date">
              <span>Fällig am</span>
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
              />
            </label>
            <div className="task-due-presets" role="group" aria-label="Fälligkeit schnell setzen">
              <button
                type="button"
                className={`chip${form.dueDate === localTodayIso() ? " chip-active" : ""}`}
                onClick={() => setForm((f) => ({ ...f, dueDate: localTodayIso() }))}
              >
                Heute
              </button>
              <button
                type="button"
                className={`chip${form.dueDate === tomorrowIso() ? " chip-active" : ""}`}
                onClick={() => setForm((f) => ({ ...f, dueDate: tomorrowIso() }))}
              >
                Morgen
              </button>
              <button
                type="button"
                className={`chip${form.dueDate === addDaysIso(localTodayIso(), 7) ? " chip-active" : ""}`}
                onClick={() =>
                  setForm((f) => ({ ...f, dueDate: addDaysIso(localTodayIso(), 7) }))
                }
              >
                +7 Tage
              </button>
              <button
                type="button"
                className={`chip${form.dueDate === "" ? " chip-active" : ""}`}
                onClick={() => setForm((f) => ({ ...f, dueDate: "" }))}
              >
                Kein Datum
              </button>
            </div>
          </div>

          <div className="full">
            <span className="field-label">Priorität</span>
            <div className="task-prio-picker" role="radiogroup" aria-label="Priorität">
              {([1, 2, 3, 4] as TaskPriority[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={form.priority === String(p)}
                  className={`task-prio-option prio-${p}${form.priority === String(p) ? " is-active" : ""}`}
                  onClick={() =>
                    setForm((f) => ({ ...f, priority: String(p) as `${TaskPriority}` }))
                  }
                >
                  <i />
                  <span>{priorityLabel[p]}</span>
                </button>
              ))}
            </div>
          </div>

          <label className="field full">
            <span>Beschreibung</span>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Details, Notizen…"
            />
          </label>

          {error ? <p className="form-error full">{error}</p> : null}
          <div className="full form-actions modal-actions">
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
