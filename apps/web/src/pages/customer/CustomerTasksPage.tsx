import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../api";
import { Checkbox } from "../../components/Checkbox";
import { Modal } from "../../components/Modal";
import { localTodayIso } from "../../lib/dates";
import {
  addDaysIso,
  buildTaskGroups,
  countTasksByView,
  dueLabel,
  filterTasksByView,
  nextWeekIso,
  priorityLabel,
  sortOptions,
  sortTasks,
  summarizeTasks,
  taskViewTabs,
  tomorrowIso,
  type TaskGroupBy,
  type TaskSort,
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
 * Kunden-Aufgaben: Kennzahlen, Ansichten, Sortierung, Schnellaktionen.
 */
export function CustomerTasksPage() {
  const { id = "" } = useParams();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [view, setView] = useState<TaskView>("today");
  const [projectFilter, setProjectFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<"" | `${TaskPriority}`>("");
  const [sort, setSort] = useState<TaskSort>("priority");
  const [groupBy, setGroupBy] = useState<TaskGroupBy>("auto");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [quickTitle, setQuickTitle] = useState("");
  const [quickDue, setQuickDue] = useState<"" | "today" | "tomorrow">("");
  const [quickPrio, setQuickPrio] = useState<TaskPriority>(4);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);

  async function reload() {
    const [list, projectList] = await Promise.all([
      api.tasks(id, {
        projectId: projectFilter || undefined,
      }),
      api.projects(id),
    ]);
    setTasks(list);
    setProjects(projectList);
  }

  useEffect(() => {
    void reload();
  }, [id, projectFilter]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (!target?.closest(".task-more")) setMenuId(null);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  const stats = useMemo(() => summarizeTasks(tasks), [tasks]);
  const viewCounts = useMemo(() => countTasksByView(tasks), [tasks]);

  const filtered = useMemo(() => {
    let list = filterTasksByView(tasks, view);
    if (priorityFilter) {
      const p = Number(priorityFilter);
      list = list.filter((t) => Number(t.priority || 4) === p);
    }
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.description ?? "").toLowerCase().includes(q) ||
          (t.projectName ?? "").toLowerCase().includes(q),
      );
    }
    return sortTasks(list, sort);
  }, [tasks, view, priorityFilter, query, sort]);

  const groups = useMemo(
    () => buildTaskGroups(filtered, view, groupBy),
    [filtered, view, groupBy],
  );

  const activeHint = taskViewTabs.find((t) => t.id === view)?.hint ?? "";
  const doneCount = viewCounts.done;

  function openCreate(defaults?: Partial<typeof emptyForm>) {
    setEditingId(null);
    setForm({
      ...emptyForm,
      dueDate: view === "today" ? localTodayIso() : view === "upcoming" ? tomorrowIso() : "",
      projectId: projectFilter && projectFilter !== "none" ? projectFilter : "",
      priority: priorityFilter || "4",
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
    setMenuId(null);
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    setEditingId(null);
    setError("");
  }

  async function patchTask(
    task: TaskItem,
    patch: Partial<Pick<TaskItem, "done" | "priority" | "dueDate" | "projectId" | "title" | "description">>,
  ) {
    setBusyId(task.id);
    setMenuId(null);
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? {
              ...t,
              ...patch,
              updatedAt: new Date().toISOString(),
            }
          : t,
      ),
    );
    try {
      await api.updateTask(task.id, patch);
      await reload();
    } finally {
      setBusyId(null);
    }
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
      priority: quickPrio,
      projectId: projectFilter && projectFilter !== "none" ? projectFilter : null,
    });
    setQuickTitle("");
    setQuickDue("");
    setQuickPrio(4);
    if (view === "done") setView(due ? "today" : "inbox");
    await reload();
  }

  async function toggleDone(task: TaskItem) {
    await patchTask(task, { done: !task.done });
  }

  async function cyclePriority(task: TaskItem) {
    const next = ((((task.priority || 4) as number) % 4) + 1) as TaskPriority;
    await patchTask(task, { priority: next });
  }

  async function setDue(task: TaskItem, dueDate: string | null) {
    await patchTask(task, { dueDate });
  }

  async function duplicateTask(task: TaskItem) {
    setMenuId(null);
    await api.createTask(id, {
      title: `${task.title} (Kopie)`,
      description: task.description,
      dueDate: task.dueDate,
      projectId: task.projectId,
      priority: task.priority || 4,
      done: false,
    });
    if (view === "done") setView("open");
    await reload();
  }

  async function clearDone() {
    const done = tasks.filter((t) => t.done);
    if (done.length === 0) return;
    if (!confirm(`${done.length} erledigte Aufgabe${done.length === 1 ? "" : "n"} endgültig löschen?`)) {
      return;
    }
    await Promise.all(done.map((t) => api.deleteTask(t.id)));
    await reload();
  }

  function renderTask(task: TaskItem) {
    const prio = (task.priority || 4) as TaskPriority;
    const due = dueLabel(task.dueDate, task.done);
    const menuOpen = menuId === task.id;
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
          <span className="task-title-line">
            <strong className={task.done ? "done" : undefined}>{task.title}</strong>
            {task.projectName ? <span className="task-chip">{task.projectName}</span> : null}
          </span>
          {task.description ? <span className="muted task-desc">{task.description}</span> : null}
        </button>

        <div className="task-side">
          <span className={`task-due tone-${due.tone}`} title={due.text}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <rect x="4" y="5" width="16" height="15" rx="2" />
              <path d="M8 3v4M16 3v4M4 10h16" strokeLinecap="round" />
            </svg>
            {due.text}
          </span>

          {!task.done ? (
            <div className="task-quick-due" role="group" aria-label="Fälligkeit setzen">
              <button
                type="button"
                className={`task-due-btn${task.dueDate === localTodayIso() ? " is-active" : ""}`}
                title="Heute"
                onClick={() => void setDue(task, localTodayIso())}
              >
                Heute
              </button>
              <button
                type="button"
                className={`task-due-btn${task.dueDate === tomorrowIso() ? " is-active" : ""}`}
                title="Morgen"
                onClick={() => void setDue(task, tomorrowIso())}
              >
                Morgen
              </button>
              <button
                type="button"
                className={`task-due-btn${!task.dueDate ? " is-active" : ""}`}
                title="Inbox"
                onClick={() => void setDue(task, null)}
              >
                Inbox
              </button>
            </div>
          ) : null}

          <div className="task-actions">
            <button
              type="button"
              className={`task-prio-btn prio-${prio}`}
              title={`Priorität: ${priorityLabel[prio]}`}
              aria-label={`Priorität ${priorityLabel[prio]}`}
              onClick={() => void cyclePriority(task)}
            >
              <i />
              <span>P{prio}</span>
            </button>

            <div className={`task-more${menuOpen ? " is-open" : ""}`}>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                aria-label="Weitere Aktionen"
                aria-expanded={menuOpen}
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuId(menuOpen ? null : task.id);
                }}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <circle cx="12" cy="5" r="1.6" />
                  <circle cx="12" cy="12" r="1.6" />
                  <circle cx="12" cy="19" r="1.6" />
                </svg>
              </button>
              {menuOpen ? (
                <div className="task-menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => openEdit(task)}>
                    Bearbeiten
                  </button>
                  <button type="button" role="menuitem" onClick={() => void duplicateTask(task)}>
                    Duplizieren
                  </button>
                  {!task.done ? (
                    <>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => void setDue(task, nextWeekIso())}
                      >
                        Nächste Woche
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => void setDue(task, addDaysIso(localTodayIso(), 7))}
                      >
                        In 7 Tagen
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    role="menuitem"
                    className="is-danger"
                    onClick={() => {
                      setMenuId(null);
                      if (confirm(`Aufgabe „${task.title}“ löschen?`)) {
                        void api.deleteTask(task.id).then(() => reload());
                      }
                    }}
                  >
                    Löschen
                  </button>
                </div>
              ) : null}
            </div>
          </div>
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
              {stats.open} offen
              {stats.overdue > 0 ? ` · ${stats.overdue} überfällig` : ""}
            </p>
          </div>
          <div className="tasks-hero-actions">
            {doneCount > 0 ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => void clearDone()}
                title="Alle erledigten Aufgaben löschen"
              >
                Erledigte löschen
              </button>
            ) : null}
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
        </div>

        <div className="tasks-kpi" aria-label="Kennzahlen">
          <button
            type="button"
            className={`tasks-kpi-item${view === "today" ? " is-active" : ""}${stats.overdue > 0 ? " is-warn" : ""}`}
            onClick={() => setView("today")}
          >
            <strong>{stats.today}</strong>
            <span>Heute / überfällig</span>
          </button>
          <button
            type="button"
            className={`tasks-kpi-item${view === "upcoming" ? " is-active" : ""}`}
            onClick={() => setView("upcoming")}
          >
            <strong>{viewCounts.upcoming}</strong>
            <span>Geplant</span>
          </button>
          <button
            type="button"
            className={`tasks-kpi-item${view === "inbox" ? " is-active" : ""}`}
            onClick={() => setView("inbox")}
          >
            <strong>{stats.inbox}</strong>
            <span>Inbox</span>
          </button>
          <button
            type="button"
            className={`tasks-kpi-item${view === "open" ? " is-active" : ""}`}
            onClick={() => setView("open")}
          >
            <strong>{stats.open}</strong>
            <span>Offen</span>
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
              placeholder="Neue Aufgabe – Enter zum Anlegen…"
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
          <div className="tasks-quick-prio" role="group" aria-label="Priorität">
            {([1, 2, 3, 4] as TaskPriority[]).map((p) => (
              <button
                key={p}
                type="button"
                className={`task-mini-prio prio-${p}${quickPrio === p ? " is-active" : ""}`}
                title={priorityLabel[p]}
                aria-pressed={quickPrio === p}
                onClick={() => setQuickPrio(p)}
              >
                P{p}
              </button>
            ))}
          </div>
          <button className="btn btn-primary btn-sm" type="submit" disabled={!quickTitle.trim()}>
            Add
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
              <span>{tab.label}</span>
              <em>{viewCounts[tab.id]}</em>
            </button>
          ))}
        </div>
        <div className="tasks-filters">
          <label className="field tasks-search">
            <span className="sr-only">Suche</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Suchen…"
            />
          </label>
          <label className="field tasks-project-filter">
            <span className="sr-only">Projekt</span>
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              aria-label="Projekt"
            >
              <option value="">Alle Projekte</option>
              <option value="none">Ohne Projekt</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field tasks-prio-filter">
            <span className="sr-only">Priorität</span>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as "" | `${TaskPriority}`)}
              aria-label="Priorität"
            >
              <option value="">Prio</option>
              <option value="1">P1</option>
              <option value="2">P2</option>
              <option value="3">P3</option>
              <option value="4">P4</option>
            </select>
          </label>
          <label className="field tasks-sort">
            <span className="sr-only">Sortierung</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as TaskSort)}
              aria-label="Sortierung"
            >
              {sortOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field tasks-group">
            <span className="sr-only">Gruppierung</span>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as TaskGroupBy)}
              aria-label="Gruppierung"
            >
              <option value="auto">Auto</option>
              <option value="project">Projekt</option>
              <option value="none">Flach</option>
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
          <p className="tasks-result-meta muted">
            {filtered.length} Aufgabe{filtered.length === 1 ? "" : "n"}
            {query.trim() ? " · gefiltert" : ""}
          </p>
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
              className={`chip ${form.dueDate === nextWeekIso() ? "chip-active" : ""}`}
              onClick={() => setForm({ ...form, dueDate: nextWeekIso() })}
            >
              Nächste Woche
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
