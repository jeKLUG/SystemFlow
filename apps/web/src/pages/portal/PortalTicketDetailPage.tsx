import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api";
import { formatDate, ticketPriorityLabel, ticketStatusLabel } from "../../lib/labels";
import type { TicketItem } from "../../types";

/**
 * Ticketdetail im Kundenportal (nur öffentliche Nachrichten).
 */
export function PortalTicketDetailPage() {
  const { ticketId = "" } = useParams();
  const [ticket, setTicket] = useState<TicketItem | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

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

  async function onFile(file: File | undefined) {
    if (!ticket || !file) return;
    setBusy("file");
    try {
      await api.uploadPortalTicketAttachment(ticket.id, file);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload fehlgeschlagen");
    } finally {
      setBusy("");
    }
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
            {ticketStatusLabel[ticket.status]} · {ticketPriorityLabel[ticket.priority]}
            {ticket.slaResponseDueAt ? ` · Reaktion bis ${formatDate(ticket.slaResponseDueAt)}` : ""}
          </p>
        </div>
      </header>
      {error ? <p className="form-error">{error}</p> : null}
      <section className="panel ticket-thread">
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
        {(ticket.attachments ?? []).length ? (
          <ul className="ticket-files">
            {(ticket.attachments ?? []).map((f) => (
              <li key={f.id}>
                <a href={`/api/portal/attachments/${f.id}/download`} download>
                  {f.originalName}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
        {closed ? (
          <p className="muted">Dieses Ticket ist geschlossen.</p>
        ) : (
          <>
            <form className="stack-form" onSubmit={(e) => void reply(e)}>
              <label className="field">
                <span>Antwort</span>
                <textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} required />
              </label>
              <button className="btn btn-primary" type="submit" disabled={busy === "msg"}>
                {busy === "msg" ? "Senden…" : "Senden"}
              </button>
            </form>
            <label className="field">
              <span>Anhang</span>
              <input type="file" onChange={(e) => void onFile(e.target.files?.[0])} disabled={busy === "file"} />
            </label>
          </>
        )}
      </section>
    </div>
  );
}
