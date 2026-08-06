import { useMemo, useState, type FormEvent } from "react";
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
};

function numOrNull(value: string): number | null {
  const t = value.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function formFromContract(c: ContractItem) {
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
export function CustomerSlaPanel({ customerId, contracts, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null);

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
    <section className="section">
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

      {sorted.length === 0 ? (
        <p className="empty">Noch keine SLAs. Lege über das Plus einen Vertrag mit Prioritätszeiten an.</p>
      ) : (
        <ul className="sla-list">
          {sorted.map((c) => {
            const expanded = expandedId === c.id;
            const normal =
              c.responseNormalHours ?? c.slaResponseHours ?? null;
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
                  <div className="list-actions">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setExpandedId(expanded ? null : c.id)}
                    >
                      {expanded ? "Weniger" : "Details"}
                    </button>
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

                <div className="sla-summary">
                  <div className="sla-metric">
                    <span className="label">Laufzeit</span>
                    <strong>
                      {formatDateOnly(c.startDate)} – {formatDateOnly(c.endDate)}
                    </strong>
                  </div>
                  <div className="sla-metric">
                    <span className="label">Servicezeiten</span>
                    <strong>{c.coverageHours || "–"}</strong>
                  </div>
                  <div className="sla-metric">
                    <span className="label">Reaktion normal</span>
                    <strong>{formatSlaHours(normal)}</strong>
                  </div>
                  <div className="sla-metric">
                    <span className="label">Inkl. Std./Monat</span>
                    <strong>
                      {c.includedHoursMonth != null ? `${c.includedHoursMonth} h` : "–"}
                    </strong>
                  </div>
                </div>

                <div className="sla-priority-row" aria-label="Reaktionszeiten">
                  {(
                    [
                      ["P1", c.responseCriticalHours],
                      ["P2", c.responseHighHours],
                      ["P3", normal],
                      ["P4", c.responseLowHours],
                    ] as const
                  ).map(([label, hours]) => (
                    <div key={label} className={`sla-prio is-${label.toLowerCase()}`}>
                      <span>{label}</span>
                      <strong>{formatSlaHours(hours)}</strong>
                    </div>
                  ))}
                </div>

                {expanded ? (
                  <div className="sla-details">
                    {c.description ? (
                      <p className="sla-scope">
                        <span className="label">Leistungsumfang</span>
                        {c.description}
                      </p>
                    ) : null}
                    {c.coverageNote ? (
                      <p className="muted">
                        <span className="label">Abdeckung</span> {c.coverageNote}
                      </p>
                    ) : null}

                    <div className="sla-matrix">
                      <div className="sla-matrix-head">
                        <span />
                        <span>Reaktion</span>
                        <span>Lösung</span>
                      </div>
                      {(
                        [
                          ["Kritisch (P1)", c.responseCriticalHours, c.resolveCriticalHours],
                          ["Hoch (P2)", c.responseHighHours, c.resolveHighHours],
                          ["Normal (P3)", normal, c.resolveNormalHours],
                          ["Niedrig (P4)", c.responseLowHours, c.resolveLowHours],
                        ] as const
                      ).map(([label, response, resolve]) => (
                        <div key={label} className="sla-matrix-row">
                          <span>{label}</span>
                          <strong>{formatSlaHours(response)}</strong>
                          <strong>{formatSlaHours(resolve)}</strong>
                        </div>
                      ))}
                    </div>

                    <div className="sla-contacts">
                      <div>
                        <span className="label">Ansprechpartner</span>
                        <p>
                          {c.contactPerson || "–"}
                          {c.contactPhone ? ` · ${c.contactPhone}` : ""}
                          {c.contactEmail ? ` · ${c.contactEmail}` : ""}
                        </p>
                      </div>
                      <div>
                        <span className="label">Eskalation</span>
                        <p>
                          {c.escalationContact || "–"}
                          {c.escalationPhone ? ` · ${c.escalationPhone}` : ""}
                          {c.escalationEmail ? ` · ${c.escalationEmail}` : ""}
                        </p>
                      </div>
                      <div>
                        <span className="label">Vor Ort</span>
                        <p>{formatSlaHours(c.onsiteHours)}</p>
                      </div>
                    </div>

                    {c.notes ? (
                      <p className="muted">
                        <span className="label">Notizen</span> {c.notes}
                      </p>
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
              value={form.contractNumber}
              onChange={(e) => setForm({ ...form, contractNumber: e.target.value })}
              placeholder="SLA-2026-014"
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
          <div className="full form-actions">
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
