import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../api";
import { AttachmentPanel } from "../../components/AttachmentPanel";
import { CustomerSlaPanel } from "../../components/CustomerSlaPanel";
import {
  activityKindMeta,
  detectActivityKind,
  groupActivitiesByDay,
  polishActivityText,
  type ActivityKind,
} from "../../lib/activity";
import { formatDate, formatDateOnly } from "../../lib/labels";
import type { Activity, TaskItem } from "../../types";

function ActivityIcon({ kind }: { kind: ActivityKind }) {
  const props = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    "aria-hidden": true as const,
  };
  const icons: Record<ActivityKind, ReactNode> = {
    time: (
      <svg {...props}>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v4l2.5 1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    wiki: (
      <svg {...props}>
        <path d="M6 4h9l3 3v13H6z" strokeLinejoin="round" />
        <path d="M15 4v3h3M9 12h6M9 16h4" strokeLinecap="round" />
      </svg>
    ),
    appointment: (
      <svg {...props}>
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M8 3v4M16 3v4M4 10h16" strokeLinecap="round" />
      </svg>
    ),
    project: (
      <svg {...props}>
        <path d="M4 8h16v11H4zM8 8V6a2 2 0 012-2h4a2 2 0 012 2v2" strokeLinejoin="round" />
      </svg>
    ),
    asset: (
      <svg {...props}>
        <rect x="3" y="5" width="18" height="12" rx="2" />
        <path d="M8 21h8M12 17v4" strokeLinecap="round" />
      </svg>
    ),
    manual: (
      <svg {...props}>
        <path d="M12 4v10M8 10l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 18h14" strokeLinecap="round" />
      </svg>
    ),
  };
  return icons[kind];
}

/**
 * Betrieb: Aufgaben, SLAs, Historie und Anhänge.
 */
export function CustomerOpsPage() {
  const { id = "" } = useParams();
  const [activityList, setActivityList] = useState<Activity[]>([]);
  const [taskList, setTaskList] = useState<TaskItem[]>([]);
  const [contractList, setContractList] = useState<Awaited<ReturnType<typeof api.contracts>>>([]);
  const [activityForm, setActivityForm] = useState({ title: "", description: "" });
  const [taskForm, setTaskForm] = useState({ title: "", description: "", dueDate: "" });

  async function reload() {
    const [h, tasks, contracts] = await Promise.all([
      api.activities(id),
      api.tasks(id),
      api.contracts(id),
    ]);
    setActivityList(h);
    setTaskList(tasks);
    setContractList(contracts);
  }

  useEffect(() => {
    void reload();
  }, [id]);

  const historyDays = useMemo(() => groupActivitiesByDay(activityList), [activityList]);

  async function createActivity(e: FormEvent) {
    e.preventDefault();
    await api.createActivity(id, activityForm);
    setActivityForm({ title: "", description: "" });
    await reload();
  }

  async function createTask(e: FormEvent) {
    e.preventDefault();
    await api.createTask(id, taskForm);
    setTaskForm({ title: "", description: "", dueDate: "" });
    await reload();
  }

  return (
    <>
      <section className="section">
        <div className="section-head">
          <h2>Aufgaben</h2>
          <p>Offene Punkte mit optionaler Fälligkeit.</p>
        </div>
        <form className="panel inline-form" onSubmit={createTask}>
          <input
            placeholder="Aufgabe"
            value={taskForm.title}
            onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
            required
          />
          <input
            type="date"
            value={taskForm.dueDate}
            onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })}
          />
          <button className="btn btn-primary" type="submit">
            Hinzufügen
          </button>
        </form>
        {taskList.length === 0 ? (
          <p className="empty">Keine Aufgaben.</p>
        ) : (
          <ul className="list">
            {taskList.map((task) => (
              <li key={task.id} className="list-row">
                <label className="task-check">
                  <input
                    type="checkbox"
                    checked={task.done}
                    onChange={() =>
                      void api
                        .updateTask(task.id, {
                          title: task.title,
                          description: task.description ?? "",
                          dueDate: task.dueDate ?? "",
                          done: !task.done,
                        })
                        .then(() => reload())
                    }
                  />
                  <div>
                    <strong className={task.done ? "done" : undefined}>{task.title}</strong>
                    <span className="muted">Fällig: {formatDateOnly(task.dueDate)}</span>
                  </div>
                </label>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => void api.deleteTask(task.id).then(() => reload())}
                >
                  Löschen
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <CustomerSlaPanel customerId={id} contracts={contractList} onChanged={reload} />

      <section className="section">
        <div className="section-head">
          <h2>Einsatz-Historie</h2>
          <p>Was wurde wann gemacht – manuell oder automatisch bei Wiki/Projekten/Zeiten.</p>
        </div>
        <form className="panel inline-form" onSubmit={createActivity}>
          <input
            placeholder="Titel des Einsatzes"
            value={activityForm.title}
            onChange={(e) => setActivityForm({ ...activityForm, title: e.target.value })}
            required
          />
          <input
            placeholder="Kurzbeschreibung (optional)"
            value={activityForm.description}
            onChange={(e) => setActivityForm({ ...activityForm, description: e.target.value })}
          />
          <button className="btn btn-primary" type="submit">
            Eintrag
          </button>
        </form>
        {historyDays.length === 0 ? (
          <p className="empty">Noch keine Historie.</p>
        ) : (
          <div className="history-feed">
            {historyDays.map((day) => (
              <section key={day.dayKey} className="history-day">
                <h3 className="history-day-label">{day.label}</h3>
                <ol className="timeline">
                  {day.items.map((item) => {
                    const kind = detectActivityKind(item.title);
                    const meta = activityKindMeta(kind);
                    return (
                      <li key={item.id} className={`timeline-item ${meta.className}`}>
                        <div className={`timeline-marker ${meta.className}`} aria-hidden>
                          <ActivityIcon kind={kind} />
                        </div>
                        <div className="timeline-body">
                          <div className="timeline-card-head">
                            <div>
                              <span className={`timeline-kind ${meta.className}`}>{meta.label}</span>
                              <strong>{polishActivityText(item.title)}</strong>
                            </div>
                            <button
                              type="button"
                              className="btn btn-ghost btn-icon"
                              aria-label="Eintrag entfernen"
                              onClick={() => void api.deleteActivity(item.id).then(() => reload())}
                            >
                              <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                aria-hidden
                              >
                                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                              </svg>
                            </button>
                          </div>
                          {item.description ? (
                            <p className="muted">{polishActivityText(item.description)}</p>
                          ) : null}
                          <time className="timeline-time" dateTime={item.occurredAt}>
                            {formatDate(item.occurredAt)}
                          </time>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Anhänge</h2>
          <p>PDFs, Fotos und Lizenzscheine zu diesem Kunden.</p>
        </div>
        <div className="panel">
          <AttachmentPanel customerId={id} />
        </div>
      </section>
    </>
  );
}
