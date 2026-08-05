import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { customerDisplayName } from "../lib/customer";
import { documentTypeLabel, formatDate, formatDateOnly } from "../lib/labels";
import type { RecentDocument, Reminders, Stats, TaskItem } from "../types";

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
    <div className="page">
      <section className="hero-block">
        <p className="brand-hero">Systemhaus-Ess</p>
        <h1>Dein Überblick für Kunden und Dokumentation.</h1>
        <p className="lede">
          Verwalte Stammdaten, schreibe Protokolle und halte Wissen fest – Rechnungen bleiben in Lexware.
        </p>
        <div className="cta-row">
          <Link className="btn btn-primary btn-xl" to="/quick-note">
            + Schnellnotiz
          </Link>
          <Link className="btn btn-ghost" to="/customers">
            Kunden öffnen
          </Link>
          <Link className="btn btn-ghost" to="/reminders">
            Ablauf prüfen
          </Link>
        </div>
      </section>

      <section className="stats-row stats-row-4" aria-label="Kennzahlen">
        <div className="stat">
          <strong>{stats?.customerCount ?? "–"}</strong>
          <span>Kunden</span>
        </div>
        <div className="stat">
          <strong>{stats?.activeCount ?? "–"}</strong>
          <span>Aktiv</span>
        </div>
        <div className="stat">
          <strong>{openTasks.length}</strong>
          <span>Offene Aufgaben</span>
        </div>
        <div className="stat">
          <strong>{reminderCount}</strong>
          <span>Abläufe (30 Tage)</span>
        </div>
      </section>

      <section className="section">
        <div className="section-head row-between">
          <div>
            <h2>Offene Aufgaben</h2>
            <p>Was noch erledigt werden muss.</p>
          </div>
        </div>
        {openTasks.length === 0 ? (
          <p className="empty">Keine offenen Aufgaben.</p>
        ) : (
          <ul className="list">
            {openTasks.map((task) => (
              <li key={task.id}>
                <Link className="list-row" to={`/customers/${task.customerId}`}>
                  <div>
                    <strong>{task.title}</strong>
                    <span className="muted">
                      {customerDisplayName({
                        name: task.customerName ?? "",
                        company: task.customerCompany ?? null,
                      })}
                    </span>
                  </div>
                  <span className="muted">{formatDateOnly(task.dueDate)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Zuletzt bearbeitet</h2>
          <p>Schnell zurück zu offenen Notizen und Dokumentationen.</p>
        </div>
        {recent.length === 0 ? (
          <p className="empty">Noch keine Dokumente. Lege einen Kunden an und starte eine Notiz.</p>
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
  );
}
