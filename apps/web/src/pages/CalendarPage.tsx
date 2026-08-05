import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { CustomerPicker } from "../components/CustomerPicker";
import {
  appointmentTouchesDate,
  buildMonthGrid,
  formatAppointmentTime,
  monthLabel,
  sameDay,
  toIsoDate,
} from "../lib/calendar";
import { appointmentKindLabel } from "../lib/labels";
import type { AppointmentItem, AppointmentKind } from "../types";

const weekdays = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

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

function selectedDayHeading(iso: string) {
  try {
    return new Intl.DateTimeFormat("de-DE", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(`${iso}T12:00:00`));
  } catch {
    return iso;
  }
}

/**
 * Monatskalender für Kunden- und allgemeine Termine.
 */
export function CalendarPage() {
  const [params] = useSearchParams();
  const presetCustomer = params.get("customerId") ?? "";
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selected, setSelected] = useState(toIsoDate(new Date()));
  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm, customerId: presetCustomer });
  const [error, setError] = useState("");
  const [filterKind, setFilterKind] = useState<"" | AppointmentKind>("");

  const grid = useMemo(() => buildMonthGrid(month), [month]);
  const from = toIsoDate(grid[0]);
  const to = toIsoDate(grid[grid.length - 1]);

  async function reload() {
    setAppointments(await api.appointments({ from, to }));
  }

  useEffect(() => {
    void reload().catch(() => setError("Kalender konnte nicht geladen werden"));
  }, [from, to]);

  const filtered = useMemo(() => {
    let rows = appointments;
    if (filterKind) rows = rows.filter((a) => a.kind === filterKind);
    if (presetCustomer) rows = rows.filter((a) => a.customerId === presetCustomer);
    return rows;
  }, [appointments, filterKind, presetCustomer]);

  const byDay = useMemo(() => {
    const map = new Map<string, AppointmentItem[]>();
    for (const day of grid) {
      const iso = toIsoDate(day);
      map.set(
        iso,
        filtered
          .filter((a) => appointmentTouchesDate(a.startDate, a.endDate, iso))
          .sort((a, b) => {
            if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
            return (a.startTime ?? "").localeCompare(b.startTime ?? "");
          }),
      );
    }
    return map;
  }, [grid, filtered]);

  const dayList = byDay.get(selected) ?? [];

  const monthCount = useMemo(() => {
    const start = toIsoDate(new Date(month.getFullYear(), month.getMonth(), 1));
    const end = toIsoDate(new Date(month.getFullYear(), month.getMonth() + 1, 0));
    return filtered.filter((a) => a.startDate <= end && (a.endDate || a.startDate) >= start)
      .length;
  }, [filtered, month]);

  const upcoming = useMemo(() => {
    const todayIso = toIsoDate(new Date());
    return filtered
      .filter((a) => (a.endDate || a.startDate) >= todayIso)
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || (a.startTime ?? "").localeCompare(b.startTime ?? ""))
      .slice(0, 5);
  }, [filtered]);

  function shiftMonth(delta: number) {
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  }

  function openNewForDay(iso: string) {
    setSelected(iso);
    setShowForm(true);
    setForm({
      ...emptyForm,
      startDate: iso,
      endDate: iso,
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
      setSelected(form.startDate);
      setForm({ ...emptyForm, startDate: form.startDate, customerId: presetCustomer });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    }
  }

  const today = new Date();

  return (
    <div className="page calendar-page">
      <header className="calendar-hero">
        <div>
          <p className="eyebrow">Planung</p>
          <h2>Kalender</h2>
          <p>
            {monthCount === 0
              ? "Noch keine Termine in diesem Monat."
              : `${monthCount} Termin${monthCount === 1 ? "" : "e"} in ${monthLabel(month)}.`}
            {presetCustomer ? " · gefiltert nach Kunde" : ""}
          </p>
        </div>
        <div className="calendar-hero-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => openNewForDay(selected)}
          >
            + Termin
          </button>
        </div>
      </header>

      {showForm ? (
        <form className="panel calendar-form form-grid" onSubmit={createAppointment}>
          <div className="full calendar-form-head">
            <h3>Neuer Termin</h3>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowForm(false)}>
              Schließen
            </button>
          </div>
          <label className="field">
            <span>Titel *</span>
            <input
              required
              autoFocus
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
          <label className="field checkbox-field">
            <span>Ganztägig</span>
            <label className="inline-check">
              <input
                type="checkbox"
                checked={form.allDay}
                onChange={(e) => setForm({ ...form, allDay: e.target.checked })}
              />
              Ja
            </label>
          </label>
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
          <div className="full cta-row">
            <button className="btn btn-primary" type="submit">
              Speichern
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>
              Abbrechen
            </button>
          </div>
        </form>
      ) : null}

      <div className="calendar-toolbar panel">
        <div className="calendar-nav">
          <button
            type="button"
            className="btn btn-ghost calendar-nav-btn"
            onClick={() => shiftMonth(-1)}
            aria-label="Vorheriger Monat"
          >
            ‹
          </button>
          <div className="calendar-month-block">
            <strong className="calendar-month-label">{monthLabel(month)}</strong>
            <span className="muted">{monthCount} Termine</span>
          </div>
          <button
            type="button"
            className="btn btn-ghost calendar-nav-btn"
            onClick={() => shiftMonth(1)}
            aria-label="Nächster Monat"
          >
            ›
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              const n = new Date();
              setMonth(new Date(n.getFullYear(), n.getMonth(), 1));
              setSelected(toIsoDate(n));
            }}
          >
            Heute
          </button>
        </div>

        <div className="calendar-filters">
          <div className="calendar-legend" aria-hidden="true">
            {(Object.keys(appointmentKindLabel) as AppointmentKind[]).map((k) => (
              <button
                key={k}
                type="button"
                className={`legend-chip kind-${k}${filterKind === k ? " is-active" : ""}`}
                onClick={() => setFilterKind((cur) => (cur === k ? "" : k))}
              >
                <i className={`dot kind-${k}`} />
                {appointmentKindLabel[k]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="calendar-layout">
        <div className="calendar-grid panel">
          <div className="calendar-weekdays">
            {weekdays.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="calendar-days">
            {grid.map((day) => {
              const iso = toIsoDate(day);
              const items = byDay.get(iso) ?? [];
              const inMonth = day.getMonth() === month.getMonth();
              const isToday = sameDay(day, today);
              const isSelected = iso === selected;
              const isWeekend = day.getDay() === 0 || day.getDay() === 6;
              return (
                <button
                  key={iso}
                  type="button"
                  className={[
                    "calendar-day",
                    !inMonth ? "is-outside" : "",
                    isToday ? "is-today" : "",
                    isSelected ? "is-selected" : "",
                    isWeekend ? "is-weekend" : "",
                    items.length ? "has-events" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => setSelected(iso)}
                  onDoubleClick={() => openNewForDay(iso)}
                >
                  <span className="calendar-day-top">
                    <span className="calendar-day-num">{day.getDate()}</span>
                    {items.length > 0 ? (
                      <span className="calendar-day-count">{items.length}</span>
                    ) : null}
                  </span>
                  <span className="calendar-day-events">
                    {items.slice(0, 2).map((a) => (
                      <span key={a.id} className={`cal-chip kind-${a.kind}`} title={a.title}>
                        <span className="cal-chip-time">
                          {a.allDay || !a.startTime ? "Tag" : a.startTime}
                        </span>
                        <span className="cal-chip-title">{a.title}</span>
                      </span>
                    ))}
                    {items.length > 2 ? (
                      <span className="cal-chip-more">+{items.length - 2} weitere</span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="calendar-hint muted">Doppelklick auf einen Tag → neuer Termin</p>
        </div>

        <aside className="calendar-side">
          <section className="calendar-day-panel panel">
            <div className="calendar-day-panel-head">
              <div>
                <p className="eyebrow">Ausgewählt</p>
                <h3>{selectedDayHeading(selected)}</h3>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => openNewForDay(selected)}
              >
                + Am Tag
              </button>
            </div>

            {dayList.length === 0 ? (
              <div className="calendar-empty">
                <p>Keine Termine</p>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => openNewForDay(selected)}
                >
                  Termin anlegen
                </button>
              </div>
            ) : (
              <ul className="calendar-agenda">
                {dayList.map((a) => (
                  <li key={a.id} className={`agenda-item kind-${a.kind}`}>
                    <div className="agenda-time">{formatAppointmentTime(a)}</div>
                    <div className="agenda-body">
                      <strong>{a.title}</strong>
                      <span className="muted">
                        {appointmentKindLabel[a.kind]}
                        {a.customerId
                          ? ` · ${a.customerCompany || a.customerName || "Kunde"}`
                          : ""}
                        {a.location ? ` · ${a.location}` : ""}
                      </span>
                      {a.description ? <p className="agenda-note">{a.description}</p> : null}
                      <div className="agenda-actions">
                        {a.customerId ? (
                          <Link className="btn btn-ghost btn-sm" to={`/customers/${a.customerId}`}>
                            Zum Kunden
                          </Link>
                        ) : null}
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => void api.deleteAppointment(a.id).then(() => reload())}
                        >
                          Löschen
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {upcoming.length > 0 ? (
            <section className="calendar-upcoming panel">
              <h3>Als Nächstes</h3>
              <ul className="upcoming-list">
                {upcoming.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      className="upcoming-row"
                      onClick={() => {
                        setSelected(a.startDate);
                        const d = new Date(`${a.startDate}T12:00:00`);
                        setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
                      }}
                    >
                      <span className={`upcoming-kind kind-${a.kind}`} />
                      <span>
                        <strong>{a.title}</strong>
                        <span className="muted">
                          {a.startDate.slice(8)}.
                          {a.startDate.slice(5, 7)}. · {formatAppointmentTime(a)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
