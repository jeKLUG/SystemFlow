import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { documentTypeLabel, formatDate } from "../lib/labels";
import type { RecentDocument, Stats } from "../types";

export function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<RecentDocument[]>([]);

  useEffect(() => {
    void Promise.all([api.stats(), api.recentDocuments()]).then(([s, r]) => {
      setStats(s);
      setRecent(r);
    });
  }, []);

  return (
    <div className="page">
      <section className="hero-block">
        <p className="brand-hero">Systemhaus-Ess</p>
        <h1>Dein Überblick für Kunden und Dokumentation.</h1>
        <p className="lede">
          Verwalte Stammdaten, schreibe Protokolle und halte Wissen fest – Rechnungen bleiben in Lexware.
        </p>
        <div className="cta-row">
          <Link className="btn btn-primary" to="/customers">
            Kunden öffnen
          </Link>
          <Link className="btn btn-ghost" to="/customers?new=1">
            Kunde anlegen
          </Link>
        </div>
      </section>

      <section className="stats-row" aria-label="Kennzahlen">
        <div className="stat">
          <strong>{stats?.customerCount ?? "–"}</strong>
          <span>Kunden gesamt</span>
        </div>
        <div className="stat">
          <strong>{stats?.activeCount ?? "–"}</strong>
          <span>Aktiv</span>
        </div>
        <div className="stat">
          <strong>{recent.length}</strong>
          <span>Zuletzt bearbeitet</span>
        </div>
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
