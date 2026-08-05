import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../api";
import { formatDateOnly } from "../../lib/labels";
import type { ProjectItem, TimeEntryItem } from "../../types";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Zeiterfassung / Stundenbuchung für einen Kunden.
 */
export function CustomerTimePage() {
  const { id = "" } = useParams();
  const [entries, setEntries] = useState<TimeEntryItem[]>([]);
  const [summary, setSummary] = useState({ totalHours: 0, billableHours: 0, entryCount: 0 });
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [filterProject, setFilterProject] = useState("");
  const [form, setForm] = useState({
    workDate: todayIso(),
    hours: "1",
    description: "",
    projectId: "",
    billable: true,
  });

  async function reload() {
    const [time, p] = await Promise.all([
      api.timeEntries(id, filterProject ? { projectId: filterProject } : undefined),
      api.projects(id),
    ]);
    setEntries(time.entries);
    setSummary(time.summary);
    setProjects(p);
  }

  useEffect(() => {
    void reload();
  }, [id, filterProject]);

  const byMonth = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) {
      const key = e.workDate.slice(0, 7);
      map.set(key, (map.get(key) ?? 0) + Number(e.hours));
    }
    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 6);
  }, [entries]);

  async function createEntry(e: FormEvent) {
    e.preventDefault();
    await api.createTimeEntry(id, {
      workDate: form.workDate,
      hours: Number(form.hours),
      description: form.description,
      projectId: form.projectId || null,
      billable: form.billable,
    });
    setForm({
      workDate: todayIso(),
      hours: "1",
      description: "",
      projectId: form.projectId,
      billable: true,
    });
    await reload();
  }

  return (
    <section className="section">
      <div className="section-head">
        <h2>Zeiterfassung</h2>
        <p>Stunden dokumentieren, optional einem Projekt zuordnen und als abrechenbar markieren.</p>
      </div>

      <div className="stat-strip">
        <div className="stat-chip">
          <strong>{summary.totalHours}</strong>
          <span>Stunden (Filter)</span>
        </div>
        <div className="stat-chip">
          <strong>{summary.billableHours}</strong>
          <span>Abrechenbar</span>
        </div>
        <div className="stat-chip">
          <strong>{summary.entryCount}</strong>
          <span>Einträge</span>
        </div>
      </div>

      <form className="panel form-grid" onSubmit={createEntry}>
        <label className="field">
          <span>Datum *</span>
          <input
            type="date"
            required
            value={form.workDate}
            onChange={(e) => setForm({ ...form, workDate: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Stunden *</span>
          <input
            type="number"
            required
            min={0.25}
            max={24}
            step={0.25}
            value={form.hours}
            onChange={(e) => setForm({ ...form, hours: e.target.value })}
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
        <label className="field checkbox-field">
          <span>Abrechenbar</span>
          <label className="inline-check">
            <input
              type="checkbox"
              checked={form.billable}
              onChange={(e) => setForm({ ...form, billable: e.target.checked })}
            />
            Ja
          </label>
        </label>
        <label className="field full">
          <span>Beschreibung</span>
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Was wurde gemacht?"
          />
        </label>
        <div className="full">
          <button className="btn btn-primary" type="submit">
            Stunden buchen
          </button>
        </div>
      </form>

      <div className="wiki-toolbar">
        <label className="field" style={{ margin: 0, minWidth: 220 }}>
          <span>Filter Projekt</span>
          <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)}>
            <option value="">Alle Projekte</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {byMonth.length > 0 ? (
          <div className="month-chips">
            {byMonth.map(([month, hours]) => (
              <span key={month} className="chip">
                {month}: {Math.round(hours * 100) / 100}h
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {entries.length === 0 ? (
        <p className="empty">Noch keine Stunden erfasst.</p>
      ) : (
        <ul className="list">
          {entries.map((entry) => (
            <li key={entry.id} className="list-row">
              <div>
                <strong>
                  {entry.hours}h · {formatDateOnly(entry.workDate)}
                </strong>
                <span className="muted">
                  {entry.projectName || "Ohne Projekt"}
                  {entry.billable ? " · abrechenbar" : " · nicht abrechenbar"}
                </span>
                {entry.description ? <span className="muted">{entry.description}</span> : null}
              </div>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => void api.deleteTimeEntry(entry.id).then(() => reload())}
              >
                Löschen
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
