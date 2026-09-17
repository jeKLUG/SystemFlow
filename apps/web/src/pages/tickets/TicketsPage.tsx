import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../../api";
import { CustomerPicker } from "../../components/CustomerPicker";
import { DocumentEditor } from "../../components/DocumentEditor";
import { Modal } from "../../components/Modal";
import { TicketPriorityPicker } from "../../components/TicketPriorityPicker";
import { TicketSlaClocks } from "../../components/TicketSlaClocks";
import { customerDisplayName } from "../../lib/customer";
import { formatBytes } from "../../lib/files";
import { formatDate, ticketPriorityLabel, ticketStatusLabel } from "../../lib/labels";
import { EMPTY_DOC, richTextHasContent } from "../../lib/richtext";
import { formatTimeAgo, pickSlaContract, ticketSlaTone, useSlaNow } from "../../lib/tickets";
import type { ContractItem, TicketItem, TicketPriority } from "../../types";

const MAX_CREATE_FILES = 10;

const statusFilters: { id: string; label: string }[] = [
  { id: "open_any", label: "Offen" },
  { id: "open", label: "Neu" },
  { id: "in_progress", label: "In Bearbeitung" },
  { id: "waiting_customer", label: "Wartet" },
  { id: "resolved", label: "Gelöst" },
  { id: "closed", label: "Geschlossen" },
  { id: "all", label: "Alle" },
];

const priorityFilters: { id: "" | TicketPriority; label: string }[] = [
  { id: "", label: "Alle" },
  { id: "low", label: ticketPriorityLabel.low },
  { id: "normal", label: ticketPriorityLabel.normal },
  { id: "high", label: ticketPriorityLabel.high },
  { id: "critical", label: ticketPriorityLabel.critical },
];

/**
 * Staff-Ticket-Queue (global oder je Kunde).
 */
export function TicketsPage() {
  const { id: routeCustomerId } = useParams();
  const customerId = routeCustomerId || "";
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState<TicketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [slaContract, setSlaContract] = useState<ContractItem | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    customerId: customerId,
    title: "",
    description: EMPTY_DOC,
    priority: "normal" as TicketPriority,
  });

  const status = searchParams.get("status") || (customerId ? "all" : "open_any");
  const priority = (searchParams.get("priority") || "") as TicketPriority | "";
  const slaOnly = searchParams.get("sla") === "1";
  const filterCustomer = searchParams.get("customer") || customerId;
  const now = useSlaNow();

  useEffect(() => {
    setForm((f) => ({ ...f, customerId: customerId || f.customerId }));
  }, [customerId]);

  useEffect(() => {
    if (!createOpen || !form.customerId) {
      if (!form.customerId) setSlaContract(null);
      return;
    }
    let cancelled = false;
    void api
      .contracts(form.customerId)
      .then((rows) => {
        if (!cancelled) setSlaContract(pickSlaContract(rows));
      })
      .catch(() => {
        if (!cancelled) setSlaContract(null);
      });
    return () => {
      cancelled = true;
    };
  }, [createOpen, form.customerId]);

  useEffect(() => {
    setLoading(true);
    void api
      .tickets({
        customerId: filterCustomer || undefined,
        status: status === "all" ? undefined : status,
        priority: priority || undefined,
        slaBreached: slaOnly,
        limit: 200,
      })
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : "Laden fehlgeschlagen"))
      .finally(() => setLoading(false));
  }, [filterCustomer, status, priority, slaOnly]);

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  }

  const openCount = useMemo(
    () => rows.filter((t) => t.status === "open" || t.status === "in_progress" || t.status === "waiting_customer").length,
    [rows],
  );
  const overdueCount = useMemo(
    () => rows.filter((t) => ticketSlaTone(t, new Date(now)) === "overdue").length,
    [rows, now],
  );

  function openCreate() {
    setForm({
      customerId: customerId,
      title: "",
      description: EMPTY_DOC,
      priority: "normal",
    });
    setFiles([]);
    setFormError("");
    setDragOver(false);
    setEditorKey((n) => n + 1);
    setCreateOpen(true);
  }

  function addFiles(list: FileList | File[] | null) {
    if (!list) return;
    setFiles((prev) => {
      const next = [...prev];
      for (const file of Array.from(list)) {
        if (next.length >= MAX_CREATE_FILES) break;
        const dup = next.some(
          (item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified,
        );
        if (!dup) next.push(file);
      }
      return next;
    });
  }

  function onDrag(e: DragEvent, over: boolean) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(over);
  }

  function onDrop(e: DragEvent) {
    onDrag(e, false);
    addFiles(e.dataTransfer.files);
  }

  async function createTicket(e: FormEvent) {
    e.preventDefault();
    if (!form.customerId) {
      setFormError("Kunde wählen");
      return;
    }
    setBusy(true);
    setFormError("");
    try {
      const created = await api.createTicket({
        customerId: form.customerId,
        title: form.title.trim(),
        description: richTextHasContent(form.description) ? form.description : null,
        priority: form.priority,
      });
      const uploads = await Promise.allSettled(
        files.map((file) => api.uploadTicketAttachment(created.id, file)),
      );
      const failed = uploads.filter((r) => r.status === "rejected").length;
      setCreateOpen(false);
      navigate(`/tickets/${created.id}${failed ? "?anhang=teilweise" : ""}`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Anlegen fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page tickets-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Helpdesk</p>
          <h2>Tickets</h2>
          <p className="muted">
            {loading
              ? "Laden…"
              : `${openCount} offen${overdueCount ? ` · ${overdueCount} überfällig` : ""}`}
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          Neues Ticket
        </button>
      </header>

      <div className="emails-toolbar tickets-toolbar">
        <div className="emails-dir-seg" role="group" aria-label="Status">
          {statusFilters.map((s) => (
            <button
              key={s.id}
              type="button"
              className={status === s.id ? "is-active" : ""}
              onClick={() => setFilter("status", s.id === "open_any" && !customerId ? "open_any" : s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="tickets-prio-seg" role="group" aria-label="Priorität">
          {priorityFilters.map((p) => (
            <button
              key={p.id || "all"}
              type="button"
              className={`${p.id ? `is-prio-${p.id}` : "is-all"}${priority === p.id ? " is-active" : ""}`}
              aria-pressed={priority === p.id}
              onClick={() => setFilter("priority", p.id)}
            >
              {p.id ? <i aria-hidden /> : null}
              {p.label}
            </button>
          ))}
        </div>
        <label className="check tickets-sla-filter">
          <input
            type="checkbox"
            checked={slaOnly}
            onChange={(e) => setFilter("sla", e.target.checked ? "1" : "")}
          />
          <span>Nur SLA überfällig</span>
        </label>
        {!customerId ? (
          <div className="tickets-customer-filter">
            <CustomerPicker
              value={filterCustomer}
              onChange={(id) => setFilter("customer", id)}
              allowEmpty
              emptyLabel="Alle Kunden"
              compact
            />
          </div>
        ) : null}
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      {loading ? (
        <p className="empty">Lade Tickets…</p>
      ) : rows.length === 0 ? (
        <p className="empty panel">Keine Tickets in dieser Ansicht.</p>
      ) : (
        <ul className="staff-ticket-list">
          {rows.map((t) => {
            const slaTone = ticketSlaTone(t, new Date(now));
            const waiting = t.status === "waiting_customer";
            const customer = customerDisplayName({
              name: t.customerName ?? "",
              company: t.customerCompany ?? null,
            });
            return (
              <li key={t.id}>
                <Link
                  className={`panel staff-ticket-card is-sla-${slaTone}${waiting ? " is-waiting" : ""}`}
                  to={`/tickets/${t.id}`}
                >
                  <span className="portal-ticket-num">{t.number}</span>
                  <div className="staff-ticket-main">
                    <strong>{t.title}</strong>
                    <p className="muted">
                      {customer}
                      {" · Eingegangen "}
                      {formatTimeAgo(t.createdAt, new Date(now))}
                      {" · "}
                      {formatDate(t.createdAt)}
                    </p>
                  </div>
                  <TicketSlaClocks ticket={t} now={now} compact />
                  <div className="staff-ticket-flags">
                    <span className={`badge badge-ticket-${t.status}`}>{ticketStatusLabel[t.status]}</span>
                    <span className={`badge badge-prio-${t.priority}`}>{ticketPriorityLabel[t.priority]}</span>
                    {waiting ? <span className="portal-ticket-cta">Kunde</span> : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={createOpen}
        title="Neues Ticket"
        onClose={() => setCreateOpen(false)}
        className="modal-wide"
        showCloseButton={false}
        closeOnBackdrop={false}
      >
        <form className="stack-form portal-ticket-form" onSubmit={(e) => void createTicket(e)}>
          <p className="muted portal-ticket-form-lead">
            Beschreiben Sie das Anliegen. Screenshots oder Dateien können Sie direkt anhängen.
          </p>
          {!customerId ? (
            <label className="field">
              <span>Kunde</span>
              <CustomerPicker
                value={form.customerId}
                onChange={(id) => setForm({ ...form, customerId: id })}
                allowEmpty={false}
                required
              />
            </label>
          ) : null}
          <label className="field">
            <span>Betreff</span>
            <input
              required
              autoComplete="off"
              placeholder="z. B. Drucker im Büro 2 druckt nicht"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </label>
          <div className="field">
            <span>Beschreibung</span>
            <DocumentEditor
              key={editorKey}
              content={form.description}
              onChange={(description) => setForm((prev) => ({ ...prev, description }))}
              variant="comment"
              placeholder="Was ist passiert? Seit wann? Was haben Sie schon versucht?"
            />
          </div>
          <TicketPriorityPicker
            value={form.priority}
            onChange={(priority) => setForm({ ...form, priority })}
            contract={slaContract}
          />
          <div className="field">
            <span>Anhänge</span>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              className={`portal-ticket-drop${dragOver ? " is-over" : ""}`}
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={(e) => onDrag(e, true)}
              onDragOver={(e) => onDrag(e, true)}
              onDragLeave={(e) => onDrag(e, false)}
              onDrop={onDrop}
            >
              <strong>Dateien hierher ziehen oder auswählen</strong>
              <span className="muted">Bis zu {MAX_CREATE_FILES} Dateien, z. B. Screenshots, PDF oder Office</span>
            </button>
            {files.length ? (
              <ul className="portal-file-chips">
                {files.map((file, index) => (
                  <li key={`${file.name}-${file.lastModified}-${index}`}>
                    <span>
                      {file.name} <em>{formatBytes(file.size)}</em>
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon"
                      aria-label={`${file.name} entfernen`}
                      onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          {formError ? <p className="form-error">{formError}</p> : null}
          <div className="form-actions modal-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setCreateOpen(false)} disabled={busy}>
              Abbrechen
            </button>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? (files.length ? "Anlegen und anhängen…" : "Anlegen…") : "Ticket anlegen"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

