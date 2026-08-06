import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { customerDisplayName } from "../lib/customer";
import { assetKindLabel, formatDateOnly } from "../lib/labels";
import type { Reminders } from "../types";

export function RemindersPage() {
  const [days, setDays] = useState(90);
  const [data, setData] = useState<Reminders | null>(null);

  useEffect(() => {
    void api.reminders(days).then(setData);
  }, [days]);

  return (
    <div className="page">
      <div className="section-head row-between">
        <div>
          <h2>Ablauf & Erinnerungen</h2>
          <p>Garantien, Vertragsenden und fällige Aufgaben.</p>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          aria-label="Zeitraum"
        >
          <option value={30}>30 Tage</option>
          <option value={90}>90 Tage</option>
          <option value={180}>180 Tage</option>
        </select>
      </div>

      <section className="section">
        <h2>Garantien</h2>
        {!data?.warranties.length ? (
          <p className="empty">Keine ablaufenden Garantien.</p>
        ) : (
          <ul className="list">
            {data.warranties.map((w) => (
              <li key={w.id}>
                <Link className="list-row" to={`/customers/${w.customerId}`}>
                  <div>
                    <strong>{w.name}</strong>
                    <span className="muted">
                      {customerDisplayName({
                        name: w.customerName,
                        company: w.customerCompany,
                      })}{" "}
                      · {assetKindLabel[w.kind]}
                    </span>
                  </div>
                  <span className="badge badge-warn">{formatDateOnly(w.warrantyUntil)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <h2>Verträge</h2>
        {!data?.contracts.length ? (
          <p className="empty">Keine auslaufenden Verträge.</p>
        ) : (
          <ul className="list">
            {data.contracts.map((c) => (
              <li key={c.id}>
                <Link className="list-row" to={`/customers/${c.customerId}`}>
                  <div>
                    <strong>{c.title}</strong>
                    <span className="muted">
                      {customerDisplayName({
                        name: c.customerName,
                        company: c.customerCompany,
                      })}
                      {c.slaResponseHours ? ` · SLA ${c.slaResponseHours}h` : ""}
                    </span>
                  </div>
                  <span className="badge badge-warn">{formatDateOnly(c.endDate)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <h2>Fällige Aufgaben</h2>
        {!data?.tasks.length ? (
          <p className="empty">Keine fälligen Aufgaben im Zeitraum.</p>
        ) : (
          <ul className="list">
            {data.tasks.map((t) => (
              <li key={t.id}>
                <Link className="list-row" to={`/customers/${t.customerId}/tasks`}>
                  <div>
                    <strong>{t.title}</strong>
                    <span className="muted">
                      {customerDisplayName({
                        name: t.customerName,
                        company: t.customerCompany,
                      })}
                    </span>
                  </div>
                  <span className="badge badge-warn">{formatDateOnly(t.dueDate)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
