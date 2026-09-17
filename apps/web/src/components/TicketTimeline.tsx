import { DocumentEditor } from "./DocumentEditor";
import { formatDate } from "../lib/labels";
import { EMPTY_DOC, richTextHasContent, toEditorContent } from "../lib/richtext";
import { formatTimeAgo } from "../lib/tickets";
import type { TicketMessageItem } from "../types";
import { useState } from "react";

type TimelineProps = {
  messages: TicketMessageItem[];
  now?: Date;
  staffView?: boolean;
  emptyHint?: string;
};

/**
 * Ticket-Verlauf als vertikale Timeline (Staff und Portal).
 */
export function TicketTimeline({ messages, now, staffView = false, emptyHint }: TimelineProps) {
  const comments = messages.filter((m) => (m.kind ?? "comment") !== "resolution");
  if (comments.length === 0) {
    return <p className="muted">{emptyHint ?? "Noch keine Nachrichten."}</p>;
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
 * Kommentar-Editor mit TipTap.
 */
export function TicketComposer({
  label,
  placeholder,
  submitLabel,
  busy = false,
  tone = "primary",
  onSubmit,
}: {
  label: string;
  placeholder: string;
  submitLabel: string;
  busy?: boolean;
  tone?: "primary" | "ghost";
  onSubmit: (json: string) => Promise<void>;
}) {
  const [content, setContent] = useState(EMPTY_DOC);
  const [key, setKey] = useState(0);

  return (
    <form
      className={`stack-form ticket-composer${tone === "ghost" ? " is-internal" : ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (!richTextHasContent(content) || busy) return;
        void onSubmit(content).then(() => {
          setContent(EMPTY_DOC);
          setKey((n) => n + 1);
        });
      }}
    >
      <span className="field-label">{label}</span>
      <DocumentEditor
        key={key}
        content={content}
        onChange={setContent}
        variant="comment"
        placeholder={placeholder}
      />
      <button
        className={`btn ${tone === "ghost" ? "btn-ghost" : "btn-primary"}`}
        type="submit"
        disabled={busy || !richTextHasContent(content)}
      >
        {busy ? "Senden…" : submitLabel}
      </button>
    </form>
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
