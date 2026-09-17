import { useEffect, useState } from "react";
import { api } from "../../api";
import { contractStatusLabel, formatDateOnly, formatSlaHours } from "../../lib/labels";
import type { ContractItem } from "../../types";

/**
 * Für den Kunden freigegebene Verträge/SLA (ohne interne Notizen).
 */
export function PortalContractsPage() {
  const [rows, setRows] = useState<ContractItem[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void api
      .portalContracts()
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : "Laden fehlgeschlagen"));
  }, []);

  return (
    <div className="page">
      <header className="page-head">
        <h2>Verträge & SLA</h2>
      </header>
      {error ? <p className="form-error">{error}</p> : null}
      {rows.length === 0 ? (
        <p className="empty panel">Keine aktiven Verträge im Portal.</p>
      ) : (
        <div className="docs-wiki-board">
          {rows.map((c) => (
            <article key={c.id} className="panel">
              <h3>{c.title}</h3>
              <p className="muted">
                {contractStatusLabel[c.status]}
                {c.contractNumber ? ` · ${c.contractNumber}` : ""}
                {c.endDate ? ` · bis ${formatDateOnly(c.endDate)}` : ""}
              </p>
              {c.coverageHours ? <p>Servicezeiten: {c.coverageHours}</p> : null}
              {c.includedHoursMonth != null ? <p>Enthaltene Stunden/Monat: {c.includedHoursMonth}</p> : null}
              <p>
                Reaktion normal: {formatSlaHours(c.responseNormalHours ?? c.slaResponseHours)} · kritisch:{" "}
                {formatSlaHours(c.responseCriticalHours)}
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
