import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../api";
import { Checkbox } from "../../components/Checkbox";
import { Modal } from "../../components/Modal";
import { localTodayIso } from "../../lib/dates";
import { formatDateOnly } from "../../lib/labels";
import type { ProjectItem, TaskItem, TaskPriority } from "../../types";

type TaskView = "today" | "upcoming" | "inbox" | "all" | "done";

const viewTabs: { id: TaskView; label: string }[] = [
  { id: "today", label: "Heute" },
  { id: "upcoming", label: "Demnächst" },
  { id: "inbox", label: "Inbox" },
  { id: "all", label: "Alle" },
  { id: "done", label: "Erledigt" },
];

const priorityLabel: Record<TaskPriority, string> = {
  1: "P1 · Dringend",
  2: "P2 · Hoch",
  3: "P3 · Mittel",
  4: "P4 · Normal",
};

const emptyForm = {
  title: "",
  description: "",
  dueDate: "",
  projectId: "",
  priority: "4" as `${TaskPriority}`,
};

/**
 * Kunden-Aufgaben im Todoist-Stil: Ansichten, Priorität, Projekt.
 */
export function CustomerTasksPage() {
  const { id = "" } = useParams();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [view, setView] = useState<TaskView>("all");
  const [projectFilter, setProjectFilter] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [quickTitle, setQuickTitle] = useState("");

  async function reload() {
    const [list, projectList] = await Promise.all([
      api.tasks(id, {
        view,
        projectId: projectFilter || undefined,
      }),
      api.projects(id),
    ]);
    setTasks(list);
    setProjects(projectList);
  }

  useEffect(() => {
    void reload();
  }, [id, view, projectFilter]);

  const counts = useMemo(() => {
    const openTasks = tasks.filter((t) => !t.done);
    return {
      total: tasks.length,
      open: openTasks.length,
      overdue: openTasks.filter((t) => t.dueDate && t.dueDate < localTodayIso()).length,
    };
  }, [tasks]);

  function openCreate(defaults?: Partial<typeof emptyForm>) {
    setEditingId(null);
    setForm({ ...emptyForm, ...defaults });
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
      title: form.title,
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
    await api.createTask(id, {
      title: quickTitle.trim(),
      dueDate: view === "today" ? localTodayIso() : null,
      priority: 4,
      projectId: projectFilter && projectFilter !== "none" ? projectFilter : null,
    });
    setQuickTitle("");
    await reload();
  }

  async function toggleDone(task: TaskItem) {
    await api.updateTask(task.id, {
      title: task.title,
      description: task.description ?? "",
      dueDate: task.dueDate ?? "",
      projectId: task.projectId ?? null,
      priority: task.priority || 4,
      done: !task.done,
    });
    await reload();
  }

  return (
    <section className="section tasks-page">
      <div className="section-head row-between">
        <div>
          <h2>Aufgaben</h2>
          <p>Prioritäten, Fälligkeiten und Projekte – getrennt vom Betrieb.</p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-icon-lg"
          onClick={() => openCreate()}
          aria-label="Neue Aufgabe"
          title="Neue Aufgabe"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="stat-strip tasks-stats">
        <div className="stat-chip">
          <strong>{counts.open}</strong>
          <span>Offen</span>
        </div>
        <div className="stat-chip">
          <strong>{counts.overdue}</strong>
          <span>Überfällig</span>
        </div>
        <div className="stat-chip">
          <strong>{counts.total}</strong>
          <span>In Ansicht</span>
        </div>
      </div>

      <div className="tasks-toolbar">
        <div className="tasks-views" role="tablist" aria-label="Aufgabenansicht">
          {viewTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={view === tab.id}
              className={`cal-seg ${view === tab.id ? "is-active" : ""}`}
              onClick={() => setView(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <label className="field tasks-project-filter">
          <span>Projekt</span>
          <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
            <option value="">Alle Projekte</option>
            <option value="none">Ohne Projekt</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <form className="panel tasks-quick-add" onSubmit={quickAdd}>
        <input
          value={quickTitle}
          onChange={(e) => setQuickTitle(e.target.value)}
          placeholder="Schnellaufgabe hinzufügen…"
          aria-label="Schnellaufgabe"
        />
        <button className="btn btn-primary" type="submit" disabled={!quickTitle.trim()}>
          Hinzufügen
        </button>
      </form>

      {tasks.length === 0 ? (
        <p className="empty">Keine Aufgaben in dieser Ansicht.</p>
      ) : (
        <ul className="tasks-list">
          {tasks.map((task) => {
            const prio = (task.priority || 4) as TaskPriority;
            const overdue =
              !task.done && !!task.dueDate && task.dueDate < localTodayIso();
            return (
              <li key={task.id} className={`task-row prio-${prio}${task.done ? " is-done" : ""}`}>
                <Checkbox
                  checked={task.done}
                  onChange={() => void toggleDone(task)}
                  aria-label={task.done ? "Als offen markieren" : "Erledigen"}
                />
                <button type="button" className="task-main" onClick={() => openEdit(task)}>
                  <strong className={task.done ? "done" : undefined}>{task.title}</strong>
                  <span className="task-meta">
                    <span className={`task-prio prio-${prio}`}>P{prio}</span>
                    {task.projectName ? <span>{task.projectName}</span> : <span>Ohne Projekt</span>}
                    <span className={overdue ? "is-overdue" : undefined}>
                      {task.dueDate ? formatDateOnly(task.dueDate) : "Ohne Datum"}
                    </span>
                  </span>
                  {task.description ? (
                    <span className="muted task-desc">{task.description}</span>
                  ) : null}
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
                    <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={open}
        title={editingId ? "Aufgabe bearbeiten" : "Neue Aufgabe"}
        onClose={closeModal}
        className="modal-appointment"
      >
        <form className="form-grid task-form" onSubmit={save}>
          <label className="field full">
            <span>Titel *</span>
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Was ist zu tun?"
            />
          </label>
          <label className="field">
            <span>Fällig</span>
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Priorität</span>
            <select
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value as `${TaskPriority}` })}
            >
              {([1, 2, 3, 4] as TaskPriority[]).map((p) => (
                <option key={p} value={p}>
                  {priorityLabel[p]}
                </option>
              ))}
            </select>
          </label>
          <label className="field full">
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
          <label className="field full">
            <span>Beschreibung</span>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Details, Checkliste…"
            />
          </label>
          {error ? <p className="form-error full">{error}</p> : null}
          <div className="full form-actions modal-actions">
            <button className="btn btn-primary" type="submit">
              {editingId ? "Aktualisieren" : "Aufgabe anlegen"}
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
