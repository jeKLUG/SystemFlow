import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { api } from "../api";
import { contractStatusLabel, formatDateOnly, formatSlaHours } from "../lib/labels";
import type { ContractItem, ContractStatus } from "../types";
import { Modal } from "./Modal";

const emptyForm = {
  title: "",
  contractNumber: "",
  status: "active" as ContractStatus,
  description: "",
  startDate: "",
  endDate: "",
  coverageHours: "Mo–Fr 08:00–17:00",
  coverageNote: "",
  includedHoursMonth: "",
  /** Nur eine Abrechnung: monatlich oder jährlich. */
  priceBilling: "" as "" | "monthly" | "yearly",
  priceAmount: "",
  responseCriticalHours: "1",
  responseHighHours: "4",
  responseNormalHours: "8",
  responseLowHours: "24",
  resolveCriticalHours: "4",
  resolveHighHours: "8",
  resolveNormalHours: "24",
  resolveLowHours: "72",
  onsiteHours: "",
  contactPerson: "",
  contactPhone: "",
  contactEmail: "",
  escalationContact: "",
  escalationPhone: "",
  escalationEmail: "",
  notes: "",
};

type Props = {
  customerId: string;
  contracts: ContractItem[];
  onChanged: () => Promise<void> | void;
  /** Ohne eigenen Hero – für Einbettung im Dokumente-Hub. */
  embedded?: boolean;
  /** Erhöhen öffnet den Anlegen-Dialog (z. B. aus dem Dokumente-Hero). */
  createRequestKey?: number;
};

function numOrNull(value: string): number | null {
  const t = value.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Formatiert SLA-Preise in EUR (de-DE). */
function formatSlaMoney(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "–";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(value);
}

function formFromContract(c: ContractItem): typeof emptyForm {
  return {
    title: c.title,
    contractNumber: c.contractNumber ?? "",
    status: c.status ?? "active",
    description: c.description ?? "",
    startDate: c.startDate ?? "",
    endDate: c.endDate ?? "",
    coverageHours: c.coverageHours ?? "",
    coverageNote: c.coverageNote ?? "",
    includedHoursMonth: c.includedHoursMonth != null ? String(c.includedHoursMonth) : "",
    priceBilling: c.priceMonthly != null ? "monthly" : c.priceYearly != null ? "yearly" : "",
    priceAmount:
      c.priceMonthly != null
        ? String(c.priceMonthly)
        : c.priceYearly != null
          ? String(c.priceYearly)
          : "",
    responseCriticalHours:
      c.responseCriticalHours != null ? String(c.responseCriticalHours) : "",
    responseHighHours: c.responseHighHours != null ? String(c.responseHighHours) : "",
    responseNormalHours:
      c.responseNormalHours != null
        ? String(c.responseNormalHours)
        : c.slaResponseHours != null
          ? String(c.slaResponseHours)
          : "",
    responseLowHours: c.responseLowHours != null ? String(c.responseLowHours) : "",
    resolveCriticalHours: c.resolveCriticalHours != null ? String(c.resolveCriticalHours) : "",
    resolveHighHours: c.resolveHighHours != null ? String(c.resolveHighHours) : "",
    resolveNormalHours: c.resolveNormalHours != null ? String(c.resolveNormalHours) : "",
    resolveLowHours: c.resolveLowHours != null ? String(c.resolveLowHours) : "",
    onsiteHours: c.onsiteHours != null ? String(c.onsiteHours) : "",
    contactPerson: c.contactPerson ?? "",
    contactPhone: c.contactPhone ?? "",
    contactEmail: c.contactEmail ?? "",
    escalationContact: c.escalationContact ?? "",
    escalationPhone: c.escalationPhone ?? "",
    escalationEmail: c.escalationEmail ?? "",
    notes: c.notes ?? "",
  };
}

function toBody(form: typeof emptyForm) {
  return {
    title: form.title,
    contractNumber: form.contractNumber,
    status: form.status,
    description: form.description,
    startDate: form.startDate,
    endDate: form.endDate,
    coverageHours: form.coverageHours,
    coverageNote: form.coverageNote,
    includedHoursMonth: numOrNull(form.includedHoursMonth),
    priceMonthly: form.priceBilling === "monthly" ? numOrNull(form.priceAmount) : null,
    priceYearly: form.priceBilling === "yearly" ? numOrNull(form.priceAmount) : null,
    responseCriticalHours: numOrNull(form.responseCriticalHours),
    responseHighHours: numOrNull(form.responseHighHours),
    responseNormalHours: numOrNull(form.responseNormalHours),
    responseLowHours: numOrNull(form.responseLowHours),
    resolveCriticalHours: numOrNull(form.resolveCriticalHours),
    resolveHighHours: numOrNull(form.resolveHighHours),
    resolveNormalHours: numOrNull(form.resolveNormalHours),
    resolveLowHours: numOrNull(form.resolveLowHours),
    onsiteHours: numOrNull(form.onsiteHours),
    contactPerson: form.contactPerson,
    contactPhone: form.contactPhone,
    contactEmail: form.contactEmail,
    escalationContact: form.escalationContact,
    escalationPhone: form.escalationPhone,
    escalationEmail: form.escalationEmail,
    notes: form.notes,
  };
}

/**
 * SLA-/Vertragsübersicht mit Modal zum Anlegen und Bearbeiten.
 */
export function CustomerSlaPanel({
  customerId,
  contracts,
  onChanged,
  embedded = false,
  createRequestKey = 0,
}: Props) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null);
  const lastCreateKey = useRef(0);

  const sorted = useMemo(() => {
    const rank: Record<ContractStatus, number> = {
      active: 0,
      draft: 1,
      paused: 2,
      expired: 3,
      cancelled: 4,
    };
    return [...contracts].sort(
      (a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || a.title.localeCompare(b.title, "de"),
    );
  }, [contracts]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
    setOpen(true);
  }

  useEffect(() => {
    if (!createRequestKey || createRequestKey === lastCreateKey.current) return;
    lastCreateKey.current = createRequestKey;
    openCreate();
  }, [createRequestKey]);

  function openEdit(c: ContractItem) {
    setEditingId(c.id);
    setForm(formFromContract(c));
    setError("");
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    setEditingId(null);
    setError("");
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const body = toBody(form);
      if (editingId) await api.updateContract(editingId, body);
      else await api.createContract(customerId, body);
      closeModal();
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    }
  }

  return (
    <section className={`section sla-panel${embedded ? " is-embedded" : ""}`}>
      {!embedded ? (
        <div className="section-head row-between">
          <div>
            <h2>Verträge / SLA</h2>
            <p>Servicezeiten, Prioritäten und Eskalation – keine Rechnungen (Lexware).</p>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-icon-lg"
            onClick={openCreate}
            aria-label="Neuen SLA-/Vertrag anlegen"
            title="Neuen SLA anlegen"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ) : null}

      {sorted.length === 0 ? (
        <div className="docs-empty panel">
          <div className="docs-empty-icon" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M7 4h10v16H7z" strokeLinejoin="round" />
              <path d="M10 8h4M10 12h4M10 16h2" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <strong>Noch keine Verträge</strong>
            <p className="muted">SLA mit Servicezeiten, Prioritäten und Eskalation hinterlegen.</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            Ersten Vertrag
          </button>
        </div>
      ) : (
        <ul className="sla-list">
          {sorted.map((c) => {
            const expanded = expandedId === c.id;
            const normal = c.responseNormalHours ?? c.slaResponseHours ?? null;
            const priceValue = c.priceYearly ?? c.priceMonthly ?? null;
            const priceLabel =
              c.priceYearly != null ? "pro Jahr" : c.priceMonthly != null ? "pro Monat" : null;
            const hasContacts =
              Boolean(c.contactPerson || c.contactPhone || c.contactEmail) ||
              Boolean(c.escalationContact || c.escalationPhone || c.escalationEmail);
            const hasExtraDetails = Boolean(
              c.description || c.coverageNote || hasContacts || c.notes,
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
                  <div className="list-actions sla-card-actions">
                    {hasExtraDetails ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setExpandedId(expanded ? null : c.id)}
                      >
                        {expanded ? "Weniger" : "Details"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={pdfBusyId === c.id}
                      onClick={() => {
                        setPdfBusyId(c.id);
                        void api
                          .exportContractPdf(c.id, c.contractNumber || c.title)
                          .catch((err) =>
                            alert(err instanceof Error ? err.message : "PDF-Export fehlgeschlagen"),
                          )
                          .finally(() => setPdfBusyId(null));
                      }}
                    >
                      {pdfBusyId === c.id ? "PDF…" : "PDF"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => openEdit(c)}
                    >
                      Bearbeiten
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => {
                        if (confirm(`SLA „${c.title}“ wirklich löschen?`)) {
                          void api.deleteContract(c.id).then(() => onChanged());
                        }
                      }}
                    >
                      Löschen
                    </button>
                  </div>
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
                    {c.description ? (
                      <section className="sla-block">
                        <h4>Leistungsumfang</h4>
                        <p className="sla-scope">{c.description}</p>
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
                          <div className="sla-contact">
                            <span className="label">Eskalation</span>
                            <strong>{c.escalationContact || "–"}</strong>
                            {c.escalationEmail ? <span>{c.escalationEmail}</span> : null}
                            {c.escalationPhone ? <span>{c.escalationPhone}</span> : null}
                          </div>
                        </div>
                      </section>
                    ) : null}

                    {c.notes ? (
                      <section className="sla-block">
                        <h4>Notizen</h4>
                        <p className="muted">{c.notes}</p>
                      </section>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={open}
        title={editingId ? "SLA bearbeiten" : "Neuen SLA anlegen"}
        onClose={closeModal}
        showCloseButton={false}
        className="modal-wide"
      >
        <form className="form-grid sla-form" onSubmit={save}>
          <label className="field">
            <span>Titel *</span>
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="z. B. Managed Service Gold"
            />
          </label>
          <label className="field">
            <span>Vertragsnr.</span>
            <input
              value={editingId ? form.contractNumber : ""}
              readOnly={!editingId}
              onChange={(e) => setForm({ ...form, contractNumber: e.target.value })}
              placeholder={editingId ? "SLA-2026-014" : "Wird automatisch vergeben"}
              title={
                editingId
                  ? "Vertragsnummer"
                  : "Beim Anlegen automatisch als SLA-JJJJ-NNN vergeben"
              }
            />
          </label>
          <label className="field">
            <span>Status</span>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as ContractStatus })}
            >
              {(Object.keys(contractStatusLabel) as ContractStatus[]).map((s) => (
                <option key={s} value={s}>
                  {contractStatusLabel[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Inkl. Stunden / Monat</span>
            <input
              type="number"
              min={0}
              step={0.25}
              value={form.includedHoursMonth}
              onChange={(e) => setForm({ ...form, includedHoursMonth: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Preis-Abrechnung</span>
            <select
              value={form.priceBilling}
              onChange={(e) =>
                setForm({
                  ...form,
                  priceBilling: e.target.value as "" | "monthly" | "yearly",
                  priceAmount: e.target.value ? form.priceAmount : "",
                })
              }
            >
              <option value="">Kein Preis</option>
              <option value="monthly">Monatlich</option>
              <option value="yearly">Jährlich</option>
            </select>
          </label>
          <label className="field">
            <span>
              {form.priceBilling === "yearly"
                ? "Preis / Jahr (€)"
                : form.priceBilling === "monthly"
                  ? "Preis / Monat (€)"
                  : "Preis (€)"}
            </span>
            <input
              type="number"
              min={0}
              step={0.01}
              disabled={!form.priceBilling}
              value={form.priceAmount}
              onChange={(e) => setForm({ ...form, priceAmount: e.target.value })}
              placeholder={form.priceBilling === "yearly" ? "z. B. 3200" : "z. B. 299"}
            />
          </label>
          <label className="field">
            <span>Beginn</span>
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Ende</span>
            <input
              type="date"
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Servicezeiten</span>
            <input
              value={form.coverageHours}
              onChange={(e) => setForm({ ...form, coverageHours: e.target.value })}
              placeholder="Mo–Fr 08:00–17:00"
            />
          </label>
          <label className="field">
            <span>Vor Ort (Stunden)</span>
            <input
              type="number"
              min={0.25}
              step={0.25}
              value={form.onsiteHours}
              onChange={(e) => setForm({ ...form, onsiteHours: e.target.value })}
            />
          </label>
          <label className="field full">
            <span>Abdeckung / Ausnahmen</span>
            <input
              value={form.coverageNote}
              onChange={(e) => setForm({ ...form, coverageNote: e.target.value })}
              placeholder="z. B. ohne gesetzliche Feiertage, Rufbereitschaft Sa 9–13"
            />
          </label>
          <label className="field full">
            <span>Leistungsumfang</span>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Was ist im SLA enthalten?"
            />
          </label>

          <div className="full sla-form-block">
            <h4>Reaktionszeiten (Stunden)</h4>
            <div className="sla-form-grid4">
              {(
                [
                  ["responseCriticalHours", "P1 Kritisch"],
                  ["responseHighHours", "P2 Hoch"],
                  ["responseNormalHours", "P3 Normal"],
                  ["responseLowHours", "P4 Niedrig"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="field">
                  <span>{label}</span>
                  <input
                    type="number"
                    min={0.05}
                    step={0.05}
                    value={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="full sla-form-block">
            <h4>Lösungszeiten (Stunden)</h4>
            <div className="sla-form-grid4">
              {(
                [
                  ["resolveCriticalHours", "P1 Kritisch"],
                  ["resolveHighHours", "P2 Hoch"],
                  ["resolveNormalHours", "P3 Normal"],
                  ["resolveLowHours", "P4 Niedrig"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="field">
                  <span>{label}</span>
                  <input
                    type="number"
                    min={0.05}
                    step={0.05}
                    value={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="full sla-form-block">
            <h4>Kontakte</h4>
            <div className="sla-form-grid3">
              <label className="field">
                <span>Ansprechpartner</span>
                <input
                  value={form.contactPerson}
                  onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Telefon</span>
                <input
                  value={form.contactPhone}
                  onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
                />
              </label>
              <label className="field">
                <span>E-Mail</span>
                <input
                  type="email"
                  value={form.contactEmail}
                  onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Eskalation</span>
                <input
                  value={form.escalationContact}
                  onChange={(e) => setForm({ ...form, escalationContact: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Eskalation Telefon</span>
                <input
                  value={form.escalationPhone}
                  onChange={(e) => setForm({ ...form, escalationPhone: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Eskalation E-Mail</span>
                <input
                  type="email"
                  value={form.escalationEmail}
                  onChange={(e) => setForm({ ...form, escalationEmail: e.target.value })}
                />
              </label>
            </div>
          </div>

          <label className="field full">
            <span>Interne Notizen</span>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>

          {error ? <p className="form-error full">{error}</p> : null}
          <div className="full form-actions modal-actions">
            <button className="btn btn-primary" type="submit">
              {editingId ? "Aktualisieren" : "SLA anlegen"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={closeModal}>
              Abbrechen
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
