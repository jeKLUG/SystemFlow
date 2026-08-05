import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../api";
import { AttachmentPanel } from "../../components/AttachmentPanel";
import { formatDate, formatDateOnly } from "../../lib/labels";
import type { Activity, ContractItem, TaskItem } from "../../types";

/**
 * Betrieb: Aufgaben, Verträge, Historie und Anhänge.
 */
export function CustomerOpsPage() {
  const { id = "" } = useParams();
  const [activityList, setActivityList] = useState<Activity[]>([]);
  const [taskList, setTaskList] = useState<TaskItem[]>([]);
  const [contractList, setContractList] = useState<ContractItem[]>([]);
  const [activityForm, setActivityForm] = useState({ title: "", description: "" });
  const [taskForm, setTaskForm] = useState({ title: "", description: "", dueDate: "" });
  const [contractForm, setContractForm] = useState({
    title: "",
    startDate: "",
    endDate: "",
    slaResponseHours: "",
    contactPerson: "",
    notes: "",
  });

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

  async function createContract(e: FormEvent) {
    e.preventDefault();
    await api.createContract(id, {
      title: contractForm.title,
      startDate: contractForm.startDate,
      endDate: contractForm.endDate,
      slaResponseHours: contractForm.slaResponseHours
        ? Number(contractForm.slaResponseHours)
        : null,
      contactPerson: contractForm.contactPerson,
      notes: contractForm.notes,
    });
    setContractForm({
      title: "",
      startDate: "",
      endDate: "",
      slaResponseHours: "",
      contactPerson: "",
      notes: "",
    });
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

      <section className="section">
        <div className="section-head">
          <h2>Verträge / SLA</h2>
          <p>Laufzeiten und Reaktionszeiten – keine Rechnungen (Lexware).</p>
        </div>
        <form className="panel form-grid" onSubmit={createContract}>
          <label className="field">
            <span>Titel *</span>
            <input
              required
              value={contractForm.title}
              onChange={(e) => setContractForm({ ...contractForm, title: e.target.value })}
            />
          </label>
          <label className="field">
            <span>SLA (Stunden)</span>
            <input
              type="number"
              min={1}
              value={contractForm.slaResponseHours}
              onChange={(e) =>
                setContractForm({ ...contractForm, slaResponseHours: e.target.value })
              }
            />
          </label>
          <label className="field">
            <span>Beginn</span>
            <input
              type="date"
              value={contractForm.startDate}
              onChange={(e) => setContractForm({ ...contractForm, startDate: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Ende</span>
            <input
              type="date"
              value={contractForm.endDate}
              onChange={(e) => setContractForm({ ...contractForm, endDate: e.target.value })}
            />
          </label>
          <label className="field full">
            <span>Ansprechpartner Vertrag</span>
            <input
              value={contractForm.contactPerson}
              onChange={(e) =>
                setContractForm({ ...contractForm, contactPerson: e.target.value })
              }
            />
          </label>
          <div className="full">
            <button className="btn btn-primary" type="submit">
              Vertrag speichern
            </button>
          </div>
        </form>
        {contractList.length === 0 ? (
          <p className="empty">Keine Verträge.</p>
        ) : (
          <ul className="list">
            {contractList.map((c) => (
              <li key={c.id} className="list-row">
                <div>
                  <strong>{c.title}</strong>
                  <span className="muted">
                    {formatDateOnly(c.startDate)} – {formatDateOnly(c.endDate)}
                    {c.slaResponseHours ? ` · SLA ${c.slaResponseHours}h` : ""}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => void api.deleteContract(c.id).then(() => reload())}
                >
                  Löschen
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

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
        {activityList.length === 0 ? (
          <p className="empty">Noch keine Historie.</p>
        ) : (
          <ol className="timeline">
            {activityList.map((item) => (
              <li key={item.id} className="timeline-item">
                <div className="timeline-dot" aria-hidden="true" />
                <div className="timeline-body">
                  <div className="row-between">
                    <strong>{item.title}</strong>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => void api.deleteActivity(item.id).then(() => reload())}
                    >
                      Entfernen
                    </button>
                  </div>
                  {item.description ? <p className="muted">{item.description}</p> : null}
                  <time className="muted">{formatDate(item.occurredAt)}</time>
                </div>
              </li>
            ))}
          </ol>
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
