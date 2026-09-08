import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../api";
import { DeleteIcon, EditIcon } from "../../components/Icons";
import { Modal } from "../../components/Modal";
import { addMinutesToTime, localNowTime, localTodayIso, parseDateOnly } from "../../lib/dates";
import { formatDateOnly } from "../../lib/labels";
import { formatHours, hoursFromRange } from "../../lib/time";
import type { PriceItem, ProjectItem, TimeEntryItem } from "../../types";

type FormLine = {
  key: string;
  priceItemId: string;
  quantity: string;
};

type FormState = {
  workDate: string;
  startTime: string;
  endTime: string;
  hoursOverride: string;
  description: string;
  projectId: string;
  lines: FormLine[];
  billable: boolean;
  billed: boolean;
};

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

/** Laufender Stempeluhr-Eintrag (Start ohne Ende). */
function isRunningEntry(entry: TimeEntryItem): boolean {
  return Boolean(entry.startTime && !entry.endTime);
}

function emptyForm(): FormState {
  return {
    workDate: localTodayIso(),
    startTime: "09:00",
    endTime: "10:00",
    hoursOverride: "",
    description: "",
    projectId: "",
    lines: [],
    billable: true,
    billed: false,
  };
}

function newLineKey() {
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const kindShort: Record<string, string> = {
  hourly: "Stunde",
  fixed: "Pauschale",
  unit: "Stück",
};

/**
 * Zeiterfassung: Stempeluhr, Historie, manuelle Buchung und Bearbeitung.
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
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [clockBusy, setClockBusy] = useState(false);
  const [clockNote, setClockNote] = useState("");
  const [clockProjectId, setClockProjectId] = useState("");
  const [elapsedLabel, setElapsedLabel] = useState("0min");
  const [form, setForm] = useState<FormState>(emptyForm);

  const computedHours = useMemo(() => {
    if (form.hoursOverride.trim()) {
      const n = Number(form.hoursOverride.replace(",", "."));
      return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
    }
    return hoursFromRange(form.startTime, form.endTime);
  }, [form.startTime, form.endTime, form.hoursOverride]);

  const catalogPrices = useMemo(
    () => priceItems.filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name, "de")),
    [priceItems],
  );

  const running = useMemo(() => entries.find(isRunningEntry) ?? null, [entries]);

  async function reload() {
    const [time, allForClock, p, prices, org] = await Promise.all([
      api.timeEntries(id, filterProject ? { projectId: filterProject } : undefined),
      filterProject ? api.timeEntries(id) : Promise.resolve(null),
      api.projects(id),
      api.priceItems({ activeOnly: true }),
      api.orgSettings(),
    ]);
    const clockSource = allForClock ?? time;
    const open = clockSource.entries.find(isRunningEntry);
    const merged =
      open && !time.entries.some((e) => e.id === open.id)
        ? [open, ...time.entries]
        : time.entries;
    setEntries(merged);
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

  useEffect(() => {
    if (!running?.startTime) {
      setElapsedLabel("0min");
      return;
    }
    const tick = () => {
      const hours = hoursFromRange(running.startTime!, localNowTime());
      setElapsedLabel(hours != null ? formatHours(hours) : "…");
    };
    tick();
    const timer = window.setInterval(tick, 15_000);
    return () => window.clearInterval(timer);
  }, [running?.id, running?.startTime]);

  const finishedEntries = useMemo(
    () => entries.filter((e) => !isRunningEntry(e)),
    [entries],
  );

  const byMonth = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of finishedEntries) {
      const key = e.workDate.slice(0, 7);
      map.set(key, (map.get(key) ?? 0) + Number(e.hours));
    }
    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 6);
  }, [finishedEntries]);

  const groups = useMemo(() => {
    const map = new Map<string, TimeEntryItem[]>();
    for (const e of finishedEntries) {
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
  }, [finishedEntries]);

  const monthGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        label: string;
        hours: number;
        days: typeof groups;
      }
    >();
    for (const day of groups) {
      const key = day.date.slice(0, 7);
      const bucket = map.get(key);
      if (bucket) {
        bucket.days.push(day);
        bucket.hours += day.hours;
      } else {
        map.set(key, {
          key,
          label: monthLabel(key),
          hours: day.hours,
          days: [day],
        });
      }
    }
    return [...map.values()].map((m) => ({
      ...m,
      hours: Math.round(m.hours * 100) / 100,
    }));
  }, [groups]);

  function openCreate() {
    setError("");
    setEditingId(null);
    setForm({
      ...emptyForm(),
      startTime: localNowTime(),
      endTime: addMinutesToTime(localNowTime(), 60),
      projectId: clockProjectId,
    });
    setModalMode("create");
  }

  function openEdit(entry: TimeEntryItem) {
    setError("");
    setEditingId(entry.id);
    const entryLines = entry.lines?.length
      ? entry.lines.map((l) => ({
          key: l.id,
          priceItemId: l.priceItemId,
          quantity: String(l.quantity).replace(".", ","),
        }))
      : entry.priceItemId
        ? [
            {
              key: newLineKey(),
              priceItemId: entry.priceItemId,
              quantity: String(entry.hours).replace(".", ","),
            },
          ]
        : [];
    setForm({
      workDate: entry.workDate,
      startTime: entry.startTime || "09:00",
      endTime: entry.endTime || addMinutesToTime(entry.startTime || "09:00", 60),
      hoursOverride:
        entry.startTime && entry.endTime ? "" : String(entry.hours).replace(".", ","),
      description: entry.description || "",
      projectId: entry.projectId || "",
      lines: entryLines,
      billable: entry.billable,
      billed: entry.billed,
    });
    setModalMode("edit");
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
    setModalMode(null);
    setEditingId(null);
    setError("");
  }

  async function clockIn() {
    setClockBusy(true);
    setError("");
    try {
      await api.timeClockIn(id, {
        startTime: localNowTime(),
        workDate: localTodayIso(),
        projectId: clockProjectId || null,
        description: clockNote.trim() || undefined,
      });
      setClockNote("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Einstempeln fehlgeschlagen");
    } finally {
      setClockBusy(false);
    }
  }

  async function clockOut() {
    setClockBusy(true);
    setError("");
    try {
      await api.timeClockOut(id, {
        endTime: localNowTime(),
        description: clockNote.trim() || undefined,
        entryId: running?.id,
      });
      setClockNote("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ausstempeln fehlgeschlagen");
    } finally {
      setClockBusy(false);
    }
  }

  async function saveEntry(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (computedHours == null) {
      setError("Bitte gültige Zeiten oder Stunden angeben.");
      return;
    }

    const hoursOnly = Boolean(form.hoursOverride.trim());
    const linesPayload = form.lines
      .filter((l) => l.priceItemId)
      .map((l) => {
        const qty = Number(l.quantity.replace(",", "."));
        return {
          priceItemId: l.priceItemId,
          ...(Number.isFinite(qty) && qty > 0 ? { quantity: Math.round(qty * 100) / 100 } : {}),
        };
      });
    const payload: Record<string, unknown> = {
      workDate: form.workDate,
      description: form.description,
      projectId: form.projectId || null,
      lines: linesPayload,
      billable: form.billable,
      billed: form.billed,
    };

    if (hoursOnly) {
      payload.hours = computedHours;
      payload.startTime = null;
      payload.endTime = null;
    } else {
      payload.startTime = form.startTime;
      payload.endTime = form.endTime;
    }

    try {
      if (modalMode === "edit" && editingId) {
        await api.updateTimeEntry(editingId, payload);
      } else {
        await api.createTimeEntry(id, payload);
        setForm((f) => ({
          ...f,
          startTime: hoursOnly ? f.startTime : f.endTime,
          endTime: hoursOnly ? f.endTime : addMinutesToTime(f.endTime, 60),
          description: "",
          hoursOverride: "",
          billed: false,
        }));
      }
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
          <h2>Zeiterfassung</h2>
        </div>

        <div className={`time-clock${running ? " is-running" : ""}`}>
          <div className="time-clock-main">
            {running ? (
              <>
                <p className="time-clock-status">Eingestempelt seit {running.startTime}</p>
                <p className="time-clock-elapsed">{elapsedLabel}</p>
                <p className="muted time-clock-hint">
                  {running.description || "Kein Hinweis hinterlegt"} ·{" "}
                  {running.projectName || "Ohne Projekt"}
                </p>
              </>
            ) : (
              <>
                <p className="time-clock-status">Stempeluhr</p>
              </>
            )}
          </div>
          <div className="time-clock-controls">
            {!running ? (
              <>
                <label className="field time-clock-field">
                  <span>Projekt</span>
                  <select
                    value={clockProjectId}
                    onChange={(e) => setClockProjectId(e.target.value)}
                  >
                    <option value="">Kein Projekt</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field time-clock-field">
                  <span>Notiz (optional)</span>
                  <input
                    value={clockNote}
                    onChange={(e) => setClockNote(e.target.value)}
                    placeholder="z. B. Vor-Ort-Termin"
                  />
                </label>
                <div className="time-clock-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={clockBusy}
                    onClick={() => void clockIn()}
                  >
                    Einstempeln
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon-lg"
                    onClick={openCreate}
                    aria-label="Zeit manuell buchen"
                    title="Zeit manuell buchen"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <circle cx="12" cy="12" r="8" />
                      <path d="M12 8v4l2.5 1.5M12 5v1" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </>
            ) : (
              <>
                <label className="field time-clock-field">
                  <span>Notiz beim Ausstempeln</span>
                  <input
                    value={clockNote}
                    onChange={(e) => setClockNote(e.target.value)}
                    placeholder={running.description || "Was wurde gemacht?"}
                  />
                </label>
                <div className="time-clock-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={clockBusy}
                    onClick={() => void clockOut()}
                  >
                    Ausstempeln
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon-lg"
                    onClick={openCreate}
                    aria-label="Zeit manuell buchen"
                    title="Zeit manuell buchen"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <circle cx="12" cy="12" r="8" />
                      <path d="M12 8v4l2.5 1.5M12 5v1" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {error && !modalMode ? <p className="form-error">{error}</p> : null}

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
            <p className="muted">
              Stempeluhr starten oder die erste Zeit manuell über das Uhr-Icon buchen.
            </p>
          </div>
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            Zeit buchen
          </button>
        </div>
      ) : (
        <div className="time-history">
          <p className="time-history-count muted">
            {finishedEntries.length}{" "}
            {finishedEntries.length === 1 ? "Eintrag" : "Einträge"}
            {filterProject ? " im Filter" : ""}
          </p>
          {monthGroups.map((month) => (
            <section key={month.key} className="time-month">
              <header className="time-month-head">
                <h3>{month.label}</h3>
                <span>
                  {formatHours(month.hours)}
                  <em>
                    · {month.days.reduce((n, d) => n + d.items.length, 0)}{" "}
                    {month.days.reduce((n, d) => n + d.items.length, 0) === 1
                      ? "Buchung"
                      : "Buchungen"}
                  </em>
                </span>
              </header>
              {month.days.map((group) => (
                <section key={group.date} className="time-day">
                  <div className="time-day-head">
                    <h4>{group.label}</h4>
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
                          <div className="time-entry-top">
                            <strong className="time-entry-title">
                              {entry.description || "Ohne Beschreibung"}
                            </strong>
                            {entry.amountSnapshot != null ? (
                              <span className="time-entry-amount">
                                {entry.amountSnapshot.toLocaleString("de-DE", {
                                  minimumFractionDigits: 0,
                                  maximumFractionDigits: 2,
                                })}{" "}
                                {currency}
                              </span>
                            ) : null}
                          </div>
                          <div className="time-entry-meta">
                            <span className="time-meta-text">
                              {[
                                entry.projectName || "Ohne Projekt",
                                entry.lines && entry.lines.length > 0
                                  ? entry.lines
                                      .map((l) =>
                                        entry.lines!.length > 1
                                          ? `${l.nameSnapshot} (${l.quantity})`
                                          : `${l.nameSnapshot}${
                                              l.kindSnapshot === "hourly" && l.unitPriceSnapshot
                                                ? ` · ${l.unitPriceSnapshot.toLocaleString("de-DE")} ${currency}/h`
                                                : ""
                                            }`,
                                      )
                                      .join(", ")
                                  : entry.priceItemName
                                    ? `${entry.priceItemName}${
                                        entry.rateSnapshot != null
                                          ? ` · ${entry.rateSnapshot.toLocaleString("de-DE")} ${currency}/h`
                                          : ""
                                      }`
                                    : entry.rateSnapshot != null
                                      ? `Standard · ${entry.rateSnapshot.toLocaleString("de-DE")} ${currency}/h`
                                      : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                            {!entry.billable ? (
                              <span className="time-status is-muted">Nicht abrechenbar</span>
                            ) : (
                              <button
                                type="button"
                                className={`time-status time-billed-toggle ${entry.billed ? "is-billed" : "is-open"}`}
                                disabled={busyId === entry.id}
                                title={
                                  entry.billed
                                    ? "Als noch nicht abgerechnet markieren"
                                    : "Als abgerechnet markieren"
                                }
                                onClick={() => void toggleBilled(entry)}
                              >
                                {entry.billed ? "Abgerechnet" : "Offen"}
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="time-entry-actions">
                          <button
                            type="button"
                            className="btn btn-ghost btn-icon"
                            aria-label="Eintrag bearbeiten"
                            title="Bearbeiten"
                            onClick={() => openEdit(entry)}
                          >
                            <EditIcon />
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-icon"
                            aria-label="Eintrag löschen"
                            title="Löschen"
                            onClick={() => {
                              if (confirm("Zeiteintrag löschen?")) {
                                void api.deleteTimeEntry(entry.id).then(() => reload());
                              }
                            }}
                          >
                            <DeleteIcon />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </section>
          ))}
        </div>
      )}

      <Modal
        open={modalMode != null}
        title={modalMode === "edit" ? "Zeit anpassen" : "Zeit buchen"}
        onClose={closeModal}
        showCloseButton={false}
        className="modal-wide"
      >
        <form className="form-grid time-form" onSubmit={saveEntry}>
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
            <span>Von{form.hoursOverride.trim() ? "" : " *"}</span>
            <input
              type="time"
              required={!form.hoursOverride.trim()}
              disabled={Boolean(form.hoursOverride.trim())}
              value={form.startTime}
              onChange={(e) => setForm({ ...form, startTime: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Bis{form.hoursOverride.trim() ? "" : " *"}</span>
            <input
              type="time"
              required={!form.hoursOverride.trim()}
              disabled={Boolean(form.hoursOverride.trim())}
              value={form.endTime}
              onChange={(e) => setForm({ ...form, endTime: e.target.value })}
            />
          </label>
          <label className="field full">
            <span>Stunden manuell (ersetzt Von/Bis)</span>
            <input
              inputMode="decimal"
              value={form.hoursOverride}
              onChange={(e) => setForm({ ...form, hoursOverride: e.target.value })}
              placeholder="z. B. 1,5 – leer lassen für Von/Bis"
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
                  {p.hourlyRate != null ? ` · ${p.hourlyRate} ${currency}/h` : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="field full time-catalog">
            <div className="time-catalog-head">
              <span>Leistungen aus Katalog</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={catalogPrices.length === 0}
                onClick={() => {
                  const first = catalogPrices[0];
                  if (!first) return;
                  const qty =
                    first.kind === "hourly" && computedHours != null
                      ? String(computedHours).replace(".", ",")
                      : "1";
                  setForm({
                    ...form,
                    lines: [
                      ...form.lines,
                      { key: newLineKey(), priceItemId: first.id, quantity: qty },
                    ],
                  });
                }}
              >
                + Position
              </button>
            </div>
            {form.lines.length === 0 ? (
              <p className="muted time-catalog-empty">
                Keine Katalog-Positionen – es gilt der Standard-/Projekt-Stundensatz für die
                gebuchten Stunden.
              </p>
            ) : (
              <ul className="time-catalog-lines">
                {form.lines.map((line, index) => {
                  const item = catalogPrices.find((p) => p.id === line.priceItemId);
                  return (
                    <li key={line.key} className="time-catalog-line">
                      <select
                        value={line.priceItemId}
                        aria-label={`Position ${index + 1}`}
                        onChange={(e) => {
                          const nextId = e.target.value;
                          const nextItem = catalogPrices.find((p) => p.id === nextId);
                          const nextLines = form.lines.map((l, i) => {
                            if (i !== index) return l;
                            const qty =
                              nextItem?.kind === "hourly" && computedHours != null
                                ? String(computedHours).replace(".", ",")
                                : l.quantity || "1";
                            return { ...l, priceItemId: nextId, quantity: qty };
                          });
                          setForm({ ...form, lines: nextLines });
                        }}
                      >
                        {catalogPrices.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} · {kindShort[p.kind] ?? p.kind} ·{" "}
                            {p.unitPrice.toLocaleString("de-DE")} {currency}
                            {p.unitLabel ? `/${p.unitLabel}` : ""}
                          </option>
                        ))}
                      </select>
                      <input
                        inputMode="decimal"
                        value={line.quantity}
                        aria-label={`Menge Position ${index + 1}`}
                        title={
                          item?.kind === "hourly"
                            ? "Stunden"
                            : item?.kind === "fixed"
                              ? "Anzahl Pauschalen"
                              : "Menge"
                        }
                        onChange={(e) => {
                          const nextLines = form.lines.map((l, i) =>
                            i === index ? { ...l, quantity: e.target.value } : l,
                          );
                          setForm({ ...form, lines: nextLines });
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        aria-label="Position entfernen"
                        onClick={() =>
                          setForm({
                            ...form,
                            lines: form.lines.filter((_, i) => i !== index),
                          })
                        }
                      >
                        Entfernen
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <label className="field">
            <span>Abrechenbar</span>
            <select
              value={form.billable ? "yes" : "no"}
              onChange={(e) => {
                const billable = e.target.value === "yes";
                setForm({ ...form, billable, billed: billable ? form.billed : false });
              }}
            >
              <option value="yes">Ja</option>
              <option value="no">Nein</option>
            </select>
          </label>
          <label className="field">
            <span>Bereits abgerechnet</span>
            <select
              value={form.billed ? "yes" : "no"}
              disabled={!form.billable}
              onChange={(e) => setForm({ ...form, billed: e.target.value === "yes" })}
            >
              <option value="yes">Ja</option>
              <option value="no">Nein</option>
            </select>
          </label>
          <label className="field full">
            <span>Beschreibung</span>
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Was wurde gemacht?"
            />
          </label>
          {error && modalMode ? <p className="form-error full">{error}</p> : null}
          <div className="full form-actions modal-actions">
            <button className="btn btn-primary" type="submit" disabled={computedHours == null}>
              {modalMode === "edit" ? "Änderungen speichern" : "Stunden buchen"}
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
