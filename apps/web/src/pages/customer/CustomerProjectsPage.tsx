import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../api";
import { formatDateOnly, projectStatusLabel } from "../../lib/labels";
import type { ProjectItem, ProjectStatus } from "../../types";

const emptyForm = {
  name: "",
  description: "",
  status: "planned" as ProjectStatus,
  startDate: "",
  endDate: "",
  budgetHours: "",
  budgetAmount: "",
  hourlyRate: "",
};

/**
 * Projekte und Budgetplanung pro Kunde.
 */
export function CustomerProjectsPage() {
  const { id = "" } = useParams();
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function reload() {
    setProjects(await api.projects(id));
  }

  useEffect(() => {
    void reload();
  }, [id]);

  function startEdit(p: ProjectItem) {
    setEditingId(p.id);
    setShowForm(true);
    setForm({
      name: p.name,
      description: p.description ?? "",
      status: p.status,
      startDate: p.startDate ?? "",
      endDate: p.endDate ?? "",
      budgetHours: p.budgetHours != null ? String(p.budgetHours) : "",
      budgetAmount: p.budgetAmount != null ? String(p.budgetAmount) : "",
      hourlyRate: p.hourlyRate != null ? String(p.hourlyRate) : "",
    });
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const body = {
      name: form.name,
      description: form.description,
      status: form.status,
      startDate: form.startDate,
      endDate: form.endDate,
      budgetHours: form.budgetHours ? Number(form.budgetHours) : null,
      budgetAmount: form.budgetAmount ? Number(form.budgetAmount) : null,
      hourlyRate: form.hourlyRate ? Number(form.hourlyRate) : null,
    };
    if (editingId) {
      await api.updateProject(editingId, body);
    } else {
      await api.createProject(id, body);
    }
    resetForm();
    await reload();
  }

  return (
    <section className="section">
      <div className="section-head row-between">
        <div>
          <h2>Projekte</h2>
          <p>Planung, Status und Budget in Stunden oder Euro – ohne Rechnungsstellung.</p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            if (showForm && !editingId) resetForm();
            else {
              setEditingId(null);
              setForm(emptyForm);
              setShowForm(true);
            }
          }}
        >
          {showForm && !editingId ? "Abbrechen" : "+ Projekt"}
        </button>
      </div>

      {showForm ? (
        <form className="panel form-grid" onSubmit={save}>
          <label className="field">
            <span>Name *</span>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="z. B. Firewall-Migration"
            />
          </label>
          <label className="field">
            <span>Status</span>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })}
            >
              {(Object.keys(projectStatusLabel) as ProjectStatus[]).map((s) => (
                <option key={s} value={s}>
                  {projectStatusLabel[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Start</span>
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Ende</span>
            <input
              type="date"
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Budget Stunden</span>
            <input
              type="number"
              min={0}
              step={0.25}
              value={form.budgetHours}
              onChange={(e) => setForm({ ...form, budgetHours: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Budget Euro</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={form.budgetAmount}
              onChange={(e) => setForm({ ...form, budgetAmount: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Stundensatz Euro</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={form.hourlyRate}
              onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })}
            />
          </label>
          <label className="field full">
            <span>Beschreibung / Plan</span>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Ziele, Meilensteine, Risiken…"
            />
          </label>
          <div className="full cta-row">
            <button className="btn btn-primary" type="submit">
              {editingId ? "Aktualisieren" : "Projekt anlegen"}
            </button>
            {editingId ? (
              <button type="button" className="btn btn-ghost" onClick={resetForm}>
                Abbrechen
              </button>
            ) : null}
          </div>
        </form>
      ) : null}

      {projects.length === 0 ? (
        <p className="empty">Noch keine Projekte. Plane hier Budgets und Laufzeiten.</p>
      ) : (
        <ul className="list project-list">
          {projects.map((p) => {
            const logged = p.loggedHours ?? 0;
            const budget = p.budgetHours;
            const pct =
              budget && budget > 0 ? Math.min(100, Math.round((logged / budget) * 100)) : null;
            return (
              <li key={p.id} className="panel project-card">
                <div className="row-between">
                  <div>
                    <strong>{p.name}</strong>
                    <span className="muted">
                      <span className={`badge badge-status-${p.status}`}>
                        {projectStatusLabel[p.status]}
                      </span>
                      {" · "}
                      {formatDateOnly(p.startDate)} – {formatDateOnly(p.endDate)}
                    </span>
                  </div>
                  <div className="cta-row">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => startEdit(p)}>
                      Bearbeiten
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() =>
                        void api.deleteProject(p.id).then(() => reload())
                      }
                    >
                      Löschen
                    </button>
                  </div>
                </div>
                {p.description ? <p className="muted">{p.description}</p> : null}
                <div className="budget-grid">
                  <div>
                    <span className="label">Gebucht</span>
                    <p>
                      <strong>{logged}</strong> h
                    </p>
                  </div>
                  <div>
                    <span className="label">Budget Stunden</span>
                    <p>{budget != null ? `${budget} h` : "–"}</p>
                  </div>
                  <div>
                    <span className="label">Rest</span>
                    <p>
                      {p.budgetHoursRemaining != null
                        ? `${p.budgetHoursRemaining} h`
                        : "–"}
                    </p>
                  </div>
                  <div>
                    <span className="label">Budget Euro</span>
                    <p>{p.budgetAmount != null ? `${p.budgetAmount.toLocaleString("de-DE")} €` : "–"}</p>
                  </div>
                  <div>
                    <span className="label">Geschätzt (Satz × Stunden)</span>
                    <p>
                      {p.estimatedCost != null
                        ? `${p.estimatedCost.toLocaleString("de-DE")} €`
                        : "–"}
                    </p>
                  </div>
                </div>
                {pct != null ? (
                  <div className="budget-bar" aria-label={`Budgetverbrauch ${pct}%`}>
                    <div
                      className={`budget-bar-fill ${pct >= 100 ? "over" : pct >= 80 ? "warn" : ""}`}
                      style={{ width: `${pct}%` }}
                    />
                    <span>{pct}% des Stundenbudgets</span>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
