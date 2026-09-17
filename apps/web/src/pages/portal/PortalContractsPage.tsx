import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { DocumentEditor } from "../../components/DocumentEditor";
import { contractStatusLabel, formatDateOnly, formatSlaHours } from "../../lib/labels";
import type { ContractItem, ContractStatus } from "../../types";

const EMPTY_DOC = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] });

function formatSlaMoney(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "–";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(value);
}

function toEditorContent(raw: string | null | undefined): string {
  const t = raw?.trim();
  if (!t) return EMPTY_DOC;
  try {
    const parsed = JSON.parse(t) as { type?: string };
    if (parsed?.type === "doc") return t;
  } catch {
    /* plain text */
  }
  return JSON.stringify({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: t }] }],
  });
}

function walkTipTapText(nodes: unknown[]): string {
  const parts: string[] = [];
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const n = node as { type?: string; text?: string; content?: unknown[] };
    if (n.type === "text" && n.text) parts.push(n.text);
    else if (n.content?.length) parts.push(walkTipTapText(n.content));
  }
  return parts.join("");
}

function richTextHasContent(raw: string | null | undefined): boolean {
  const t = raw?.trim();
  if (!t) return false;
  try {
    const doc = JSON.parse(t) as { content?: unknown[] };
    return walkTipTapText(doc.content ?? []).trim().length > 0;
  } catch {
    return t.length > 0;
  }
}

/**
 * Portal-Verträge in derselben Kartenansicht wie die Staff-SLA-Liste (ohne interne Aktionen).
 */
export function PortalContractsPage() {
  const [rows, setRows] = useState<ContractItem[]>([]);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    void api
      .portalContracts()
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : "Laden fehlgeschlagen"));
  }, []);

  const sorted = useMemo(() => {
    const rank: Record<ContractStatus, number> = {
      active: 0,
      draft: 1,
      paused: 2,
      expired: 3,
      cancelled: 4,
    };
    return [...rows].sort(
      (a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || a.title.localeCompare(b.title, "de"),
    );
  }, [rows]);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h2>Verträge & SLA</h2>
          <p className="muted">Servicezeiten, Prioritäten und Leistungsumfang.</p>
        </div>
      </header>
      {error ? <p className="form-error">{error}</p> : null}
      {sorted.length === 0 ? (
        <p className="empty panel">Keine aktiven Verträge im Portal.</p>
      ) : (
        <ul className="sla-list">
          {sorted.map((c) => {
            const expanded = expandedId === c.id;
            const normal = c.responseNormalHours ?? c.slaResponseHours ?? null;
            const priceValue = c.priceYearly ?? c.priceMonthly ?? null;
            const priceLabel =
              c.priceYearly != null ? "pro Jahr" : c.priceMonthly != null ? "pro Monat" : null;
            const hasContacts = Boolean(c.contactPerson || c.contactPhone || c.contactEmail);
            const hasExtraDetails = Boolean(
              richTextHasContent(c.description) || c.coverageNote || hasContacts,
            );
            const prioRows = [
              {
                key: "p1",
                code: "P1",
                label: "Kritisch",
                response: c.responseCriticalHours,
                resolve: c.resolveCriticalHours,
              },
              {
                key: "p2",
                code: "P2",
                label: "Hoch",
                response: c.responseHighHours,
                resolve: c.resolveHighHours,
              },
              {
                key: "p3",
                code: "P3",
                label: "Normal",
                response: normal,
                resolve: c.resolveNormalHours,
              },
              {
                key: "p4",
                code: "P4",
                label: "Niedrig",
                response: c.responseLowHours,
                resolve: c.resolveLowHours,
              },
            ] as const;

            return (
              <li key={c.id} className={`sla-card is-${c.status}`}>
                <div className="sla-card-head">
                  <div className="sla-card-title">
                    <strong>{c.title}</strong>
                    <span className={`badge badge-contract-${c.status}`}>
                      {contractStatusLabel[c.status]}
                    </span>
                    {c.contractNumber ? (
                      <span className="sla-meta-chip">{c.contractNumber}</span>
                    ) : null}
                  </div>
                  {hasExtraDetails ? (
                    <div className="list-actions sla-card-actions">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setExpandedId(expanded ? null : c.id)}
                      >
                        {expanded ? "Weniger" : "Details"}
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="sla-overview">
                  {priceValue != null ? (
                    <div className="sla-price">
                      <span className="label">Preis</span>
                      <strong>{formatSlaMoney(priceValue)}</strong>
                      {priceLabel ? <span className="sla-price-unit">{priceLabel}</span> : null}
                    </div>
                  ) : null}
                  <div className="sla-facts">
                    <div className="sla-fact">
                      <span className="label">Laufzeit</span>
                      <strong>
                        {formatDateOnly(c.startDate)} – {formatDateOnly(c.endDate)}
                      </strong>
                    </div>
                    <div className="sla-fact">
                      <span className="label">Servicezeiten</span>
                      <strong>{c.coverageHours || "–"}</strong>
                    </div>
                    <div className="sla-fact">
                      <span className="label">Inkl. Std./Monat</span>
                      <strong>
                        {c.includedHoursMonth != null ? `${c.includedHoursMonth} h` : "–"}
                      </strong>
                    </div>
                    {c.onsiteHours != null ? (
                      <div className="sla-fact">
                        <span className="label">Vor Ort</span>
                        <strong>{formatSlaHours(c.onsiteHours)}</strong>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="sla-matrix" aria-label="Service-Level-Ziele">
                  <div className="sla-matrix-head">
                    <span>Priorität</span>
                    <span>Reaktion</span>
                    <span>Lösung</span>
                  </div>
                  {prioRows.map((row) => (
                    <div key={row.key} className={`sla-matrix-row is-${row.key}`}>
                      <span className="sla-matrix-prio">
                        <span className="sla-matrix-dot" aria-hidden />
                        <span className="sla-matrix-code">{row.code}</span>
                        <span className="sla-matrix-name">{row.label}</span>
                      </span>
                      <strong>{formatSlaHours(row.response)}</strong>
                      <strong>{formatSlaHours(row.resolve)}</strong>
                    </div>
                  ))}
                </div>

                {expanded && hasExtraDetails ? (
                  <div className="sla-details">
                    {richTextHasContent(c.description) ? (
                      <section className="sla-block">
                        <h4>Leistungsumfang</h4>
                        <div className="sla-scope">
                          <DocumentEditor
                            key={`scope-${c.id}`}
                            content={toEditorContent(c.description)}
                            onChange={() => undefined}
                            editable={false}
                          />
                        </div>
                      </section>
                    ) : null}
                    {c.coverageNote ? (
                      <section className="sla-block">
                        <h4>Abdeckung</h4>
                        <p>{c.coverageNote}</p>
                      </section>
                    ) : null}
                    {hasContacts ? (
                      <section className="sla-block">
                        <h4>Ansprechpartner</h4>
                        <div className="sla-contacts">
                          <div className="sla-contact">
                            <span className="label">Operativ</span>
                            <strong>{c.contactPerson || "–"}</strong>
                            {c.contactEmail ? <span>{c.contactEmail}</span> : null}
                            {c.contactPhone ? <span>{c.contactPhone}</span> : null}
                          </div>
                        </div>
                      </section>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
