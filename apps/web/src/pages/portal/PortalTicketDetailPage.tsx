import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../../api";
import { formatBytes } from "../../lib/files";
import { formatDate, portalTicketStatusHint, portalTicketStatusLabel, ticketPriorityLabel } from "../../lib/labels";
import type { TicketItem } from "../../types";

/**
 * Ticketdetail im Kundenportal (nur öffentliche Nachrichten).
 */
export function PortalTicketDetailPage() {
  const { ticketId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [ticket, setTicket] = useState<TicketItem | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const uploadWarn = params.get("anhang") === "teilweise";

  async function reload() {
    setTicket(await api.portalTicket(ticketId));
  }

  useEffect(() => {
    void reload().catch((err) => setError(err instanceof Error ? err.message : "Nicht gefunden"));
  }, [ticketId]);

  async function reply(e: FormEvent) {
    e.preventDefault();
    if (!ticket || !body.trim()) return;
    setBusy("msg");
    try {
      await api.addPortalTicketMessage(ticket.id, body.trim());
      setBody("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Senden fehlgeschlagen");
    } finally {
      setBusy("");
    }
  }

  async function onFiles(list: FileList | File[] | null) {
    if (!ticket || !list?.length) return;
    setBusy("file");
    setError("");
    try {
      const results = await Promise.allSettled(
        Array.from(list).map((file) => api.uploadPortalTicketAttachment(ticket.id, file)),
      );
      if (results.some((r) => r.status === "rejected")) {
        setError("Mindestens ein Anhang konnte nicht hochgeladen werden.");
      }
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload fehlgeschlagen");
    } finally {
      setBusy("");
    }
  }

  function onDrag(e: DragEvent, over: boolean) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(over);
  }

  if (!ticket && !error) return <p className="empty">Lade Ticket…</p>;
  if (!ticket) {
    return (
      <div className="page">
        <p className="form-error">{error}</p>
        <Link to="/portal/tickets">Zurück</Link>
      </div>
    );
  }

  const closed = ticket.status === "closed";
  const waiting = ticket.status === "waiting_customer";

  return (
    <div className="page ticket-detail-page">
      <div className="breadcrumb">
        <Link to="/portal/tickets">Tickets</Link>
        <span>/</span>
        <span>{ticket.number}</span>
      </div>
      <header className="page-head">
        <div>
          <p className="eyebrow">{ticket.number}</p>
          <h2>{ticket.title}</h2>
          <p className="muted">
            {portalTicketStatusLabel[ticket.status]} · {ticketPriorityLabel[ticket.priority]}
            {ticket.slaResponseDueAt ? ` · Reaktion bis ${formatDate(ticket.slaResponseDueAt)}` : ""}
          </p>
        </div>
        <span className={`badge badge-ticket-${ticket.status}`}>{portalTicketStatusLabel[ticket.status]}</span>
      </header>
      {waiting ? (
        <p className="portal-ticket-banner panel">
          <strong>Ihre Rückmeldung ist gefragt.</strong> {portalTicketStatusHint.waiting_customer}
        </p>
      ) : (
        <p className="muted portal-ticket-status-line">{portalTicketStatusHint[ticket.status]}</p>
      )}
      {uploadWarn ? (
        <div className="form-error">
          Das Ticket ist angelegt, aber nicht alle Anhänge konnten hochgeladen werden. Bitte Dateien hier nachreichen.
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              const next = new URLSearchParams(params);
              next.delete("anhang");
              setParams(next, { replace: true });
            }}
          >
            Hinweis schließen
          </button>
        </div>
      ) : null}
      {error ? <p className="form-error">{error}</p> : null}
      <section className="panel ticket-thread">
        <h3>Verlauf</h3>
        {(ticket.messages ?? []).length ? (
          <ol className="ticket-messages">
            {(ticket.messages ?? []).map((m) => (
              <li key={m.id} className={`ticket-msg ${m.authorRole === "admin" ? "is-staff" : "is-customer"}`}>
                <header>
                  <strong>{m.authorRole === "admin" ? "Systemhaus" : "Sie"}</strong>
                  <time>{formatDate(m.createdAt)}</time>
                </header>
                <p>{m.body}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">Noch keine Nachrichten – sobald wir antworten, erscheint es hier.</p>
        )}
        {(ticket.attachments ?? []).length ? (
          <ul className="portal-file-chips">
            {(ticket.attachments ?? []).map((f) => (
              <li key={f.id}>
                <a href={`/api/portal/attachments/${f.id}/download`} download>
                  {f.originalName} <em>{formatBytes(f.size)}</em>
                </a>
              </li>
            ))}
          </ul>
        ) : null}
        {closed ? (
          <p className="muted">Dieses Ticket ist {ticket.status === "resolved" ? "gelöst" : "geschlossen"}.</p>
        ) : (
          <>
            <form className="stack-form" onSubmit={(e) => void reply(e)}>
              <label className="field">
                <span>Antwort</span>
                <textarea
                  rows={4}
                  placeholder="Ihre Nachricht an das Systemhaus"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  required
                />
              </label>
              <button className="btn btn-primary" type="submit" disabled={busy === "msg"}>
                {busy === "msg" ? "Senden…" : "Antwort senden"}
              </button>
            </form>
            <div className="field">
              <span>Weitere Dateien</span>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                disabled={busy === "file"}
                onChange={(e) => {
                  void onFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                className={`portal-ticket-drop${dragOver ? " is-over" : ""}`}
                disabled={busy === "file"}
                onClick={() => fileInputRef.current?.click()}
                onDragEnter={(e) => onDrag(e, true)}
                onDragOver={(e) => onDrag(e, true)}
                onDragLeave={(e) => onDrag(e, false)}
                onDrop={(e) => {
                  onDrag(e, false);
                  void onFiles(e.dataTransfer.files);
                }}
              >
                <strong>{busy === "file" ? "Wird hochgeladen…" : "Dateien hierher ziehen oder auswählen"}</strong>
                <span className="muted">Screenshots, PDF oder Office-Dateien</span>
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
