import { ticketSlaViews, type SlaView } from "../lib/tickets";
import type { TicketItem } from "../types";

type Props = {
  ticket: TicketItem;
  now?: number;
  compact?: boolean;
};

/**
 * SLA-Uhren: Restzeit für Reaktion und Lösung.
 */
export function TicketSlaClocks({ ticket, now, compact = false }: Props) {
  const views = ticketSlaViews(ticket, new Date(now ?? Date.now()));
  return (
    <div className={`ticket-sla-clocks${compact ? " is-compact" : ""}`}>
      <SlaClock view={views.response} compact={compact} />
      <SlaClock view={views.resolve} compact={compact} />
    </div>
  );
}

function SlaClock({ view, compact }: { view: SlaView; compact: boolean }) {
  if (compact) {
    return (
      <span className={`sla-pill is-${view.tone}`} title={`${view.title}: ${view.headline} · ${view.detail}`}>
        <em>{view.title}</em>
        <strong>{view.headline}</strong>
      </span>
    );
  }

  return (
    <article className={`sla-clock is-${view.tone}`}>
      <p className="sla-clock-kicker">{view.title}</p>
      <p className="sla-clock-headline">{view.headline}</p>
      <p className="sla-clock-detail">{view.detail}</p>
      {view.percent != null ? (
        <div className="sla-clock-bar" aria-hidden>
          <span style={{ width: `${view.percent}%` }} />
        </div>
      ) : null}
    </article>
  );
}
