import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api";
import { DocumentEditor } from "../../components/DocumentEditor";
import { Modal } from "../../components/Modal";
import { TicketSlaClocks } from "../../components/TicketSlaClocks";
import { TicketComposer, TicketFileDrop, TicketBrief, TicketSolutionCard, TicketTimeline } from "../../components/TicketTimeline";
import { customerDisplayName } from "../../lib/customer";
import { localTodayIso } from "../../lib/dates";
import { formatBytes } from "../../lib/files";
import { formatDate, ticketPriorityLabel, ticketStatusLabel } from "../../lib/labels";
import { EMPTY_DOC, richTextHasContent } from "../../lib/richtext";
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
  const [busy, setBusy] = useState("");
  const [hours, setHours] = useState("1");
  const [pendingStatus, setPendingStatus] = useState<TicketStatus | null>(null);
  const [resolutionDraft, setResolutionDraft] = useState(EMPTY_DOC);
  const [resolutionKey, setResolutionKey] = useState(0);
  const [resolutionError, setResolutionError] = useState("");
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

  async function send(visibility: "public" | "internal", body: string) {
    if (!ticket) return;
    setBusy("msg");
    setError("");
    try {
      await api.addTicketMessage(ticket.id, body, visibility);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Senden fehlgeschlagen");
      throw err;
    } finally {
      setBusy("");
    }
  }

  function onStatusChange(next: TicketStatus) {
    if (!ticket) return;
    if ((next === "closed" || next === "resolved") && ticket.status !== next) {
      setPendingStatus(next);
      setResolutionDraft(ticket.resolution || EMPTY_DOC);
      setResolutionKey((n) => n + 1);
      setResolutionError("");
      return;
    }
    void patch({ status: next });
  }

  async function confirmClose() {
    if (!pendingStatus || !richTextHasContent(resolutionDraft)) {
      setResolutionError("Bitte die Lösung dokumentieren.");
      return;
    }
    setBusy("patch");
    setError("");
    setResolutionError("");
    try {
      setTicket(await api.updateTicket(ticket!.id, { status: pendingStatus, resolution: resolutionDraft }));
      setPendingStatus(null);
    } catch (err) {
      setResolutionError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
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
        Array.from(list).map((file) => api.uploadTicketAttachment(ticket.id, file)),
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

      <TicketBrief
        number={ticket.number}
        title={ticket.title}
        description={ticket.description}
        badges={
          <>
            <span className={`badge badge-ticket-${ticket.status}`}>{ticketStatusLabel[ticket.status]}</span>
            <span className={`badge badge-prio-${ticket.priority}`}>{ticketPriorityLabel[ticket.priority]}</span>
          </>
        }
        meta={
          <>
            <div>
              <dt>Kunde</dt>
              <dd>
                <Link to={`/customers/${ticket.customerId}`}>{customer}</Link>
              </dd>
            </div>
            <div>
              <dt>Quelle</dt>
              <dd>{ticket.source === "portal" ? "Kundenportal" : "Intern angelegt"}</dd>
            </div>
            <div>
              <dt>Eingegangen</dt>
              <dd>
                {formatTimeAgo(ticket.createdAt, clockNow)}
                <span className="muted"> · {formatDate(ticket.createdAt)}</span>
              </dd>
            </div>
          </>
        }
      />

      <TicketSlaClocks ticket={ticket} now={now} />

      {error ? <p className="form-error">{error}</p> : null}

      <div className="ticket-detail-grid">
        <section className="panel ticket-thread">
          <h3>Verlauf</h3>
          <TicketSolutionCard
            resolution={ticket.resolution}
            resolvedAt={ticket.resolvedAt ?? ticket.closedAt}
            now={clockNow}
          />
          <TicketTimeline
            messages={messages}
            now={clockNow}
            staffView
            ticketCreatedAt={ticket.createdAt}
            emptyHint="Noch keine Kommentare."
          />

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

          <TicketComposer
            staffModes
            busy={busy === "msg"}
            onSubmit={(body, visibility) => send(visibility, body)}
          />
          <TicketFileDrop busy={busy === "file"} onFiles={onFiles} />
        </section>

        <aside className="panel ticket-side">
          <label className="field">
            <span>Status</span>
            <select
              value={ticket.status}
              disabled={busy === "patch"}
              onChange={(e) => onStatusChange(e.target.value as TicketStatus)}
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

      <Modal
        open={pendingStatus !== null}
        title="Lösung dokumentieren"
        onClose={() => setPendingStatus(null)}
        className="modal-wide"
        showCloseButton={false}
        closeOnBackdrop={false}
      >
        <p className="muted ticket-resolution-hint">
          Beim Schließen oder Lösen muss eine Lösung festgehalten werden. Der Kunde sieht sie im Portal.
        </p>
        {resolutionError ? <p className="form-error">{resolutionError}</p> : null}
        <DocumentEditor
          key={resolutionKey}
          content={resolutionDraft}
          onChange={setResolutionDraft}
          variant="comment"
          placeholder="Was war die Ursache, was wurde gemacht, wie ist der Stand?"
        />
        <div className="form-actions modal-actions ticket-resolution-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setPendingStatus(null)}>
            Abbrechen
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy === "patch" || !richTextHasContent(resolutionDraft)}
            onClick={() => void confirmClose()}
          >
            {busy === "patch"
              ? "Speichern…"
              : pendingStatus === "closed"
                ? "Lösung speichern und schließen"
                : "Lösung speichern und lösen"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
