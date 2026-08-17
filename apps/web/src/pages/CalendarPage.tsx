import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { withOfflineFallback } from "../lib/offlineCache";
import { Checkbox } from "../components/Checkbox";
import { CustomerPicker } from "../components/CustomerPicker";
import { Modal } from "../components/Modal";
import {
  appointmentTouchesDate,
  buildMonthGrid,
  buildWeekDays,
  dayLabel,
  formatAppointmentTime,
  formatHour,
  fromIsoDate,
  hourLabels,
  monthLabel,
  sameDay,
  timedEventLayout,
  toIsoDate,
  weekLabel,
} from "../lib/calendar";
import { appointmentKindLabel } from "../lib/labels";
import type { AppointmentItem, AppointmentKind } from "../types";

const MONTH_EVENT_LIMIT = 2;

type CalView = "month" | "week" | "day";

const weekdays = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const DAY_START = 7;
const DAY_END = 20;
const HOURS = hourLabels(DAY_START, DAY_END);

const emptyForm = {
  title: "",
  kind: "customer" as AppointmentKind,
  customerId: "",
  startDate: toIsoDate(new Date()),
  startTime: "09:00",
  endDate: "",
  endTime: "10:00",
  allDay: false,
  location: "",
  description: "",
};

function sortDayItems(items: AppointmentItem[]) {
  return [...items].sort((a, b) => {
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    return (a.startTime ?? "").localeCompare(b.startTime ?? "");
  });
}

/**
 * Vollflächen-Kalender mit Monats-, Wochen- und Tagesansicht.
 */
export function CalendarPage() {
  const [params] = useSearchParams();
  const presetCustomer = params.get("customerId") ?? "";
  const [view, setView] = useState<CalView>("month");
  const [anchor, setAnchor] = useState(() => new Date());
  const [selected, setSelected] = useState(toIsoDate(new Date()));
  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm, customerId: presetCustomer });
  const [error, setError] = useState("");
  const [filterKind, setFilterKind] = useState<"" | AppointmentKind>("");
  const [activeId, setActiveId] = useState<string | null>(null);

  const monthGrid = useMemo(() => buildMonthGrid(anchor), [anchor]);
  const weekDays = useMemo(() => buildWeekDays(fromIsoDate(selected)), [selected]);

  const range = useMemo(() => {
    if (view === "month") {
      return { from: toIsoDate(monthGrid[0]!), to: toIsoDate(monthGrid[monthGrid.length - 1]!) };
    }
    if (view === "week") {
      return { from: toIsoDate(weekDays[0]!), to: toIsoDate(weekDays[6]!) };
    }
    return { from: selected, to: selected };
  }, [view, monthGrid, weekDays, selected]);

  async function reload() {
    const { data } = await withOfflineFallback(
      `appointments:${range.from}:${range.to}`,
      () => api.appointments({ from: range.from, to: range.to }),
    );
    setAppointments(data);
  }

  useEffect(() => {
    void reload().catch(() => setError("Kalender konnte nicht geladen werden"));
  }, [range.from, range.to]);

  const filtered = useMemo(() => {
    let rows = appointments;
    if (filterKind) rows = rows.filter((a) => a.kind === filterKind);
    if (presetCustomer) rows = rows.filter((a) => a.customerId === presetCustomer);
    return rows;
  }, [appointments, filterKind, presetCustomer]);

  const itemsForDay = (iso: string) =>
    sortDayItems(
      filtered.filter((a) => appointmentTouchesDate(a.startDate, a.endDate, iso)),
    );

  const selectedItems = itemsForDay(selected);
  const active = filtered.find((a) => a.id === activeId) ?? null;

  const periodCount = useMemo(() => {
    return filtered.filter(
      (a) => a.startDate <= range.to && (a.endDate || a.startDate) >= range.from,
    ).length;
  }, [filtered, range]);

  const heading = useMemo(() => {
    if (view === "month") return monthLabel(anchor);
    if (view === "week") return weekLabel(fromIsoDate(selected));
    return dayLabel(selected);
  }, [view, anchor, selected]);

  function goToday() {
    const n = new Date();
    setAnchor(n);
    setSelected(toIsoDate(n));
  }

  function shift(delta: number) {
    if (view === "month") {
      setAnchor((a) => {
        const next = new Date(a.getFullYear(), a.getMonth() + delta, 1);
        setSelected(toIsoDate(next));
        return next;
      });
      return;
    }
    if (view === "week") {
      const d = fromIsoDate(selected);
      d.setDate(d.getDate() + delta * 7);
      setSelected(toIsoDate(d));
      setAnchor(d);
      return;
    }
    const d = fromIsoDate(selected);
    d.setDate(d.getDate() + delta);
    setSelected(toIsoDate(d));
    setAnchor(d);
  }

  function selectDay(iso: string) {
    if (iso === selected && view === "month") {
      setView("day");
      setActiveId(null);
      return;
    }
    setSelected(iso);
    setAnchor(fromIsoDate(iso));
    setActiveId(null);
  }

  function openNew(iso = selected, time?: string) {
    setSelected(iso);
    setShowForm(true);
    setActiveId(null);
    setForm({
      ...emptyForm,
      startDate: iso,
      endDate: iso,
      startTime: time ?? "09:00",
      endTime: time
        ? `${String(Math.min(23, Number(time.slice(0, 2)) + 1)).padStart(2, "0")}:00`
        : "10:00",
      customerId: presetCustomer,
    });
  }

  async function createAppointment(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const kind: AppointmentKind = form.customerId ? "customer" : form.kind;
      if (kind === "customer" && !form.customerId) {
        setError("Kundentermin braucht einen Kunden.");
        return;
      }
      await api.createAppointment({
        title: form.title,
        kind,
        customerId: form.customerId || null,
        startDate: form.startDate,
        startTime: form.allDay ? null : form.startTime,
        endDate: form.endDate || form.startDate,
        endTime: form.allDay ? null : form.endTime,
        allDay: form.allDay,
        location: form.location,
        description: form.description,
      });
      setShowForm(false);
      selectDay(form.startDate);
      setForm({ ...emptyForm, startDate: form.startDate, customerId: presetCustomer });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    }
  }

  const today = new Date();

  function renderEventCard(a: AppointmentItem, compact = false) {
    return (
      <button
        key={a.id}
        type="button"
        className={`cal-event kind-${a.kind}${activeId === a.id ? " is-active" : ""}${compact ? " is-compact" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          setActiveId(a.id);
          selectDay(a.startDate);
        }}
        title={`${a.title} · ${formatAppointmentTime(a)}`}
      >
        <span className="cal-event-time">
          {a.allDay || !a.startTime ? "Tag" : a.startTime}
        </span>
        <span className="cal-event-title">{a.title}</span>
      </button>
    );
  }

  function renderTimedLane(iso: string) {
    const items = itemsForDay(iso);
    const allDay = items.filter((a) => a.allDay || !a.startTime);
    const timed = items.filter((a) => !a.allDay && a.startTime);
    return (
      <div className="cal-lane" style={{ "--hours": HOURS.length } as CSSProperties}>
        {allDay.length > 0 ? (
          <div className="cal-allday">
            {allDay.map((a) => renderEventCard(a, true))}
          </div>
        ) : (
          <div className="cal-allday is-empty" />
        )}
        <div
          className="cal-timed"
          onDoubleClick={(e) => {
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            const y = e.clientY - rect.top;
            const ratio = Math.max(0, Math.min(1, y / rect.height));
            const minutes = DAY_START * 60 + Math.round((ratio * (DAY_END - DAY_START) * 60) / 30) * 30;
            const h = Math.floor(minutes / 60);
            const m = minutes % 60;
            openNew(iso, `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
          }}
        >
          {HOURS.map((h) => (
            <div key={h} className="cal-hour-line" />
          ))}
          {timed.map((a) => {
            const layout = timedEventLayout(a, DAY_START, DAY_END);
            if (!layout) return null;
            return (
              <button
                key={a.id}
                type="button"
                className={`cal-block kind-${a.kind}${activeId === a.id ? " is-active" : ""}`}
                style={{ top: `${layout.top}%`, height: `${layout.height}%` }}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveId(a.id);
                  selectDay(iso);
                }}
              >
                <strong>{a.title}</strong>
                <span>{formatAppointmentTime(a)}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="page calendar-page">
      <header className="calendar-topbar anim-fade-up">
        <div className="calendar-topbar-main">
          <div>
            <p className="eyebrow">Planung</p>
            <h2>Kalender</h2>
            <p>
              {periodCount === 0
                ? "Keine Termine in diesem Zeitraum."
                : `${periodCount} Termin${periodCount === 1 ? "" : "e"} · ${heading}`}
              {presetCustomer ? " · gefiltert nach Kunde" : ""}
            </p>
          </div>
        </div>

        <div className="calendar-controls">
          <div className="calendar-controls-left">
            <div className="calendar-view-switch" role="tablist" aria-label="Ansicht">
              {(
                [
                  ["month", "Monat"],
                  ["week", "Woche"],
                  ["day", "Tag"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={view === key}
                  className={`cal-seg ${view === key ? "is-active" : ""}`}
                  onClick={() => setView(key)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="calendar-nav">
              <div className="calendar-period" key={heading}>
                <strong className="anim-period">{heading}</strong>
              </div>
              <div className="calendar-nav-actions">
                <button
                  type="button"
                  className="btn btn-ghost calendar-nav-btn"
                  onClick={() => shift(-1)}
                  aria-label="Zurück"
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="btn btn-ghost calendar-nav-btn"
                  onClick={() => shift(1)}
                  aria-label="Weiter"
                >
                  ›
                </button>
                <button type="button" className="btn btn-ghost btn-sm cal-today-btn" onClick={goToday}>
                  Heute
                </button>
              </div>
            </div>
          </div>

          <div className="calendar-legend" aria-label="Terminarten">
            {(Object.keys(appointmentKindLabel) as AppointmentKind[]).map((k) => (
              <button
                key={k}
                type="button"
                className={`legend-chip kind-${k}${filterKind === k ? " is-active" : ""}`}
                onClick={() => setFilterKind((cur) => (cur === k ? "" : k))}
              >
                <i className={`dot kind-${k}`} />
                <span>{appointmentKindLabel[k]}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <button
        type="button"
        className="calendar-fab"
        onClick={() => openNew()}
        aria-label="Neuen Termin anlegen"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
      </button>

      {error && !showForm ? <p className="form-error">{error}</p> : null}

      <Modal
        open={showForm}
        title="Neuer Termin"
        onClose={() => setShowForm(false)}
        className="modal-wide"
      >
        <form className="form-grid calendar-form" onSubmit={createAppointment}>
          <label className="field">
            <span>Titel *</span>
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="z. B. Wartung vor Ort"
            />
          </label>
          <label className="field">
            <span>Art</span>
            <select
              value={form.customerId ? "customer" : form.kind}
              onChange={(e) => {
                const kind = e.target.value as AppointmentKind;
                setForm({
                  ...form,
                  kind,
                  customerId: kind === "customer" ? form.customerId || presetCustomer : "",
                });
              }}
            >
              {(Object.keys(appointmentKindLabel) as AppointmentKind[]).map((k) => (
                <option key={k} value={k}>
                  {appointmentKindLabel[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Kunde</span>
            <CustomerPicker
              value={form.customerId}
              onChange={(customerId) =>
                setForm({
                  ...form,
                  customerId,
                  kind: customerId ? "customer" : form.kind === "customer" ? "other" : form.kind,
                })
              }
              allowEmpty
              emptyLabel="Kein Kunde / allgemein"
              placeholder="Kunde suchen…"
            />
          </label>
          <Checkbox
            fieldLabel="Ganztägig"
            label={form.allDay ? "Ja" : "Nein"}
            checked={form.allDay}
            onChange={(allDay) => setForm({ ...form, allDay })}
          />
          <label className="field">
            <span>Datum *</span>
            <input
              type="date"
              required
              value={form.startDate}
              onChange={(e) =>
                setForm({
                  ...form,
                  startDate: e.target.value,
                  endDate: form.endDate || e.target.value,
                })
              }
            />
          </label>
          <label className="field">
            <span>Bis-Datum</span>
            <input
              type="date"
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            />
          </label>
          {!form.allDay ? (
            <>
              <label className="field">
                <span>Von</span>
                <input
                  type="time"
                  value={form.startTime}
                  onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Bis</span>
                <input
                  type="time"
                  value={form.endTime}
                  onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                />
              </label>
            </>
          ) : null}
          <label className="field">
            <span>Ort</span>
            <input
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="Standort / Remote"
            />
          </label>
          <label className="field full">
            <span>Notiz</span>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          {error ? <p className="form-error full">{error}</p> : null}
          <div className="full form-actions">
            <button className="btn btn-primary" type="submit">
              Termin speichern
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>
              Abbrechen
            </button>
          </div>
        </form>
      </Modal>

      <section className="calendar-day-panel panel anim-fade-up delay-1" key={selected}>
        <div className="calendar-day-panel-head">
          <div>
            <p className="eyebrow">Tagesübersicht</p>
            <h3>{dayLabel(selected)}</h3>
          </div>
          <div className="calendar-day-panel-meta">
            <span className="cal-day-count-pill">
              {selectedItems.length === 0
                ? "Keine Termine"
                : `${selectedItems.length} Termin${selectedItems.length === 1 ? "" : "e"}`}
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm calendar-day-add"
              onClick={() => openNew(selected)}
            >
              + Termin
            </button>
          </div>
        </div>

        {active ? (
          <article className={`agenda-item kind-${active.kind} is-detail`}>
            <div className="agenda-time">{formatAppointmentTime(active)}</div>
            <div className="agenda-body">
              <strong>{active.title}</strong>
              <span className="muted">
                {appointmentKindLabel[active.kind]}
                {active.customerId
                  ? ` · ${active.customerCompany || active.customerName || "Kunde"}`
                  : ""}
                {active.location ? ` · ${active.location}` : ""}
              </span>
              {active.description ? <p className="agenda-note">{active.description}</p> : null}
              <div className="agenda-actions">
                {active.customerId ? (
                  <Link className="btn btn-ghost btn-sm" to={`/customers/${active.customerId}`}>
                    Zum Kunden
                  </Link>
                ) : null}
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() =>
                    void api.deleteAppointment(active.id).then(() => {
                      setActiveId(null);
                      void reload();
                    })
                  }
                >
                  Löschen
                </button>
              </div>
            </div>
          </article>
        ) : null}

        {selectedItems.length === 0 ? (
          <div className="calendar-empty">
            <div className="calendar-empty-icon" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                <rect x="4" y="5" width="16" height="15" rx="2" />
                <path d="M8 3v4M16 3v4M4 10h16" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <p>Keine Termine an diesem Tag</p>
              <span className="muted">Tippe „+ Termin“ oder den Button unten rechts.</span>
            </div>
          </div>
        ) : (
          <ul className="calendar-agenda calendar-agenda-top">
            {selectedItems.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  className={`agenda-item kind-${a.kind}${activeId === a.id ? " is-active" : ""}`}
                  onClick={() => setActiveId(a.id)}
                >
                  <div className="agenda-time">{formatAppointmentTime(a)}</div>
                  <div className="agenda-body">
                    <strong>{a.title}</strong>
                    <span className="muted">
                      {appointmentKindLabel[a.kind]}
                      {a.customerId ? ` · ${a.customerCompany || a.customerName || "Kunde"}` : ""}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="calendar-stage anim-fade-up delay-2">
        <div className="calendar-main panel" key={view}>
          {view === "month" ? (
            <>
              <div className="calendar-weekdays">
                {weekdays.map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>
              <div className="calendar-days calendar-days-month">
                {monthGrid.map((day, index) => {
                  const iso = toIsoDate(day);
                  const items = itemsForDay(iso);
                  const inMonth = day.getMonth() === anchor.getMonth();
                  const isToday = sameDay(day, today);
                  const isSelected = iso === selected;
                  return (
                    <div
                      key={iso}
                      role="button"
                      tabIndex={0}
                      style={{ "--stagger": String(Math.min(index, 20)) } as CSSProperties}
                      className={[
                        "calendar-day",
                        "anim-day",
                        !inMonth ? "is-outside" : "",
                        isToday ? "is-today" : "",
                        isSelected ? "is-selected" : "",
                        items.length ? "has-events" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => selectDay(iso)}
                      onDoubleClick={() => openNew(iso)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          selectDay(iso);
                        }
                      }}
                    >
                      <span className="calendar-day-top">
                        <span className="calendar-day-num">{day.getDate()}</span>
                        {items.length > 0 ? (
                          <span className="calendar-day-count">{items.length}</span>
                        ) : null}
                      </span>
                      <span className="calendar-day-dots" aria-hidden>
                        {items.slice(0, 4).map((a) => (
                          <i key={a.id} className={`dot kind-${a.kind}`} />
                        ))}
                      </span>
                      <span className="calendar-day-events">
                        {items.slice(0, MONTH_EVENT_LIMIT).map((a) => renderEventCard(a, true))}
                        {items.length > MONTH_EVENT_LIMIT ? (
                          <span className="cal-chip-more">+{items.length - MONTH_EVENT_LIMIT}</span>
                        ) : null}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}

          {view === "week" ? (
            <>
              <div className="cal-week cal-week-desktop">
                <div className="cal-week-head">
                  <span className="cal-gutter-spacer" />
                  {weekDays.map((day) => {
                    const iso = toIsoDate(day);
                    return (
                      <button
                        key={iso}
                        type="button"
                        className={`cal-week-dayhead${iso === selected ? " is-selected" : ""}${sameDay(day, today) ? " is-today" : ""}`}
                        onClick={() => selectDay(iso)}
                      >
                        <span>{weekdays[(day.getDay() + 6) % 7]}</span>
                        <strong>{day.getDate()}</strong>
                      </button>
                    );
                  })}
                </div>
                <div className="cal-week-body" style={{ "--hours": HOURS.length } as CSSProperties}>
                  <div className="cal-gutter">
                    <div className="cal-allday-label">Tag</div>
                    <div className="cal-hour-labels">
                      {HOURS.map((h) => (
                        <span key={h}>{formatHour(h)}</span>
                      ))}
                    </div>
                  </div>
                  {weekDays.map((day) => (
                    <div key={toIsoDate(day)} className="cal-week-col">
                      {renderTimedLane(toIsoDate(day))}
                    </div>
                  ))}
                </div>
              </div>

              <div className="cal-week-mobile">
                <div className="cal-week-strip" role="tablist" aria-label="Wochentage">
                  {weekDays.map((day) => {
                    const iso = toIsoDate(day);
                    const count = itemsForDay(iso).length;
                    return (
                      <button
                        key={iso}
                        type="button"
                        role="tab"
                        aria-selected={iso === selected}
                        className={`cal-week-strip-day${iso === selected ? " is-selected" : ""}${sameDay(day, today) ? " is-today" : ""}`}
                        onClick={() => selectDay(iso)}
                      >
                        <span>{weekdays[(day.getDay() + 6) % 7]}</span>
                        <strong>{day.getDate()}</strong>
                        {count > 0 ? <em>{count}</em> : null}
                      </button>
                    );
                  })}
                </div>
                <div className="cal-day-view-body" style={{ "--hours": HOURS.length } as CSSProperties}>
                  <div className="cal-gutter">
                    <div className="cal-allday-label">Tag</div>
                    <div className="cal-hour-labels">
                      {HOURS.map((h) => (
                        <span key={h}>{formatHour(h)}</span>
                      ))}
                    </div>
                  </div>
                  <div className="cal-day-col">{renderTimedLane(selected)}</div>
                </div>
              </div>
            </>
          ) : null}

          {view === "day" ? (
            <div className="cal-day-view">
              <div className="cal-day-view-body" style={{ "--hours": HOURS.length } as CSSProperties}>
                <div className="cal-gutter">
                  <div className="cal-allday-label">Tag</div>
                  <div className="cal-hour-labels">
                    {HOURS.map((h) => (
                      <span key={h}>{formatHour(h)}</span>
                    ))}
                  </div>
                </div>
                <div className="cal-day-col">{renderTimedLane(selected)}</div>
              </div>
            </div>
          ) : null}

          <p className="calendar-hint muted">
            <span className="calendar-hint-desktop">
              Doppelklick oder „+ Termin“ → neuer Termin · Klick auf Termin für Details
            </span>
            <span className="calendar-hint-mobile">
              Tag tippen · nochmal tippen für Tagesansicht · Termin öffnet Details
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
