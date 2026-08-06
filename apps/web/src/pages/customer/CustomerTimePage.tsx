import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api";
import { Checkbox } from "../../components/Checkbox";
import { addMinutesToTime, localTodayIso } from "../../lib/dates";
import { formatDateOnly } from "../../lib/labels";
import { formatHours, hoursFromRange } from "../../lib/time";
import type { PriceItem, ProjectItem, TimeEntryItem } from "../../types";

/**
 * Zeiterfassung: Start-/Endzeit, optional Leistung/Satz aus dem Preiskatalog.
 */
export function CustomerTimePage() {
  const { id = "" } = useParams();
  const [entries, setEntries] = useState<TimeEntryItem[]>([]);
  const [summary, setSummary] = useState({
    totalHours: 0,
    billableHours: 0,
    billableAmount: 0,
    entryCount: 0,
  });
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [priceItems, setPriceItems] = useState<PriceItem[]>([]);
  const [currency, setCurrency] = useState("EUR");
  const [filterProject, setFilterProject] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    workDate: localTodayIso(),
    startTime: "09:00",
    endTime: "10:00",
    description: "",
    projectId: "",
    priceItemId: "",
    billable: true,
  });

  const computedHours = useMemo(
    () => hoursFromRange(form.startTime, form.endTime),
    [form.startTime, form.endTime],
  );

  const hourlyPrices = useMemo(
    () => priceItems.filter((p) => p.kind === "hourly" && p.active),
    [priceItems],
  );

  async function reload() {
    const [time, p, prices, org] = await Promise.all([
      api.timeEntries(id, filterProject ? { projectId: filterProject } : undefined),
      api.projects(id),
      api.priceItems({ activeOnly: true }),
      api.orgSettings(),
    ]);
    setEntries(time.entries);
    setSummary({
      totalHours: time.summary.totalHours,
      billableHours: time.summary.billableHours,
      billableAmount: time.summary.billableAmount ?? 0,
      entryCount: time.summary.entryCount,
    });
    setProjects(p);
    setPriceItems(prices);
    setCurrency(org.currency || "EUR");
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
    setError("");
    if (computedHours == null) {
      setError("Bitte gültige Start- und Endzeit angeben.");
      return;
    }
    try {
      await api.createTimeEntry(id, {
        workDate: form.workDate,
        startTime: form.startTime,
        endTime: form.endTime,
        description: form.description,
        projectId: form.projectId || null,
        priceItemId: form.priceItemId || null,
        billable: form.billable,
      });
      setForm({
        workDate: localTodayIso(),
        startTime: form.endTime,
        endTime: addMinutesToTime(form.endTime, 60),
        description: "",
        projectId: form.projectId,
        priceItemId: form.priceItemId,
        billable: true,
      });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    }
  }

  return (
    <section className="section">
      <div className="section-head row-between">
        <div>
          <h2>Zeiterfassung</h2>
          <p>
            Von–bis eingeben – Stunden und Betrag werden berechnet. Sätze unter{" "}
            <Link to="/settings">Konto</Link> pflegen.
          </p>
        </div>
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
          <strong>
            {summary.billableAmount.toLocaleString("de-DE", {
              minimumFractionDigits: 0,
              maximumFractionDigits: 2,
            })}
          </strong>
          <span>Netto {currency}</span>
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
          <span>Von *</span>
          <input
            type="time"
            required
            value={form.startTime}
            onChange={(e) => setForm({ ...form, startTime: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Bis *</span>
          <input
            type="time"
            required
            value={form.endTime}
            onChange={(e) => setForm({ ...form, endTime: e.target.value })}
          />
        </label>
        <div className="field">
          <span>Dauer</span>
          <p className="time-duration">
            {computedHours != null ? (
              <>
                <strong>{formatHours(computedHours)}</strong>
                <span className="muted"> ({computedHours} h)</span>
              </>
            ) : (
              <span className="muted">Ungültiger Zeitraum</span>
            )}
          </p>
        </div>
        <label className="field">
          <span>Leistung / Satz</span>
          <select
            value={form.priceItemId}
            onChange={(e) => setForm({ ...form, priceItemId: e.target.value })}
          >
            <option value="">Standard / Projekt-Satz</option>
            {hourlyPrices.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.unitPrice.toLocaleString("de-DE")} {currency}/h)
              </option>
            ))}
          </select>
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
                {p.hourlyRate != null ? ` · ${p.hourlyRate} ${currency}/h` : ""}
              </option>
            ))}
          </select>
        </label>
        <Checkbox
          fieldLabel="Abrechenbar"
          label={form.billable ? "Ja" : "Nein"}
          checked={form.billable}
          onChange={(billable) => setForm({ ...form, billable })}
        />
        <label className="field full">
          <span>Beschreibung</span>
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Was wurde gemacht?"
          />
        </label>
        {error ? <p className="form-error full">{error}</p> : null}
        <div className="full">
          <button className="btn btn-primary" type="submit" disabled={computedHours == null}>
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
                  {formatHours(Number(entry.hours))} · {formatDateOnly(entry.workDate)}
                  {entry.startTime && entry.endTime
                    ? ` · ${entry.startTime}–${entry.endTime}`
                    : ""}
                </strong>
                <span className="muted">
                  {entry.priceItemName || "Standard-Satz"}
                  {entry.rateSnapshot != null
                    ? ` · ${entry.rateSnapshot.toLocaleString("de-DE")} ${currency}/h`
                    : ""}
                  {entry.amountSnapshot != null
                    ? ` · ${entry.amountSnapshot.toLocaleString("de-DE")} ${currency}`
                    : ""}
                </span>
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
