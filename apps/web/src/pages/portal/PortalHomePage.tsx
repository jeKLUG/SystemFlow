import { useMemo, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { ChartLegend, ColumnChart, DonutChart, HBarChart } from "../../components/DashCharts";
import {
  formatDate,
  portalTicketStatusLabel,
  ticketPriorityLabel,
} from "../../lib/labels";
import type { PortalOverview, TicketPriority, TicketStatus } from "../../types";

const STATUS_COLOR: Record<TicketStatus, string> = {
  open: "#60a5fa",
  in_progress: "#818cf8",
  waiting_customer: "#c4b5fd",
  resolved: "#34d399",
  closed: "#64748b",
};

const PRIORITY_COLOR: Record<TicketPriority, string> = {
  low: "#94a3b8",
  normal: "#60a5fa",
  high: "#fb923c",
  critical: "#f87171",
};

const STATUS_ORDER: TicketStatus[] = ["open", "in_progress", "waiting_customer", "resolved", "closed"];
const PRIORITY_ORDER: TicketPriority[] = ["critical", "high", "normal", "low"];

/**
 * Portal-Start: Kennzahlen und Diagramme zu Tickets und Freigaben.
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

  const statusSlices = useMemo(() => {
    const map = data?.ticketsByStatus;
    if (!map) return [];
    return STATUS_ORDER.map((status) => ({
      label: portalTicketStatusLabel[status],
      value: map[status] ?? 0,
      color: STATUS_COLOR[status],
    })).filter((s) => s.value > 0);
  }, [data]);

  const prioritySlices = useMemo(() => {
    const map = data?.ticketsByPriority;
    if (!map) return [];
    return PRIORITY_ORDER.map((priority) => ({
      label: ticketPriorityLabel[priority],
      value: map[priority] ?? 0,
      color: PRIORITY_COLOR[priority],
    })).filter((s) => s.value > 0);
  }, [data]);

  const weekColumns = useMemo(() => {
    const days = data?.ticketsWeek ?? [];
    return days.map((day, index) => {
      const date = new Date(`${day.date}T12:00:00`);
      const label = new Intl.DateTimeFormat("de-DE", { weekday: "short" }).format(date);
      return {
        label,
        value: day.count,
        active: index === days.length - 1,
        tone: day.count > 0 ? "linear-gradient(180deg, #93c5fd, #3b82f6)" : undefined,
      };
    });
  }, [data]);

  const stockBars = useMemo(() => {
    if (!data) return [];
    return [
      { label: "Verträge", value: data.contractCount, color: "#34d399", href: "/portal/contracts" },
      { label: "Seiten", value: data.wikiCount ?? 0, color: "#818cf8", href: "/portal/documents" },
      { label: "Dateien", value: data.fileCount ?? Math.max(0, data.documentCount - (data.wikiCount ?? 0)), color: "#60a5fa", href: "/portal/documents?tab=files" },
      { label: "Inventar", value: data.assetCount, color: "#fb923c", href: "/portal/assets" },
    ];
  }, [data]);

  const ticketTotal = statusSlices.reduce((sum, s) => sum + s.value, 0);

  if (!data && !error) return <p className="empty">Lade Portal…</p>;

  return (
    <div className="page portal-dash">
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
      {data?.slaBreachedCount ? (
        <p className="portal-dash-sla">
          {data.slaBreachedCount} Ticket{data.slaBreachedCount === 1 ? "" : "s"} über der SLA-Zeit – wir kümmern uns.
        </p>
      ) : null}

      {data ? (
        <>
          <section className="dash-kpis dash-kpis-compact portal-dash-kpis" aria-label="Kennzahlen">
            <Link className="dash-kpi" to="/portal/tickets?filter=open">
              <span className="dash-kpi-label">Offen</span>
              <strong>{data.openTicketCount}</strong>
              <span className="dash-kpi-meta">Tickets</span>
            </Link>
            <Link className={`dash-kpi${data.waitingOnCustomer ? " is-warn" : ""}`} to="/portal/tickets?filter=waiting">
              <span className="dash-kpi-label">Ihre Rückmeldung</span>
              <strong>{data.waitingOnCustomer}</strong>
              <span className="dash-kpi-meta">wartet</span>
            </Link>
            <Link className="dash-kpi" to="/portal/contracts">
              <span className="dash-kpi-label">Verträge</span>
              <strong>{data.contractCount}</strong>
              <span className="dash-kpi-meta">aktiv</span>
            </Link>
            <Link className="dash-kpi" to="/portal/documents">
              <span className="dash-kpi-label">Dokumente</span>
              <strong>{data.documentCount}</strong>
              <span className="dash-kpi-meta">Seiten & Dateien</span>
            </Link>
            <Link className="dash-kpi" to="/portal/assets">
              <span className="dash-kpi-label">Inventar</span>
              <strong>{data.assetCount}</strong>
              <span className="dash-kpi-meta">Geräte</span>
            </Link>
          </section>

          <section className="dash-analytics dash-analytics-compact portal-dash-charts" aria-label="Diagramme">
            <article className="panel dash-chart-card">
              <div className="dash-chart-head">
                <div>
                  <h3>Tickets</h3>
                  <p className="muted">Status aller Anfragen</p>
                </div>
                <Link className="btn btn-ghost btn-sm" to="/portal/tickets">
                  Öffnen
                </Link>
              </div>
              {ticketTotal === 0 ? (
                <p className="empty">Noch keine Tickets.</p>
              ) : (
                <div className="dash-chart-body is-split">
                  <DonutChart
                    slices={statusSlices}
                    size={108}
                    thickness={8}
                    centerValue={ticketTotal}
                    centerLabel="gesamt"
                  />
                  <ChartLegend slices={statusSlices} />
                </div>
              )}
            </article>

            <article className="panel dash-chart-card">
              <div className="dash-chart-head">
                <div>
                  <h3>Diese Woche</h3>
                  <p className="muted">Neue Tickets · 7 Tage</p>
                </div>
              </div>
              <ColumnChart columns={weekColumns} />
            </article>

            <article className="panel dash-chart-card">
              <div className="dash-chart-head">
                <div>
                  <h3>Laufend</h3>
                  <p className="muted">Priorität offener Tickets</p>
                </div>
              </div>
              {prioritySlices.length === 0 ? (
                <p className="empty">Keine offenen Tickets.</p>
              ) : (
                <div className="dash-chart-body is-split">
                  <DonutChart
                    slices={prioritySlices}
                    size={108}
                    thickness={8}
                    centerValue={data.openTicketCount}
                    centerLabel="offen"
                  />
                  <ChartLegend slices={prioritySlices} />
                </div>
              )}
            </article>

            <article className="panel dash-chart-card">
              <div className="dash-chart-head">
                <div>
                  <h3>Freigaben</h3>
                  <p className="muted">Was Sie einsehen können</p>
                </div>
              </div>
              <HBarChart items={stockBars} />
            </article>
          </section>

          {(data.recentTickets ?? []).length ? (
            <section className="panel portal-dash-recent">
              <div className="dash-chart-head">
                <div>
                  <h3>Zuletzt aktualisiert</h3>
                  <p className="muted">Ihre neuesten Tickets</p>
                </div>
                <Link className="btn btn-ghost btn-sm" to="/portal/tickets">
                  Alle
                </Link>
              </div>
              <ul className="portal-dash-ticket-list">
                {data.recentTickets!.map((ticket) => (
                  <li key={ticket.id}>
                    <Link to={`/portal/tickets/${ticket.id}`}>
                      <div className="portal-ticket-card-head">
                        <span className="portal-ticket-num">{ticket.number}</span>
                        <span className={`badge badge-ticket-${ticket.status}`}>
                          {portalTicketStatusLabel[ticket.status]}
                        </span>
                      </div>
                      <strong>{ticket.title}</strong>
                      <dl className="portal-ticket-facts">
                        <div>
                          <dt>Priorität</dt>
                          <dd>{ticketPriorityLabel[ticket.priority]}</dd>
                        </div>
                        <div>
                          <dt>Aktualisiert</dt>
                          <dd>{formatDate(ticket.updatedAt)}</dd>
                        </div>
                      </dl>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
