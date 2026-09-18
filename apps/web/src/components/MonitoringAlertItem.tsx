import { Link } from "react-router-dom";
import { monitoringIssueLabel } from "../lib/monitoringUi";
import type { MonitoringIssueTicket } from "../types";

/**
 * Eine Meldung oder Warnung in der Monitoring-Übersicht.
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
  kindLabel: string;
  tone: "warn" | "off" | "info";
  chips?: string[];
  seen?: string;
  tickets?: MonitoringIssueTicket[];
  href?: string;
}) {
  const main = (
    <>
      <span
        className={`mon-dot${tone === "warn" ? " is-warn" : tone === "off" ? " is-off" : " is-info"}`}
        aria-hidden
      />
      <div className="mon-alert-item-copy">
        <span className="mon-alert-item-kind">{kindLabel}</span>
        <strong>{title}</strong>
        {subtitle ? <p className="muted">{subtitle}</p> : null}
      </div>
      {chips?.length ? (
        <div className="mon-alert-item-chips">
          {chips.map((label) => (
            <span key={label} className={`mon-issue-chip${tone === "warn" ? "" : ` is-${tone}`}`}>
              {label}
            </span>
          ))}
        </div>
      ) : null}
      {seen ? <span className="mon-alert-item-seen">{seen}</span> : null}
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
            <Link key={t.ticketId} className="mon-warn-ticket" to={`/tickets/${t.ticketId}`}>
              {t.ticketNumber}
              <span>{t.diskId ?? monitoringIssueLabel[t.kind]}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </article>
  );
}
