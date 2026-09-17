import { DocumentEditor } from "./DocumentEditor";
import { formatDate } from "../lib/labels";
import { EMPTY_DOC, richTextHasContent, richTextPlain, toEditorContent } from "../lib/richtext";
import { formatTimeAgo } from "../lib/tickets";
import type { TicketMessageItem } from "../types";
import { useRef, useState, type DragEvent, type ReactNode } from "react";

type TimelineProps = {
  messages: TicketMessageItem[];
  now?: Date;
  staffView?: boolean;
  emptyHint?: string;
  /** Ticket-Anlagezeit: die erste Nachricht dazu ist die Beschreibung, kein Kommentar. */
  ticketCreatedAt?: string;
};

/**
 * Ticket-Verlauf als vertikale Timeline (Staff und Portal).
 */
export function TicketTimeline({ messages, now, staffView = false, emptyHint, ticketCreatedAt }: TimelineProps) {
  const comments = messages.filter((m) => isTimelineComment(m, ticketCreatedAt));
  if (comments.length === 0) {
    return <p className="muted">{emptyHint ?? "Noch keine Kommentare."}</p>;
  }
  const clock = now ?? new Date();
  return (
    <ol className="ticket-timeline">
      {comments.map((m) => {
        const staff = m.authorRole === "admin";
        const internal = m.visibility === "internal";
        const who = staffView
          ? staff
            ? internal
              ? "Intern"
              : "Systemhaus"
            : "Kunde"
          : staff
            ? "Systemhaus"
            : "Sie";
        return (
          <li
            key={m.id}
            className={`ticket-tl-item${staff ? " is-staff" : " is-customer"}${internal ? " is-internal" : ""}`}
          >
            <span className="ticket-tl-dot" aria-hidden />
            <article className="ticket-tl-card">
              <header>
                <strong>{who}</strong>
                <time>
                  {formatTimeAgo(m.createdAt, clock)} · {formatDate(m.createdAt)}
                </time>
              </header>
              <TicketRichBody content={m.body} />
            </article>
          </li>
        );
      })}
    </ol>
  );
}

function isTimelineComment(message: TicketMessageItem, ticketCreatedAt?: string) {
  const kind = message.kind ?? "comment";
  if (kind === "resolution" || kind === "opener") return false;
  if (kind !== "comment" || message.visibility !== "public" || !ticketCreatedAt) return true;
  const created = new Date(message.createdAt).getTime();
  const opened = new Date(ticketCreatedAt).getTime();
  if (!Number.isFinite(created) || !Number.isFinite(opened)) return true;
  return Math.abs(created - opened) > 2000;
}

/**
 * Ticketkopf: Nummer, Titel und Beschreibung getrennt vom Verlauf.
 */
export function TicketBrief({
  number,
  title,
  description,
  badges,
  meta,
}: {
  number: string;
  title: string;
  description?: string | null;
  badges?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <section className="ticket-brief panel">
      <div className="ticket-brief-top">
        <span className="ticket-brief-num">{number}</span>
        {badges ? <div className="ticket-brief-badges">{badges}</div> : null}
      </div>
      <h1 className="ticket-brief-title">{title}</h1>
      <TicketDescription content={description} title={title} />
      {meta ? <dl className="ticket-brief-meta">{meta}</dl> : null}
    </section>
  );
}

/**
 * Anfragetext des Tickets (kein Timeline-Eintrag).
 */
export function TicketDescription({
  content,
  title,
}: {
  content: string | null | undefined;
  title?: string;
}) {
  if (!richTextHasContent(content)) return null;
  if (title && richTextPlain(content) === title.trim()) return null;
  return (
    <div className="ticket-brief-desc">
      <p className="ticket-brief-label">Beschreibung</p>
      <TicketRichBody content={content} />
    </div>
  );
}

/**
 * Gepinnte öffentliche Lösung (sichtbar für Kunden).
 */
export function TicketSolutionCard({
  resolution,
  resolvedAt,
  now,
}: {
  resolution: string | null | undefined;
  resolvedAt?: string | null;
  now?: Date;
}) {
  if (!richTextHasContent(resolution)) return null;
  const clock = now ?? new Date();
  return (
    <section className="ticket-solution panel">
      <header>
        <strong>Lösung</strong>
        {resolvedAt ? (
          <time>
            {formatTimeAgo(resolvedAt, clock)} · {formatDate(resolvedAt)}
          </time>
        ) : null}
      </header>
      <TicketRichBody content={resolution} />
    </section>
  );
}

/**
 * Kommentar-Editor mit TipTap. Staff: Umschalter Kunde / intern.
 */
export function TicketComposer({
  label,
  placeholder,
  submitLabel,
  busy = false,
  staffModes = false,
  onSubmit,
}: {
  label?: string;
  placeholder?: string;
  submitLabel?: string;
  busy?: boolean;
  staffModes?: boolean;
  onSubmit: (json: string, visibility: "public" | "internal") => Promise<void>;
}) {
  const [content, setContent] = useState(EMPTY_DOC);
  const [key, setKey] = useState(0);
  const [visibility, setVisibility] = useState<"public" | "internal">("public");
  const internal = staffModes && visibility === "internal";
  const hint = placeholder ?? (internal ? "Nur intern sichtbar…" : "Ihre Antwort an den Kunden…");
  const action = submitLabel ?? (internal ? "Notiz speichern" : "Antwort senden");
  const heading = label ?? (internal ? "Interne Notiz" : "Antwort an den Kunden");

  return (
    <form
      className={`stack-form ticket-composer${internal ? " is-internal" : ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (!richTextHasContent(content) || busy) return;
        void onSubmit(content, visibility).then(() => {
          setContent(EMPTY_DOC);
          setKey((n) => n + 1);
        });
      }}
    >
      <div className="ticket-composer-head">
        {staffModes ? (
          <div className="ticket-vis-seg" role="group" aria-label="Sichtbarkeit">
            <button
              type="button"
              className={visibility === "public" ? "is-active" : ""}
              aria-pressed={visibility === "public"}
              onClick={() => setVisibility("public")}
            >
              An den Kunden
            </button>
            <button
              type="button"
              className={`is-internal${visibility === "internal" ? " is-active" : ""}`}
              aria-pressed={visibility === "internal"}
              onClick={() => setVisibility("internal")}
            >
              Intern
            </button>
          </div>
        ) : (
          <span className="field-label">{heading}</span>
        )}
        {staffModes ? (
          <p className="muted ticket-composer-hint">
            {internal ? "Nicht im Kundenportal sichtbar." : "Der Kunde sieht diese Nachricht."}
          </p>
        ) : null}
      </div>
      <DocumentEditor
        key={key}
        content={content}
        onChange={setContent}
        variant="comment"
        placeholder={hint}
      />
      <button
        className={`btn ${internal ? "btn-ghost" : "btn-primary"}`}
        type="submit"
        disabled={busy || !richTextHasContent(content)}
      >
        {busy ? "Senden…" : action}
      </button>
    </form>
  );
}

/**
 * Datei-Dropzone für Ticket-Anhänge (Staff und Portal).
 */
export function TicketFileDrop({
  busy = false,
  onFiles,
}: {
  busy?: boolean;
  onFiles: (files: FileList | File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function onDrag(e: DragEvent, over: boolean) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(over);
  }

  return (
    <div className="field ticket-file-drop-field">
      <span className="field-label">Anhänge</span>
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        disabled={busy}
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        className={`portal-ticket-drop${dragOver ? " is-over" : ""}`}
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(e) => onDrag(e, true)}
        onDragOver={(e) => onDrag(e, true)}
        onDragLeave={(e) => onDrag(e, false)}
        onDrop={(e) => {
          onDrag(e, false);
          if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
        }}
      >
        <strong>{busy ? "Wird hochgeladen…" : "Dateien hierher ziehen oder auswählen"}</strong>
        <span className="muted">Screenshots, PDF oder Office-Dateien</span>
      </button>
    </div>
  );
}

function TicketRichBody({ content }: { content: string | null | undefined }) {
  return (
    <div className="ticket-rich">
      <DocumentEditor
        content={toEditorContent(content)}
        onChange={() => undefined}
        editable={false}
        variant="comment"
      />
    </div>
  );
}
