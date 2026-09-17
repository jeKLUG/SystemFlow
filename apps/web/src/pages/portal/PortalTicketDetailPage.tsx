import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../../api";
import {
  TicketBrief,
  TicketComposer,
  TicketFileDrop,
  TicketSolutionCard,
  TicketTimeFact,
  TicketTimeline,
} from "../../components/TicketTimeline";
import { TicketSlaClocks } from "../../components/TicketSlaClocks";
import { portalTicketStatusHint, portalTicketStatusLabel, ticketPriorityLabel } from "../../lib/labels";
import { useSlaNow } from "../../lib/tickets";
import type { TicketItem } from "../../types";

/**
 * Ticketdetail im Kundenportal (nur öffentliche Nachrichten).
 */
export function PortalTicketDetailPage() {
  const { ticketId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const [ticket, setTicket] = useState<TicketItem | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const now = useSlaNow();
  const uploadWarn = params.get("anhang") === "teilweise";

  async function reload() {
    setTicket(await api.portalTicket(ticketId));
  }

  useEffect(() => {
    void reload().catch((err) => setError(err instanceof Error ? err.message : "Nicht gefunden"));
  }, [ticketId]);

  async function reply(body: string) {
    if (!ticket) return;
    setBusy("msg");
    setError("");
    try {
      await api.addPortalTicketMessage(ticket.id, body);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Senden fehlgeschlagen");
      throw err;
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
  const clockNow = new Date(now);

  return (
    <div className="page ticket-detail-page">
      <div className="breadcrumb">
        <Link to="/portal/tickets">Tickets</Link>
        <span>/</span>
        <span>{ticket.number}</span>
      </div>
      <TicketBrief
        number={ticket.number}
        title={ticket.title}
        description={ticket.description}
        badges={
          <>
            <span className={`badge badge-ticket-${ticket.status}`}>{portalTicketStatusLabel[ticket.status]}</span>
            <span className={`badge badge-prio-${ticket.priority}`}>{ticketPriorityLabel[ticket.priority]}</span>
          </>
        }
        meta={
          <>
            <TicketTimeFact label="Eingegangen" at={ticket.createdAt} now={clockNow} />
            {Math.abs(new Date(ticket.updatedAt).getTime() - new Date(ticket.createdAt).getTime()) > 60_000 ? (
              <TicketTimeFact label="Aktualisiert" at={ticket.updatedAt} now={clockNow} />
            ) : null}
            {ticket.firstResponseAt ? (
              <TicketTimeFact label="Erste Antwort" at={ticket.firstResponseAt} now={clockNow} />
            ) : ticket.status === "open" || ticket.status === "in_progress" || ticket.status === "waiting_customer" ? (
              <div>
                <dt>Erste Antwort</dt>
                <dd>
                  <strong>steht aus</strong>
                </dd>
              </div>
            ) : null}
            {ticket.resolvedAt || ticket.closedAt ? (
              <TicketTimeFact
                label={ticket.status === "closed" ? "Geschlossen" : "Gelöst"}
                at={ticket.resolvedAt || ticket.closedAt || ""}
                now={clockNow}
              />
            ) : null}
          </>
        }
      />
      {ticket.slaResponseDueAt || ticket.slaResolveDueAt ? (
        <TicketSlaClocks ticket={ticket} now={now} />
      ) : null}
      {waiting ? (
        <p className="portal-ticket-banner panel">
          <strong>Ihre Rückmeldung ist gefragt.</strong> {portalTicketStatusHint.waiting_customer}
        </p>
      ) : null}
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
        <TicketSolutionCard
          resolution={ticket.resolution}
          resolvedAt={ticket.resolvedAt ?? ticket.closedAt}
          now={clockNow}
        />
        {closed ? (
          <>
            <TicketFileDrop
              attachments={ticket.attachments ?? []}
              hrefFor={(f) => `/api/portal/attachments/${f.id}/download`}
            />
            <p className="muted">Dieses Ticket ist geschlossen.</p>
          </>
        ) : (
          <>
            <TicketFileDrop
              busy={busy === "file"}
              attachments={ticket.attachments ?? []}
              hrefFor={(f) => `/api/portal/attachments/${f.id}/download`}
              onFiles={onFiles}
            />
            <TicketComposer
              label="Antwort"
              placeholder="Ihre Nachricht an das Systemhaus…"
              submitLabel="Antwort senden"
              busy={busy === "msg"}
              onSubmit={reply}
            />
          </>
        )}
        <h3>Verlauf</h3>
        <TicketTimeline
          messages={ticket.messages ?? []}
          now={clockNow}
          ticketCreatedAt={ticket.createdAt}
          emptyHint="Noch keine Kommentare – sobald wir antworten, erscheint es hier."
        />
      </section>
    </div>
  );
}
