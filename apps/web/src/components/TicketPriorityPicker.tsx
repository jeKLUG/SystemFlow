import { formatSlaHours, portalTicketPriorityHint, ticketPriorityLabel } from "../lib/labels";
import { contractSlaHours } from "../lib/tickets";
import type { ContractItem, TicketPriority } from "../types";

const PRIORITIES: TicketPriority[] = ["low", "normal", "high", "critical"];

/**
 * Kompakte Prioritätswahl; zeigt SLA-Zeiten, wenn der Vertrag sie hinterlegt.
 */
export function TicketPriorityPicker({
  value,
  onChange,
  contract,
  legend = "Wie dringend ist es?",
}: {
  value: TicketPriority;
  onChange: (priority: TicketPriority) => void;
  contract?: ContractItem | null;
  legend?: string;
}) {
  return (
    <fieldset className="field ticket-prio-picker">
      <legend>{legend}</legend>
      <div className="ticket-prio-grid" role="radiogroup" aria-label={legend}>
        {PRIORITIES.map((priority) => {
          const sla = contractSlaHours(contract, priority);
          const hasSla = sla.responseHours != null || sla.resolveHours != null;
          return (
            <button
              key={priority}
              type="button"
              role="radio"
              aria-checked={value === priority}
              className={`ticket-prio-chip is-${priority}${value === priority ? " is-active" : ""}`}
              onClick={() => onChange(priority)}
            >
              <strong>{ticketPriorityLabel[priority]}</strong>
              <span className="ticket-prio-hint">{portalTicketPriorityHint[priority]}</span>
              {hasSla ? (
                <span className="ticket-prio-sla">
                  {sla.responseHours != null ? <span>Reaktion {formatSlaHours(sla.responseHours)}</span> : null}
                  {sla.resolveHours != null ? <span>Lösung {formatSlaHours(sla.resolveHours)}</span> : null}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
