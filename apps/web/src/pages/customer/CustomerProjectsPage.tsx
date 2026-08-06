import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../api";
import { Modal } from "../../components/Modal";
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

function formatEuro(value: number | null | undefined): string {
  if (value == null) return "–";
  return `${value.toLocaleString("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} €`;
}

function formatHours(value: number | null | undefined): string {
  if (value == null) return "–";
  return `${value} h`;
}

/**
 * Projekte und Budgetplanung pro Kunde.
 */
export function CustomerProjectsPage() {
  const { id = "" } = useParams();
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saveHint, setSaveHint] = useState("");

  async function reload() {
    setProjects(await api.projects(id));
  }

  useEffect(() => {
    void reload();
  }, [id]);

  const summary = useMemo(() => {
    const active = projects.filter((p) => p.status === "active").length;
    const hours = projects.reduce((sum, p) => sum + (p.loggedHours ?? 0), 0);
    return { total: projects.length, active, hours: Math.round(hours * 100) / 100 };
  }, [projects]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function startEdit(p: ProjectItem) {
    setEditingId(p.id);
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
    setOpen(true);
  }

  function closeModal() {
    setForm(emptyForm);
    setEditingId(null);
    setOpen(false);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaveHint("");
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
      const updated = await api.updateProject(editingId, body);
      const n = updated.recalculatedEntries ?? 0;
      if (n > 0) {
        setSaveHint(`${n} Zeiteinträge mit neuem Stundensatz aktualisiert.`);
      }
    } else {
      await api.createProject(id, body);
    }
    closeModal();
    await reload();
  }

  return (
    <section className="section projects-page">
      <div className="projects-hero panel">
        <div className="projects-hero-top">
          <div>
            <p className="eyebrow">Planung</p>
            <h2>Projekte</h2>
            <p className="muted">
              {summary.total} Projekt{summary.total === 1 ? "" : "e"}
              {summary.active > 0 ? ` · ${summary.active} aktiv` : ""}
              {summary.hours > 0 ? ` · ${summary.hours} h gebucht` : ""}
            </p>
          </div>
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            + Projekt
          </button>
        </div>
      </div>

      {saveHint ? <p className="form-success">{saveHint}</p> : null}

      {projects.length === 0 ? (
        <div className="projects-empty panel">
          <div className="projects-empty-icon" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M4 8h16v11H4zM8 8V6a2 2 0 012-2h4a2 2 0 012 2v2" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <strong>Noch keine Projekte</strong>
            <p className="muted">Plane Budgets, Laufzeiten und Stundensätze für diesen Kunden.</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            Projekt anlegen
          </button>
        </div>
      ) : (
        <ul className="project-list">
          {projects.map((p) => {
            const logged = p.loggedHours ?? 0;
            const budget = p.budgetHours;
            const remaining = p.budgetHoursRemaining;
            const pct =
              budget && budget > 0 ? Math.min(100, Math.round((logged / budget) * 100)) : null;
            const barTone = pct == null ? "" : pct >= 100 ? "over" : pct >= 80 ? "warn" : "ok";
            return (
              <li key={p.id} className={`project-card is-${p.status}`}>
                <div className="project-card-head">
                  <div className="project-card-title">
                    <h3>{p.name}</h3>
                    <span className={`badge badge-status-${p.status}`}>
                      {projectStatusLabel[p.status]}
                    </span>
                  </div>
                  <div className="list-actions">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => startEdit(p)}
                    >
                      Bearbeiten
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => {
                        if (confirm(`Projekt „${p.name}“ löschen?`)) {
                          void api.deleteProject(p.id).then(() => reload());
                        }
                      }}
                    >
                      Löschen
                    </button>
                  </div>
                </div>

                <div className="project-card-meta">
                  <span className="project-meta-chip">
                    {formatDateOnly(p.startDate)} – {formatDateOnly(p.endDate)}
                  </span>
                  {p.hourlyRate != null ? (
                    <span className="project-meta-chip">
                      {p.hourlyRate.toLocaleString("de-DE")} €/h
                    </span>
                  ) : null}
                </div>

                {p.description ? <p className="project-card-desc">{p.description}</p> : null}

                <div className="budget-grid">
                  <div className="budget-metric">
                    <span className="label">Gebucht</span>
                    <strong>{formatHours(logged)}</strong>
                  </div>
                  <div className="budget-metric">
                    <span className="label">Budget</span>
                    <strong>{formatHours(budget)}</strong>
                  </div>
                  <div className="budget-metric">
                    <span className="label">Rest</span>
                    <strong className={remaining != null && remaining < 0 ? "is-over" : undefined}>
                      {formatHours(remaining)}
                    </strong>
                  </div>
                  <div className="budget-metric">
                    <span className="label">Budget €</span>
                    <strong>{formatEuro(p.budgetAmount)}</strong>
                  </div>
                  <div className="budget-metric">
                    <span className="label">Geschätzt</span>
                    <strong>{formatEuro(p.estimatedCost)}</strong>
                  </div>
                </div>

                {pct != null ? (
                  <div className={`budget-progress is-${barTone}`}>
                    <div className="budget-progress-head">
                      <span>Stundenbudget</span>
                      <strong>{pct}%</strong>
                    </div>
                    <div
                      className="budget-bar"
                      aria-label={`Budgetverbrauch ${pct}%`}
                      role="progressbar"
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className={`budget-bar-fill ${barTone === "ok" ? "" : barTone}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="project-no-budget muted">Kein Stundenbudget hinterlegt</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={open}
        title={editingId ? "Projekt bearbeiten" : "Neues Projekt"}
        onClose={closeModal}
        className="modal-wide"
      >
        <form className="form-grid" onSubmit={save}>
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
