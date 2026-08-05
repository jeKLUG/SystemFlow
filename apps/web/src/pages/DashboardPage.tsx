import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { customerDisplayName } from "../lib/customer";
import { documentTypeLabel, formatDate, formatDateOnly } from "../lib/labels";
import type { RecentDocument, Reminders, Stats, TaskItem } from "../types";

/**
 * SaaS-Startseite mit Kennzahlen und Schnellzugriffen.
 */
export function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<RecentDocument[]>([]);
  const [openTasks, setOpenTasks] = useState<TaskItem[]>([]);
  const [reminders, setReminders] = useState<Reminders | null>(null);

  useEffect(() => {
    void Promise.all([
      api.stats(),
      api.recentDocuments(),
      api.openTasks(),
      api.reminders(30),
    ]).then(([s, r, t, rem]) => {
      setStats(s);
      setRecent(r);
      setOpenTasks(t.slice(0, 6));
      setReminders(rem);
    });
  }, []);

  const reminderCount =
    (reminders?.warranties.length ?? 0) +
    (reminders?.contracts.length ?? 0) +
    (reminders?.tasks.length ?? 0);

  return (
    <div className="page dashboard-page">
      <header className="page-header dashboard-header">
        <div>
          <p className="eyebrow">Workspace</p>
          <h2>Guten Überblick behalten</h2>
          <p>Kunden, Aufgaben und Dokumentation – bereit für den IT-Alltag.</p>
        </div>
        <div className="page-actions">
          <Link className="btn btn-ghost" to="/customers">
            Kunden
          </Link>
          <Link className="btn btn-primary" to="/quick-note">
            + Schnellnotiz
          </Link>
        </div>
      </header>

      <section className="stats-row stats-row-4" aria-label="Kennzahlen">
        <Link className="stat" to="/customers">
          <span className="stat-label">Kunden</span>
          <strong>{stats?.customerCount ?? "–"}</strong>
          <span className="stat-meta">Gesamt im Bestand</span>
        </Link>
        <div className="stat">
          <span className="stat-label">Aktiv</span>
          <strong>{stats?.activeCount ?? "–"}</strong>
          <span className="stat-meta">Betreute Mandanten</span>
        </div>
        <Link className="stat" to="/reminders">
          <span className="stat-label">Aufgaben</span>
          <strong>{openTasks.length}</strong>
          <span className="stat-meta">Offen systemweit</span>
        </Link>
        <Link className="stat" to="/reminders">
          <span className="stat-label">Abläufe</span>
          <strong>{reminderCount}</strong>
          <span className="stat-meta">Nächste 30 Tage</span>
        </Link>
      </section>

      <section className="dash-actions">
        <Link className="dash-action" to="/customers?new=1">
          <strong>Kunde anlegen</strong>
          <span>Stammdaten & Kontakt</span>
        </Link>
        <Link className="dash-action" to="/calendar">
          <strong>Kalender öffnen</strong>
          <span>Termine & Einsätze</span>
        </Link>
        <Link className="dash-action" to="/vault">
          <strong>Tresor</strong>
          <span>Zugänge & Secrets</span>
        </Link>
        <Link className="dash-action" to="/search">
          <strong>Suche</strong>
          <span>Geräte, Docs, Historie</span>
        </Link>
      </section>

      <div className="dash-grid">
        <section className="panel dash-panel">
          <div className="section-head row-between">
            <div>
              <h2>Offene Aufgaben</h2>
              <p>Was als Nächstes ansteht.</p>
            </div>
            <Link className="btn btn-ghost btn-sm" to="/reminders">
              Alle
            </Link>
          </div>
          {openTasks.length === 0 ? (
            <p className="empty">Keine offenen Aufgaben.</p>
          ) : (
            <ul className="list">
              {openTasks.map((task) => (
                <li key={task.id}>
                  <Link className="list-row" to={`/customers/${task.customerId}/ops`}>
                    <div>
                      <strong>{task.title}</strong>
                      <span className="muted">
                        {customerDisplayName({
                          name: task.customerName ?? "",
                          company: task.customerCompany ?? null,
                        })}
                      </span>
                    </div>
                    <span className="badge badge-warn">{formatDateOnly(task.dueDate)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel dash-panel">
          <div className="section-head row-between">
            <div>
              <h2>Zuletzt bearbeitet</h2>
              <p>Dokumente und Notizen.</p>
            </div>
            <Link className="btn btn-ghost btn-sm" to="/customers">
              Kunden
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="empty">Noch keine Dokumente. Starte mit einer Schnellnotiz.</p>
          ) : (
            <ul className="list">
              {recent.map((doc) => (
                <li key={doc.id}>
                  <Link className="list-row" to={`/documents/${doc.id}`}>
                    <div>
                      <strong>{doc.title}</strong>
                      <span className="muted">
                        {doc.customerName} · {documentTypeLabel[doc.type]}
                      </span>
                    </div>
                    <time className="muted">{formatDate(doc.updatedAt)}</time>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
