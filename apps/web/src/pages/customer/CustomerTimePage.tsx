import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api";
import { Checkbox } from "../../components/Checkbox";
import { Modal } from "../../components/Modal";
import { addMinutesToTime, localTodayIso, parseDateOnly } from "../../lib/dates";
import { formatDateOnly } from "../../lib/labels";
import { formatHours, hoursFromRange } from "../../lib/time";
import type { PriceItem, ProjectItem, TimeEntryItem } from "../../types";

function monthLabel(ym: string): string {
  try {
    const [y, m] = ym.split("-").map(Number);
    return new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" }).format(
      new Date(y!, m! - 1, 1),
    );
  } catch {
    return ym;
  }
}

function dayHeading(iso: string): string {
  try {
    const today = localTodayIso();
    if (iso === today) return "Heute";
    const d = parseDateOnly(iso);
    const yesterday = parseDateOnly(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yIso = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
    if (iso === yIso) return "Gestern";
    return new Intl.DateTimeFormat("de-DE", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(d);
  } catch {
    return formatDateOnly(iso);
  }
}

/**
 * Zeiterfassung: Historie-Übersicht, Buchung per Modal.
 */
export function CustomerTimePage() {
  const { id = "" } = useParams();
  const [entries, setEntries] = useState<TimeEntryItem[]>([]);
  const [summary, setSummary] = useState({
    totalHours: 0,
    billableHours: 0,
    billableAmount: 0,
    unbilledHours: 0,
    unbilledAmount: 0,
    entryCount: 0,
  });
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [priceItems, setPriceItems] = useState<PriceItem[]>([]);
  const [currency, setCurrency] = useState("EUR");
  const [filterProject, setFilterProject] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [form, setForm] = useState({
    workDate: localTodayIso(),
    startTime: "09:00",
    endTime: "10:00",
    description: "",
    projectId: "",
    priceItemId: "",
    billable: true,
    billed: false,
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
      unbilledHours: time.summary.unbilledHours ?? 0,
      unbilledAmount: time.summary.unbilledAmount ?? 0,
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

  const groups = useMemo(() => {
    const map = new Map<string, TimeEntryItem[]>();
    for (const e of entries) {
      const list = map.get(e.workDate);
      if (list) list.push(e);
      else map.set(e.workDate, [e]);
    }
    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, items]) => ({
        date,
        label: dayHeading(date),
        hours: Math.round(items.reduce((s, i) => s + Number(i.hours), 0) * 100) / 100,
        items,
      }));
  }, [entries]);

  function openCreate() {
    setError("");
    setForm((f) => ({
      ...f,
      workDate: localTodayIso(),
      description: "",
      billable: true,
      billed: false,
    }));
    setOpen(true);
  }

  async function toggleBilled(entry: TimeEntryItem) {
    setBusyId(entry.id);
    try {
      await api.updateTimeEntry(entry.id, { billed: !entry.billed });
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  function closeModal() {
    setOpen(false);
    setError("");
  }

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
        billed: form.billed,
      });
      setForm({
        workDate: localTodayIso(),
        startTime: form.endTime,
        endTime: addMinutesToTime(form.endTime, 60),
        description: "",
        projectId: form.projectId,
        priceItemId: form.priceItemId,
        billable: true,
        billed: false,
      });
      closeModal();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    }
  }

  return (
    <section className="section time-page">
      <div className="time-hero panel">
        <div className="time-hero-top">
          <div>
            <p className="eyebrow">Abrechnung</p>
            <h2>Zeiterfassung</h2>
            <p className="muted">
              Übersicht der gebuchten Stunden. Sätze unter{" "}
              <Link to="/settings">Konto</Link> pflegen.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-icon-lg"
            onClick={openCreate}
            aria-label="Zeit buchen"
            title="Zeit buchen"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="12" cy="12" r="8" />
              <path d="M12 8v4l2.5 1.5M12 5v1" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <div className="stat-strip time-stats">
          <div className="stat-chip">
            <strong>{summary.totalHours}</strong>
            <span>Stunden</span>
          </div>
          <div className="stat-chip">
            <strong>{summary.billableHours}</strong>
            <span>Abrechenbar</span>
          </div>
          <div className={`stat-chip${summary.unbilledHours > 0 ? " is-warn" : ""}`}>
            <strong>{summary.unbilledHours}</strong>
            <span>Noch offen</span>
          </div>
          <div className="stat-chip">
            <strong>
              {summary.unbilledAmount.toLocaleString("de-DE", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2,
              })}
            </strong>
            <span>Offen {currency}</span>
          </div>
          <div className="stat-chip">
            <strong>
              {summary.billableAmount.toLocaleString("de-DE", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2,
              })}
            </strong>
            <span>Netto gesamt</span>
          </div>
        </div>
      </div>

      <div className="time-toolbar">
        <label className="field time-filter">
          <span>Projekt</span>
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
                {monthLabel(month)} · {Math.round(hours * 100) / 100}h
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {groups.length === 0 ? (
        <div className="time-empty panel">
          <div className="time-empty-icon" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <circle cx="12" cy="12" r="8" />
              <path d="M12 8v4l2.5 1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <strong>Noch keine Stunden</strong>
            <p className="muted">Buche die erste Zeit über das Uhr-Icon oben rechts.</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            Zeit buchen
          </button>
        </div>
      ) : (
        <div className="time-history">
          {groups.map((group) => (
            <section key={group.date} className="time-day">
              <div className="time-day-head">
                <h3>{group.label}</h3>
                <span>{formatHours(group.hours)}</span>
              </div>
              <ul className="time-entry-list">
                {group.items.map((entry) => (
                  <li
                    key={entry.id}
                    className={`time-entry${entry.billable ? "" : " is-nonbillable"}${entry.billed ? " is-billed" : ""}`}
                  >
                    <div className="time-entry-range">
                      <strong>
                        {entry.startTime && entry.endTime
                          ? `${entry.startTime}–${entry.endTime}`
                          : formatHours(Number(entry.hours))}
                      </strong>
                      <span>{formatHours(Number(entry.hours))}</span>
                    </div>
                    <div className="time-entry-body">
                      <strong>{entry.description || "Ohne Beschreibung"}</strong>
                      <span className="time-entry-meta">
                        <span className="time-chip">{entry.projectName || "Ohne Projekt"}</span>
                        <span className="time-chip">
                          {entry.priceItemName || "Standard-Satz"}
                          {entry.rateSnapshot != null
                            ? ` · ${entry.rateSnapshot.toLocaleString("de-DE")} ${currency}/h`
                            : ""}
                        </span>
                        {entry.amountSnapshot != null ? (
                          <span className="time-chip is-amount">
                            {entry.amountSnapshot.toLocaleString("de-DE", {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 2,
                            })}{" "}
                            {currency}
                          </span>
                        ) : null}
                        <span className={`time-chip ${entry.billable ? "is-ok" : "is-muted"}`}>
                          {entry.billable ? "Abrechenbar" : "Nicht abrechenbar"}
                        </span>
                        {entry.billable ? (
                          <button
                            type="button"
                            className={`time-chip time-billed-toggle ${entry.billed ? "is-billed" : "is-open"}`}
                            disabled={busyId === entry.id}
                            title={
                              entry.billed
                                ? "Als noch nicht abgerechnet markieren"
                                : "Als abgerechnet markieren"
                            }
                            onClick={() => void toggleBilled(entry)}
                          >
                            {entry.billed ? "Abgerechnet" : "Nicht abgerechnet"}
                          </button>
                        ) : null}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon"
                      aria-label="Eintrag löschen"
                      onClick={() => {
                        if (confirm("Zeiteintrag löschen?")) {
                          void api.deleteTimeEntry(entry.id).then(() => reload());
                        }
                      }}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden
                      >
                        <path
                          d="M5 7h14M10 7V5h4v2M8 7l.8 12h6.4L16 7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <Modal open={open} title="Zeit buchen" onClose={closeModal} className="modal-wide">
        <form className="form-grid time-form" onSubmit={createEntry}>
          <label className="field">
            <span>Datum *</span>
            <input
              type="date"
              required
              value={form.workDate}
              onChange={(e) => setForm({ ...form, workDate: e.target.value })}
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
            onChange={(billable) =>
              setForm({ ...form, billable, billed: billable ? form.billed : false })
            }
          />
          <Checkbox
            fieldLabel="Bereits abgerechnet"
            label={form.billed ? "Ja" : "Nein"}
            checked={form.billed}
            disabled={!form.billable}
            onChange={(billed) => setForm({ ...form, billed })}
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
          <div className="full form-actions modal-actions">
            <button className="btn btn-primary" type="submit" disabled={computedHours == null}>
              Stunden buchen
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
