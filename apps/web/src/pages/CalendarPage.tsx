import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { customerDisplayName } from "../lib/customer";
import {
  appointmentTouchesDate,
  buildMonthGrid,
  formatAppointmentTime,
  monthLabel,
  sameDay,
  toIsoDate,
} from "../lib/calendar";
import { appointmentKindLabel, formatDateOnly } from "../lib/labels";
import type { AppointmentItem, AppointmentKind, Customer } from "../types";

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
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm, customerId: presetCustomer });
  const [error, setError] = useState("");
  const [filterKind, setFilterKind] = useState<"" | AppointmentKind>("");

  const grid = useMemo(() => buildMonthGrid(month), [month]);
  const from = toIsoDate(grid[0]);
  const to = toIsoDate(grid[grid.length - 1]);

  async function reload() {
    const [list, c] = await Promise.all([
      api.appointments({ from, to }),
      api.customers(),
    ]);
    setAppointments(list);
    setCustomers(c);
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
        filtered.filter((a) => appointmentTouchesDate(a.startDate, a.endDate, iso)),
      );
    }
    return map;
  }, [grid, filtered]);

  const dayList = byDay.get(selected) ?? [];

  function shiftMonth(delta: number) {
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
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
      setForm({ ...emptyForm, startDate: selected, customerId: presetCustomer });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    }
  }

  const today = new Date();

  return (
    <div className="page calendar-page">
      <div className="page-header row-between">
        <div>
          <p className="eyebrow">Planung</p>
          <h2>Kalender</h2>
          <p>Kundentermine, interne und persönliche Termine.</p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setShowForm((v) => !v);
            setForm({
              ...emptyForm,
              startDate: selected,
              endDate: selected,
              customerId: presetCustomer,
            });
          }}
        >
          {showForm ? "Abbrechen" : "+ Termin"}
        </button>
      </div>

      {showForm ? (
        <form className="panel form-grid" onSubmit={createAppointment}>
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
            <select
              value={form.customerId}
              onChange={(e) =>
                setForm({
                  ...form,
                  customerId: e.target.value,
                  kind: e.target.value ? "customer" : form.kind === "customer" ? "other" : form.kind,
                })
              }
            >
              <option value="">Kein Kunde / allgemein</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {customerDisplayName(c)}
                </option>
              ))}
            </select>
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
          <div className="full">
            <button className="btn btn-primary" type="submit">
              Termin speichern
            </button>
          </div>
        </form>
      ) : null}

      <div className="calendar-toolbar">
        <div className="cta-row">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => shiftMonth(-1)}>
            ←
          </button>
          <strong className="calendar-month-label">{monthLabel(month)}</strong>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => shiftMonth(1)}>
            →
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
        <select
          value={filterKind}
          onChange={(e) => setFilterKind(e.target.value as "" | AppointmentKind)}
          aria-label="Filter Art"
        >
          <option value="">Alle Arten</option>
          {(Object.keys(appointmentKindLabel) as AppointmentKind[]).map((k) => (
            <option key={k} value={k}>
              {appointmentKindLabel[k]}
            </option>
          ))}
        </select>
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
              return (
                <button
                  key={iso}
                  type="button"
                  className={[
                    "calendar-day",
                    !inMonth ? "is-outside" : "",
                    isToday ? "is-today" : "",
                    isSelected ? "is-selected" : "",
                    items.length ? "has-events" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => setSelected(iso)}
                >
                  <span className="calendar-day-num">{day.getDate()}</span>
                  <span className="calendar-dots" aria-hidden="true">
                    {items.slice(0, 3).map((a) => (
                      <i key={a.id} className={`dot kind-${a.kind}`} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <section className="calendar-day-panel panel">
          <h3>{formatDateOnly(selected)}</h3>
          {dayList.length === 0 ? (
            <p className="empty">Keine Termine an diesem Tag.</p>
          ) : (
            <ul className="list">
              {dayList.map((a) => (
                <li key={a.id} className="list-row">
                  <div>
                    <strong>{a.title}</strong>
                    <span className="muted">
                      {formatAppointmentTime(a)} · {appointmentKindLabel[a.kind]}
                      {a.customerId
                        ? ` · ${a.customerCompany || a.customerName || "Kunde"}`
                        : ""}
                      {a.location ? ` · ${a.location}` : ""}
                    </span>
                    {a.description ? <span className="muted">{a.description}</span> : null}
                  </div>
                  <div className="cta-row">
                    {a.customerId ? (
                      <Link className="btn btn-ghost btn-sm" to={`/customers/${a.customerId}`}>
                        Kunde
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() =>
                        void api.deleteAppointment(a.id).then(() => reload())
                      }
                    >
                      Löschen
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
