import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../api";
import { Checkbox } from "../../components/Checkbox";
import { Modal } from "../../components/Modal";
import { localTodayIso } from "../../lib/dates";
import {
  apiViewFor,
  dueLabel,
  groupOpenTasks,
  priorityLabel,
  taskViewTabs,
  tomorrowIso,
  type TaskView,
} from "../../lib/tasks";
import type { ProjectItem, TaskItem, TaskPriority } from "../../types";

const emptyForm = {
  title: "",
  description: "",
  dueDate: "",
  projectId: "",
  priority: "4" as `${TaskPriority}`,
};

/**
 * Kunden-Aufgaben: klare Ansichten, Schnelladd und Prioritäten.
 */
export function CustomerTasksPage() {
  const { id = "" } = useParams();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [view, setView] = useState<TaskView>("today");
  const [projectFilter, setProjectFilter] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [quickTitle, setQuickTitle] = useState("");
  const [quickDue, setQuickDue] = useState<"" | "today" | "tomorrow">("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function reload() {
    const [list, projectList] = await Promise.all([
      api.tasks(id, {
        view: apiViewFor(view),
        projectId: projectFilter || undefined,
      }),
      api.projects(id),
    ]);
    setTasks(view === "open" ? list.filter((t) => !t.done) : list);
    setProjects(projectList);
  }

  useEffect(() => {
    void reload();
  }, [id, view, projectFilter]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q) ||
        (t.projectName ?? "").toLowerCase().includes(q),
    );
  }, [tasks, query]);

  const groups = useMemo(() => {
    if (view === "open") return groupOpenTasks(filtered);
    return [{ key: "flat", title: "", items: filtered }];
  }, [filtered, view]);

  const summary = useMemo(() => {
    const openCount = tasks.filter((t) => !t.done).length;
    const overdue = tasks.filter(
      (t) => !t.done && t.dueDate && t.dueDate < localTodayIso(),
    ).length;
    return { openCount, overdue, shown: filtered.length };
  }, [tasks, filtered]);

  const activeHint = taskViewTabs.find((t) => t.id === view)?.hint ?? "";

  function openCreate(defaults?: Partial<typeof emptyForm>) {
    setEditingId(null);
    setForm({
      ...emptyForm,
      dueDate: view === "today" ? localTodayIso() : view === "upcoming" ? tomorrowIso() : "",
      projectId: projectFilter && projectFilter !== "none" ? projectFilter : "",
      ...defaults,
    });
    setError("");
    setOpen(true);
  }

  function openEdit(task: TaskItem) {
    setEditingId(task.id);
    setForm({
      title: task.title,
      description: task.description ?? "",
      dueDate: task.dueDate ?? "",
      projectId: task.projectId ?? "",
      priority: String(task.priority || 4) as `${TaskPriority}`,
    });
    setError("");
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    setEditingId(null);
    setError("");
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    const body = {
      title: form.title.trim(),
      description: form.description,
      dueDate: form.dueDate || null,
      projectId: form.projectId || null,
      priority: Number(form.priority) as TaskPriority,
    };
    try {
      if (editingId) {
        const existing = tasks.find((t) => t.id === editingId);
        await api.updateTask(editingId, { ...body, done: existing?.done ?? false });
      } else {
        await api.createTask(id, body);
      }
      closeModal();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    }
  }

  async function quickAdd(e: FormEvent) {
    e.preventDefault();
    if (!quickTitle.trim()) return;
    const due =
      quickDue === "today"
        ? localTodayIso()
        : quickDue === "tomorrow"
          ? tomorrowIso()
          : view === "today"
            ? localTodayIso()
            : null;
    await api.createTask(id, {
      title: quickTitle.trim(),
      dueDate: due,
      priority: 4,
      projectId: projectFilter && projectFilter !== "none" ? projectFilter : null,
    });
    setQuickTitle("");
    setQuickDue("");
    if (view === "done") setView(due ? "today" : "inbox");
    await reload();
  }

  async function toggleDone(task: TaskItem) {
    setBusyId(task.id);
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t)).filter((t) => {
        if (view === "done") return t.done;
        if (view === "open" || view === "today" || view === "upcoming" || view === "inbox") {
          return t.id !== task.id || !t.done ? true : view === "open" ? false : true;
        }
        return true;
      }),
    );
    try {
      await api.updateTask(task.id, {
        title: task.title,
        description: task.description ?? "",
        dueDate: task.dueDate ?? "",
        projectId: task.projectId ?? null,
        priority: task.priority || 4,
        done: !task.done,
      });
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  async function cyclePriority(task: TaskItem) {
    const next = ((((task.priority || 4) as number) % 4) + 1) as TaskPriority;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, priority: next } : t)));
    await api.updateTask(task.id, {
      title: task.title,
      description: task.description ?? "",
      dueDate: task.dueDate ?? "",
      projectId: task.projectId ?? null,
      priority: next,
      done: task.done,
    });
  }

  function renderTask(task: TaskItem) {
    const prio = (task.priority || 4) as TaskPriority;
    const due = dueLabel(task.dueDate, task.done);
    return (
      <li
        key={task.id}
        className={`task-row prio-${prio}${task.done ? " is-done" : ""}${busyId === task.id ? " is-busy" : ""}`}
      >
        <Checkbox
          checked={task.done}
          onChange={() => void toggleDone(task)}
          aria-label={task.done ? "Wieder öffnen" : "Erledigen"}
        />
        <button type="button" className="task-main" onClick={() => openEdit(task)}>
          <strong className={task.done ? "done" : undefined}>{task.title}</strong>
          <span className="task-meta">
            {task.projectName ? (
              <span className="task-chip">{task.projectName}</span>
            ) : (
              <span className="task-chip is-muted">Kein Projekt</span>
            )}
            <span className={`task-due tone-${due.tone}`}>{due.text}</span>
          </span>
          {task.description ? <span className="muted task-desc">{task.description}</span> : null}
        </button>
        <div className="task-actions">
          <button
            type="button"
            className={`task-prio-btn prio-${prio}`}
            title={`Priorität: ${priorityLabel[prio]} (klicken zum Wechseln)`}
            aria-label={`Priorität ${priorityLabel[prio]}`}
            onClick={() => void cyclePriority(task)}
          >
            <i />
            <span>P{prio}</span>
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            aria-label="Aufgabe löschen"
            onClick={() => {
              if (confirm(`Aufgabe „${task.title}“ löschen?`)) {
                void api.deleteTask(task.id).then(() => reload());
              }
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path
                d="M5 7h14M10 7V5h4v2M8 7l.8 12h6.4L16 7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </li>
    );
  }

  return (
    <section className="section tasks-page">
      <div className="tasks-hero panel">
        <div className="tasks-hero-top">
          <div>
            <p className="eyebrow">To-dos</p>
            <h2>Aufgaben</h2>
            <p className="muted">
              {summary.openCount} offen
              {summary.overdue > 0 ? ` · ${summary.overdue} überfällig` : ""}
              {" · "}
              {activeHint}
            </p>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => openCreate()}>
            + Aufgabe
          </button>
        </div>

        <form className="tasks-quick-add" onSubmit={quickAdd}>
          <div className="tasks-quick-input">
            <span className="tasks-quick-icon" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
            </span>
            <input
              value={quickTitle}
              onChange={(e) => setQuickTitle(e.target.value)}
              placeholder="Aufgabe tippen und Enter…"
              aria-label="Schnellaufgabe"
            />
          </div>
          <div className="tasks-quick-chips" role="group" aria-label="Fälligkeit">
            <button
              type="button"
              className={`chip ${quickDue === "today" ? "chip-active" : ""}`}
              onClick={() => setQuickDue((d) => (d === "today" ? "" : "today"))}
            >
              Heute
            </button>
            <button
              type="button"
              className={`chip ${quickDue === "tomorrow" ? "chip-active" : ""}`}
              onClick={() => setQuickDue((d) => (d === "tomorrow" ? "" : "tomorrow"))}
            >
              Morgen
            </button>
          </div>
          <button className="btn btn-primary" type="submit" disabled={!quickTitle.trim()}>
            Hinzufügen
          </button>
        </form>
      </div>

      <div className="tasks-toolbar">
        <div className="tasks-views" role="tablist" aria-label="Aufgabenansicht">
          {taskViewTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={view === tab.id}
              title={tab.hint}
              className={`cal-seg ${view === tab.id ? "is-active" : ""}`}
              onClick={() => setView(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="tasks-filters">
          <label className="field tasks-search">
            <span>Suche</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Titel, Projekt…"
            />
          </label>
          <label className="field tasks-project-filter">
            <span>Projekt</span>
            <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
              <option value="">Alle</option>
              <option value="none">Ohne Projekt</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="tasks-empty panel">
          <div className="tasks-empty-icon" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M9 11l3 3L22 4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <strong>Keine Aufgaben hier</strong>
            <p className="muted">{activeHint}. Lege eine neue an oder wechsle die Ansicht.</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => openCreate()}>
            Aufgabe anlegen
          </button>
        </div>
      ) : (
        <div className="tasks-board">
          {groups.map((group) => (
            <section key={group.key} className="tasks-group">
              {group.title ? (
                <h3 className="tasks-group-title">
                  {group.title}
                  <span>{group.items.length}</span>
                </h3>
              ) : null}
              <ul className="tasks-list">{group.items.map(renderTask)}</ul>
            </section>
          ))}
        </div>
      )}

      <Modal
        open={open}
        title={editingId ? "Aufgabe bearbeiten" : "Neue Aufgabe"}
        onClose={closeModal}
        className="modal-task"
      >
        <form className="form-grid task-form" onSubmit={save}>
          <label className="field full">
            <span>Titel *</span>
            <input
              required
              autoFocus
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Was ist zu tun?"
            />
          </label>

          <div className="full task-due-presets" role="group" aria-label="Fälligkeit schnell setzen">
            <button
              type="button"
              className={`chip ${form.dueDate === localTodayIso() ? "chip-active" : ""}`}
              onClick={() => setForm({ ...form, dueDate: localTodayIso() })}
            >
              Heute
            </button>
            <button
              type="button"
              className={`chip ${form.dueDate === tomorrowIso() ? "chip-active" : ""}`}
              onClick={() => setForm({ ...form, dueDate: tomorrowIso() })}
            >
              Morgen
            </button>
            <button
              type="button"
              className={`chip ${form.dueDate === "" ? "chip-active" : ""}`}
              onClick={() => setForm({ ...form, dueDate: "" })}
            >
              Kein Datum
            </button>
          </div>

          <label className="field">
            <span>Fällig</span>
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Projekt</span>
            <select
              value={form.projectId}
              onChange={(e) => setForm({ ...form, projectId: e.target.value })}
            >
              <option value="">Kein Projekt</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

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
                  onClick={() => setForm({ ...form, priority: String(p) as `${TaskPriority}` })}
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
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Details, Notizen…"
            />
          </label>
          {error ? <p className="form-error full">{error}</p> : null}
          <div className="full form-actions modal-actions">
            <button className="btn btn-primary" type="submit">
              {editingId ? "Speichern" : "Anlegen"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={closeModal}>
              Abbrechen
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
