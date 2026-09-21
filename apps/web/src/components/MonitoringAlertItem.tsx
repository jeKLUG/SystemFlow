import { Link } from "react-router-dom";
import { monitoringIssueLabel } from "../lib/monitoringUi";
import type { MonitoringIssueTicket } from "../types";

/**
 * Eine Meldung in der Monitoring-Übersicht: Gerät, Ursache, Ticket, Zeitpunkt.
 */
export function MonitoringAlertItem({
  title,
  subtitle,
  kindLabel,
  tone,
  chips,
  seen,
  tickets,
  href,
}: {
  title: string;
  subtitle?: string | null;
  kindLabel?: string;
  tone: "warn" | "off" | "info";
  chips?: string[];
  seen?: string;
  tickets?: MonitoringIssueTicket[];
  href?: string;
}) {
  const showKind = Boolean(kindLabel && kindLabel !== "Warnung");
  const main = (
    <>
      <span
        className={`mon-dot${tone === "warn" ? " is-warn" : tone === "off" ? " is-off" : " is-info"}`}
        aria-hidden
      />
      <div className="mon-alert-item-copy">
        <strong>{title}</strong>
        {subtitle ? <span className="muted">{subtitle}</span> : null}
      </div>
      {showKind ? <span className={`mon-alert-item-kind is-${tone}`}>{kindLabel}</span> : null}
      {chips?.length ? (
        <div className="mon-alert-item-chips">
          {chips.map((label) => (
            <span key={label} className={`mon-issue-chip${tone === "warn" ? "" : ` is-${tone}`}`}>
              {label}
            </span>
          ))}
        </div>
      ) : null}
    </>
  );

  return (
    <article className={`mon-alert-item is-${tone}`}>
      {href ? (
        <Link className="mon-alert-item-main" to={href}>
          {main}
        </Link>
      ) : (
        <div className="mon-alert-item-main">{main}</div>
      )}
      {tickets?.length ? (
        <div className="mon-alert-item-tickets">
          {tickets.map((t) => (
            <Link
              key={t.ticketId}
              className="mon-warn-ticket"
              to={`/tickets/${t.ticketId}`}
              title={t.diskId ?? monitoringIssueLabel[t.kind]}
            >
              {t.ticketNumber}
            </Link>
          ))}
        </div>
      ) : null}
      {seen ? <span className="mon-alert-item-seen">{seen}</span> : null}
    </article>
  );
}
