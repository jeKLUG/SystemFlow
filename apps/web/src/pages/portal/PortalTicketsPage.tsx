import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../api";
import { DocumentEditor } from "../../components/DocumentEditor";
import { HelpHint } from "../../components/HelpHint";
import { Modal } from "../../components/Modal";
import { TicketPriorityPicker } from "../../components/TicketPriorityPicker";
import { TicketSlaClocks } from "../../components/TicketSlaClocks";
import { formatBytes } from "../../lib/files";
import {
  formatDate,
  portalTicketStatusLabel,
  ticketPriorityLabel,
} from "../../lib/labels";
import { EMPTY_DOC, richTextHasContent } from "../../lib/richtext";
import { formatTimeAgo, pickSlaContract, ticketSlaTone, useSlaNow } from "../../lib/tickets";
import type { ContractItem, TicketItem, TicketPriority } from "../../types";

const MAX_CREATE_FILES = 10;

type TicketFilter = "all" | "open" | "waiting" | "done";

function matchesFilter(ticket: TicketItem, filter: TicketFilter) {
  if (filter === "open") return ticket.status === "open" || ticket.status === "in_progress";
  if (filter === "waiting") return ticket.status === "waiting_customer";
  if (filter === "done") return ticket.status === "resolved" || ticket.status === "closed";
  return true;
}

function parseFilter(value: string | null): TicketFilter {
  if (value === "open" || value === "waiting" || value === "done") return value;
  return "all";
}

/**
 * Kunden-Ticketliste mit Filtergruppen und Anlegen-Dialog inklusive Anhängen.
 */
export function PortalTicketsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<TicketItem[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [form, setForm] = useState({ title: "", description: EMPTY_DOC, priority: "normal" as TicketPriority });
  const [slaContract, setSlaContract] = useState<ContractItem | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const filter = parseFilter(params.get("filter"));
  const now = useSlaNow();

  const counts = useMemo(
    () => ({
      all: rows.length,
      open: rows.filter((t) => matchesFilter(t, "open")).length,
      waiting: rows.filter((t) => matchesFilter(t, "waiting")).length,
      done: rows.filter((t) => matchesFilter(t, "done")).length,
    }),
    [rows],
  );

  const visible = useMemo(() => rows.filter((t) => matchesFilter(t, filter)), [rows, filter]);
  const waiting = visible.filter((t) => t.status === "waiting_customer");
  const active = visible.filter((t) => t.status === "open" || t.status === "in_progress");
  const done = visible.filter((t) => t.status === "resolved" || t.status === "closed");

  async function reload() {
    const [tickets, contracts] = await Promise.all([
      api.portalTickets(),
      api.portalContracts().catch(() => [] as ContractItem[]),
    ]);
    setRows(tickets);
    setSlaContract(pickSlaContract(contracts));
  }

  useEffect(() => {
    void reload().catch((err) => setLoadError(err instanceof Error ? err.message : "Laden fehlgeschlagen"));
  }, []);

  useEffect(() => {
    if (params.get("neu") !== "1") return;
    setForm({ title: "", description: EMPTY_DOC, priority: "normal" });
    setFiles([]);
    setFormError("");
    setDragOver(false);
    setEditorKey((n) => n + 1);
    setOpen(true);
    const next = new URLSearchParams(params);
    next.delete("neu");
    setParams(next, { replace: true });
  }, [params, setParams]);

  function setFilter(next: TicketFilter) {
    const q = new URLSearchParams(params);
    if (next === "all") q.delete("filter");
    else q.set("filter", next);
    setParams(q, { replace: true });
  }

  function openCreate() {
    setForm({ title: "", description: EMPTY_DOC, priority: "normal" });
    setFiles([]);
    setFormError("");
    setDragOver(false);
    setEditorKey((n) => n + 1);
    setOpen(true);
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

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError("");
    try {
      const created = await api.createPortalTicket({
        title: form.title.trim(),
        description: richTextHasContent(form.description) ? form.description : null,
        priority: form.priority,
      });
      const uploads = await Promise.allSettled(
        files.map((file) => api.uploadPortalTicketAttachment(created.id, file)),
      );
      const failed = uploads.filter((r) => r.status === "rejected").length;
      setOpen(false);
      navigate(`/portal/tickets/${created.id}${failed ? "?anhang=teilweise" : ""}`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Anlegen fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <div className="page-head-title">
          <h2>Tickets</h2>
          <HelpHint text="Anfragen an Ihr Systemhaus – wir antworten im Ticket." />
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          Neues Ticket
        </button>
      </header>

      {loadError ? <p className="form-error">{loadError}</p> : null}

      <div className="portal-ticket-toolbar">
        <div className="emails-dir-seg" role="tablist" aria-label="Ticketfilter">
          <button type="button" className={filter === "all" ? "is-active" : ""} onClick={() => setFilter("all")}>
            Alle <em>{counts.all}</em>
          </button>
          <button type="button" className={filter === "open" ? "is-active" : ""} onClick={() => setFilter("open")}>
            Laufend <em>{counts.open}</em>
          </button>
          <button type="button" className={filter === "waiting" ? "is-active" : ""} onClick={() => setFilter("waiting")}>
            Ihre Rückmeldung <em>{counts.waiting}</em>
          </button>
          <button type="button" className={filter === "done" ? "is-active" : ""} onClick={() => setFilter("done")}>
            Erledigt <em>{counts.done}</em>
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="docs-empty panel">
          <div className="docs-empty-icon" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M8 5h8a2 2 0 0 1 2 2v12l-3-2-3 2-3-2-3 2V7a2 2 0 0 1 2-2z" strokeLinejoin="round" />
              <path d="M10 9h4M10 13h2" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <strong>Noch keine Tickets</strong>
            <p className="muted">Beschreiben Sie Ihr Anliegen – Screenshots und Dateien können Sie direkt anhängen.</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            Erstes Ticket
          </button>
        </div>
      ) : visible.length === 0 ? (
        <p className="empty panel">Keine Tickets in dieser Ansicht.</p>
      ) : (
        <div className="portal-ticket-board">
          {waiting.length ? (
            <section className="portal-ticket-section">
              <h3>Bitte antworten</h3>
              <p className="muted">Wir warten auf eine kurze Rückmeldung von Ihnen.</p>
              <ul className="portal-ticket-list">
                {waiting.map((t) => (
                  <PortalTicketCard key={t.id} ticket={t} waiting now={now} />
                ))}
              </ul>
            </section>
          ) : null}
          {active.length ? (
            <section className="portal-ticket-section">
              <h3>{filter === "all" && waiting.length ? "In Bearbeitung" : "Laufende Anfragen"}</h3>
              <ul className="portal-ticket-list">
                {active.map((t) => (
                  <PortalTicketCard key={t.id} ticket={t} waiting={false} now={now} />
                ))}
              </ul>
            </section>
          ) : null}
          {done.length ? (
            <section className="portal-ticket-section is-done">
              <h3>Erledigt</h3>
              <ul className="portal-ticket-list">
                {done.map((t) => (
                  <PortalTicketCard key={t.id} ticket={t} waiting={false} now={now} />
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}

      <Modal
        open={open}
        title="Neues Ticket"
        onClose={() => setOpen(false)}
        className="modal-wide"
        showCloseButton={false}
        closeOnBackdrop={false}
      >
        <form className="stack-form portal-ticket-form" onSubmit={(e) => void create(e)}>
          <p className="muted portal-ticket-form-lead">
            Schildern Sie kurz, was nicht funktioniert. Screenshots oder Dateien helfen uns, schneller zu helfen.
          </p>
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
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)} disabled={busy}>
              Abbrechen
            </button>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? (files.length ? "Senden und anhängen…" : "Senden…") : "Ticket senden"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

/** Kennzahlen für eine Portal-Ticketkarte (Zeiten und Herkunft). */
function ticketCardFacts(ticket: TicketItem, now: Date) {
  const facts: { label: string; value: string }[] = [
    { label: "Eingegangen", value: formatTimeAgo(ticket.createdAt, now) || formatDate(ticket.createdAt) },
    { label: "Aktualisiert", value: formatTimeAgo(ticket.updatedAt, now) || formatDate(ticket.updatedAt) },
    { label: "Quelle", value: ticket.createdByRole === "customer" ? "Von Ihnen" : "Vom Systemhaus" },
  ];
  if (ticket.firstResponseAt) {
    facts.push({ label: "Erste Antwort", value: formatTimeAgo(ticket.firstResponseAt, now) });
  } else if (ticket.status === "open" || ticket.status === "in_progress" || ticket.status === "waiting_customer") {
    facts.push({ label: "Erste Antwort", value: "steht aus" });
  }
  if (ticket.resolvedAt || ticket.closedAt) {
    facts.push({
      label: ticket.status === "closed" ? "Geschlossen" : "Gelöst",
      value: formatDate(ticket.resolvedAt || ticket.closedAt || ""),
    });
  }
  return facts;
}

/** Eine Ticketkarte in der Portal-Liste mit Status, Zeiten und SLA. */
function PortalTicketCard({
  ticket,
  waiting,
  now,
}: {
  ticket: TicketItem;
  waiting: boolean;
  now: number;
}) {
  const clockNow = new Date(now);
  const slaTone = ticketSlaTone(ticket, clockNow);
  const showSla = Boolean(ticket.slaResponseDueAt || ticket.slaResolveDueAt);
  const facts = ticketCardFacts(ticket, clockNow);

  return (
    <li>
      <Link
        className={`panel portal-ticket-card is-sla-${slaTone}${waiting ? " is-waiting" : ""}`}
        to={`/portal/tickets/${ticket.id}`}
      >
        <div className="portal-ticket-card-head">
          <span className="portal-ticket-num">{ticket.number}</span>
          {waiting ? <span className="portal-ticket-cta">Bitte antworten</span> : null}
        </div>
        <dl className="portal-ticket-kpis">
          <div>
            <dt>Aktueller Status</dt>
            <dd>
              <span className={`badge badge-ticket-${ticket.status}`}>
                {portalTicketStatusLabel[ticket.status]}
              </span>
            </dd>
          </div>
          <div>
            <dt>Priorität</dt>
            <dd>
              <span className={`badge badge-prio-${ticket.priority}`}>{ticketPriorityLabel[ticket.priority]}</span>
            </dd>
          </div>
        </dl>
        <div className="portal-ticket-main">
          <strong>{ticket.title}</strong>
        </div>
        <dl className="portal-ticket-facts">
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
        {showSla ? <TicketSlaClocks ticket={ticket} now={now} compact /> : null}
      </Link>
    </li>
  );
}
