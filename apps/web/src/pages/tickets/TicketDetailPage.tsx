import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api";
import { TicketSlaClocks } from "../../components/TicketSlaClocks";
import { customerDisplayName } from "../../lib/customer";
import { localTodayIso } from "../../lib/dates";
import { formatBytes } from "../../lib/files";
import { formatDate, ticketPriorityLabel, ticketStatusLabel } from "../../lib/labels";
import { formatTimeAgo, useSlaNow } from "../../lib/tickets";
import type { TicketItem, TicketPriority, TicketStatus } from "../../types";

/**
 * Staff-Ticketdetail: Dialog, interne Notizen, SLA, Aufgabe/Zeit.
 */
export function TicketDetailPage() {
  const { ticketId = "" } = useParams();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<TicketItem | null>(null);
  const [error, setError] = useState("");
  const [publicBody, setPublicBody] = useState("");
  const [internalBody, setInternalBody] = useState("");
  const [busy, setBusy] = useState("");
  const [hours, setHours] = useState("1");
  const now = useSlaNow();

  async function reload() {
    const row = await api.ticket(ticketId);
    setTicket(row);
  }

  useEffect(() => {
    void reload().catch((err) => {
      setError(err instanceof Error ? err.message : "Ticket nicht gefunden");
      setTicket(null);
    });
  }, [ticketId]);

  async function patch(body: Record<string, unknown>) {
    if (!ticket) return;
    setBusy("patch");
    setError("");
    try {
      setTicket(await api.updateTicket(ticket.id, body));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    } finally {
      setBusy("");
    }
  }

  async function send(visibility: "public" | "internal", e: FormEvent) {
    e.preventDefault();
    if (!ticket) return;
    const body = visibility === "public" ? publicBody : internalBody;
    if (!body.trim()) return;
    setBusy(visibility);
    setError("");
    try {
      await api.addTicketMessage(ticket.id, body.trim(), visibility);
      if (visibility === "public") setPublicBody("");
      else setInternalBody("");
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
      await api.uploadTicketAttachment(ticket.id, file);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload fehlgeschlagen");
    } finally {
      setBusy("");
    }
  }

  async function makeTask() {
    if (!ticket) return;
    setBusy("task");
    try {
      const task = await api.createTaskFromTicket(ticket.id);
      navigate(`/customers/${ticket.customerId}/tasks`);
      void task;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Aufgabe fehlgeschlagen");
    } finally {
      setBusy("");
    }
  }

  async function makeTime(e: FormEvent) {
    e.preventDefault();
    if (!ticket) return;
    const value = Number(hours.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) {
      setError("Stunden angeben");
      return;
    }
    setBusy("time");
    try {
      await api.createTimeFromTicket(ticket.id, { hours: value, workDate: localTodayIso() });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Zeitbuchung fehlgeschlagen");
    } finally {
      setBusy("");
    }
  }

  if (!ticket && !error) return <div className="boot">Lade Ticket…</div>;
  if (!ticket) {
    return (
      <div className="page">
        <p className="form-error">{error}</p>
        <Link to="/tickets">Zurück zur Queue</Link>
      </div>
    );
  }

  const messages = ticket.messages ?? [];
  const files = ticket.attachments ?? [];
  const customer = customerDisplayName({
    name: ticket.customerName ?? "",
    company: ticket.customerCompany ?? null,
  });
  const clockNow = new Date(now);

  return (
    <div className="page ticket-detail-page">
      <div className="breadcrumb">
        <Link to="/tickets">Tickets</Link>
        <span>/</span>
        <Link to={`/customers/${ticket.customerId}`}>{customer}</Link>
        <span>/</span>
        <span>{ticket.number}</span>
      </div>

      <header className="page-head">
        <div>
          <p className="eyebrow">{ticket.number}</p>
          <h2>{ticket.title}</h2>
          <p className="muted">
            {customer}
            {" · "}
            {ticket.source === "portal" ? "vom Portal" : "intern angelegt"}
            {" · Eingegangen "}
            {formatTimeAgo(ticket.createdAt, clockNow)}
            {" · "}
            {formatDate(ticket.createdAt)}
          </p>
        </div>
        <span className={`badge badge-ticket-${ticket.status}`}>{ticketStatusLabel[ticket.status]}</span>
      </header>

      <TicketSlaClocks ticket={ticket} now={now} />

      {error ? <p className="form-error">{error}</p> : null}

      <div className="ticket-detail-grid">
        <section className="panel ticket-thread">
          <h3>Verlauf</h3>
          {messages.length === 0 ? (
            <p className="muted">{ticket.description || "Noch keine Nachrichten."}</p>
          ) : (
            <ol className="ticket-messages">
              {messages.map((m) => (
                <li
                  key={m.id}
                  className={`ticket-msg${m.visibility === "internal" ? " is-internal" : ""}${
                    m.authorRole === "admin" ? " is-staff" : " is-customer"
                  }`}
                >
                  <header>
                    <strong>
                      {m.authorRole === "admin" ? "Systemhaus" : "Kunde"}
                      {m.visibility === "internal" ? " · intern" : ""}
                    </strong>
                    <time>
                      {formatTimeAgo(m.createdAt, clockNow)} · {formatDate(m.createdAt)}
                    </time>
                  </header>
                  <p>{m.body}</p>
                </li>
              ))}
            </ol>
          )}

          {files.length ? (
            <ul className="portal-file-chips">
              {files.map((f) => (
                <li key={f.id}>
                  <a href={`/api/tickets/${ticket.id}/attachments/${f.id}/download`} download>
                    {f.originalName} <em>{formatBytes(f.size)}</em>
                  </a>
                </li>
              ))}
            </ul>
          ) : null}

          <form className="stack-form" onSubmit={(e) => void send("public", e)}>
            <label className="field">
              <span>Antwort an den Kunden</span>
              <textarea
                rows={4}
                value={publicBody}
                onChange={(e) => setPublicBody(e.target.value)}
                required
              />
            </label>
            <button className="btn btn-primary" type="submit" disabled={busy === "public"}>
              {busy === "public" ? "Senden…" : "Antwort senden"}
            </button>
          </form>

          <form className="stack-form" onSubmit={(e) => void send("internal", e)}>
            <label className="field">
              <span>Interne Notiz (nicht im Portal)</span>
              <textarea
                rows={3}
                value={internalBody}
                onChange={(e) => setInternalBody(e.target.value)}
                required
              />
            </label>
            <button className="btn btn-ghost" type="submit" disabled={busy === "internal"}>
              {busy === "internal" ? "Speichern…" : "Notiz speichern"}
            </button>
          </form>

          <label className="field">
            <span>Anhang</span>
            <input
              type="file"
              onChange={(e) => void onFile(e.target.files?.[0])}
              disabled={busy === "file"}
            />
          </label>
        </section>

        <aside className="panel ticket-side">
          <label className="field">
            <span>Status</span>
            <select
              value={ticket.status}
              disabled={busy === "patch"}
              onChange={(e) => void patch({ status: e.target.value as TicketStatus })}
            >
              {(Object.keys(ticketStatusLabel) as TicketStatus[]).map((s) => (
                <option key={s} value={s}>
                  {ticketStatusLabel[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Priorität</span>
            <select
              value={ticket.priority}
              disabled={busy === "patch"}
              onChange={(e) => void patch({ priority: e.target.value as TicketPriority })}
            >
              {(Object.keys(ticketPriorityLabel) as TicketPriority[]).map((p) => (
                <option key={p} value={p}>
                  {ticketPriorityLabel[p]}
                </option>
              ))}
            </select>
          </label>
          <dl className="ticket-sla">
            <div>
              <dt>Eingegangen</dt>
              <dd>
                {formatDate(ticket.createdAt)}
                <span className="muted"> · {formatTimeAgo(ticket.createdAt, clockNow)}</span>
              </dd>
            </div>
            <div>
              <dt>Letzte Änderung</dt>
              <dd>
                {formatDate(ticket.updatedAt)}
                <span className="muted"> · {formatTimeAgo(ticket.updatedAt, clockNow)}</span>
              </dd>
            </div>
            <div>
              <dt>Erste Reaktion</dt>
              <dd>
                {ticket.firstResponseAt
                  ? `${formatDate(ticket.firstResponseAt)} · ${formatTimeAgo(ticket.firstResponseAt, clockNow)}`
                  : "steht noch aus"}
              </dd>
            </div>
            <div>
              <dt>Verknüpft</dt>
              <dd>
                {ticket.linkedTaskCount ?? 0} Aufgaben · {ticket.linkedTimeCount ?? 0} Zeiten
              </dd>
            </div>
          </dl>
          <button type="button" className="btn btn-ghost" onClick={() => void makeTask()} disabled={busy === "task"}>
            {busy === "task" ? "…" : "Aufgabe anlegen"}
          </button>
          <form className="stack-form" onSubmit={(e) => void makeTime(e)}>
            <label className="field">
              <span>Zeit buchen (Stunden)</span>
              <input value={hours} onChange={(e) => setHours(e.target.value)} inputMode="decimal" />
            </label>
            <button className="btn btn-ghost" type="submit" disabled={busy === "time"}>
              {busy === "time" ? "…" : "Zeit speichern"}
            </button>
          </form>
          <Link className="btn btn-ghost" to={`/customers/${ticket.customerId}`}>
            Zur Kundenakte
          </Link>
        </aside>
      </div>
    </div>
  );
}
