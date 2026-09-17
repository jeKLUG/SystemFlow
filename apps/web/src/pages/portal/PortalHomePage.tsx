import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import type { PortalOverview } from "../../types";

/**
 * Portal-Start: offene Tickets und Freigaben.
 */
export function PortalHomePage() {
  const [data, setData] = useState<PortalOverview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void api
      .portalOverview()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Laden fehlgeschlagen"));
  }, []);

  if (!data && !error) return <p className="empty">Lade Portal…</p>;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Willkommen</p>
          <h2>{data?.customerName ?? "Kundenportal"}</h2>
        </div>
        <Link className="btn btn-primary" to="/portal/tickets?neu=1">
          Neues Ticket
        </Link>
      </header>
      {error ? <p className="form-error">{error}</p> : null}
      {data ? (
        <section className="stat-strip">
          <Link className="stat-chip" to="/portal/tickets?filter=open">
            <strong>{data.openTicketCount}</strong>
            <span>Offene Tickets</span>
          </Link>
          <Link className="stat-chip" to="/portal/tickets?filter=waiting">
            <strong>{data.waitingOnCustomer}</strong>
            <span>Wartet auf Sie</span>
          </Link>
          <Link className="stat-chip" to="/portal/contracts">
            <strong>{data.contractCount}</strong>
            <span>Verträge</span>
          </Link>
          <Link className="stat-chip" to="/portal/documents">
            <strong>{data.documentCount}</strong>
            <span>Dokumente</span>
          </Link>
          <Link className="stat-chip" to="/portal/assets">
            <strong>{data.assetCount}</strong>
            <span>Inventar</span>
          </Link>
        </section>
      ) : null}
      {data?.slaBreachedCount ? (
        <p className="badge badge-warn">SLA-Hinweis: {data.slaBreachedCount} Ticket(s) überfällig</p>
      ) : null}
    </div>
  );
}
