import { useEffect, useState } from "react";
import type { TicketItem } from "../types";

export type SlaTone = "none" | "ok" | "soon" | "urgent" | "overdue" | "met";

export type SlaView = {
  kind: "response" | "resolve";
  title: string;
  headline: string;
  detail: string;
  tone: SlaTone;
  /** Fortschritt 0–100 seit Ticket-Eingang, sonst null. */
  percent: number | null;
};

/**
 * Tick für SLA-Restzeiten (30s).
 */
export function useSlaNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * Relative Zeitangabe, z. B. „vor 3 Std“.
 */
export function formatTimeAgo(value: string | Date, now = new Date()): string {
  const then = toDate(value);
  if (!then) return "";
  const delta = now.getTime() - then.getTime();
  if (delta < 45_000) return "gerade eben";
  if (delta < 0) return "in Kürze";
  const minutes = Math.round(delta / 60_000);
  if (minutes < 60) return `vor ${minutes} Min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `vor ${hours} Std`;
  const days = Math.round(hours / 24);
  if (days === 1) return "gestern";
  if (days < 14) return `vor ${days} Tagen`;
  return then.toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
}

/** Kurzes Datum mit Uhrzeit für SLA-Fälligkeiten. */
export function formatDueShort(value: string | Date, now = new Date()): string {
  const due = toDate(value);
  if (!due) return "–";
  const time = due.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  if (due.toDateString() === now.toDateString()) return `heute, ${time}`;
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (due.toDateString() === tomorrow.toDateString()) return `morgen, ${time}`;
  return due.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Reaktion- und Lösungsuhr für ein Ticket.
 */
export function ticketSlaViews(ticket: TicketItem, now = new Date()): { response: SlaView; resolve: SlaView } {
  const created = toDate(ticket.createdAt) ?? now;
  const responded = Boolean(ticket.firstResponseAt);
  const solved = ticket.status === "resolved" || ticket.status === "closed" || Boolean(ticket.resolvedAt);

  return {
    response: slaView({
      kind: "response",
      title: "Reaktion",
      dueAt: ticket.slaResponseDueAt,
      start: created,
      now,
      met: responded,
      metLabel: ticket.firstResponseAt
        ? `Reagiert ${formatTimeAgo(ticket.firstResponseAt, now)}`
        : "Reagiert",
      metDetail: ticket.firstResponseAt ? formatDueShort(ticket.firstResponseAt, now) : "",
    }),
    resolve: slaView({
      kind: "resolve",
      title: "Lösung",
      dueAt: ticket.slaResolveDueAt,
      start: created,
      now,
      met: solved,
      metLabel: ticket.status === "closed" ? "Geschlossen" : "Gelöst",
      metDetail: (ticket.resolvedAt || ticket.closedAt)
        ? formatDueShort(ticket.resolvedAt || ticket.closedAt || "", now)
        : "",
    }),
  };
}

/** Stärkster SLA-Ton eines Tickets (für Karten-Rahmen). */
export function ticketSlaTone(ticket: TicketItem, now = new Date()): SlaTone {
  const { response, resolve } = ticketSlaViews(ticket, now);
  const rank: SlaTone[] = ["overdue", "urgent", "soon", "ok", "met", "none"];
  return rank.find((tone) => response.tone === tone || resolve.tone === tone) ?? "none";
}

function slaView(opts: {
  kind: "response" | "resolve";
  title: string;
  dueAt: string | null | undefined;
  start: Date;
  now: Date;
  met: boolean;
  metLabel: string;
  metDetail: string;
}): SlaView {
  if (opts.met) {
    return {
      kind: opts.kind,
      title: opts.title,
      headline: opts.metLabel,
      detail: opts.metDetail || "SLA erfüllt",
      tone: "met",
      percent: 100,
    };
  }
  const due = toDate(opts.dueAt);
  if (!due) {
    return {
      kind: opts.kind,
      title: opts.title,
      headline: "Kein SLA",
      detail: "Kein Vertrag / keine Zeit hinterlegt",
      tone: "none",
      percent: null,
    };
  }

  const remaining = due.getTime() - opts.now.getTime();
  const span = due.getTime() - opts.start.getTime();
  const percent =
    span > 0 ? Math.min(100, Math.max(0, ((opts.now.getTime() - opts.start.getTime()) / span) * 100)) : null;
  const dueLabel = formatDueShort(due, opts.now);

  if (remaining <= 0) {
    return {
      kind: opts.kind,
      title: opts.title,
      headline: `seit ${formatDurationDe(-remaining)}`,
      detail: `überfällig · ${dueLabel}`,
      tone: "overdue",
      percent: 100,
    };
  }

  const tone: SlaTone = remaining < 60 * 60_000 ? "urgent" : remaining < 4 * 60 * 60_000 ? "soon" : "ok";
  return {
    kind: opts.kind,
    title: opts.title,
    headline: `noch ${formatDurationDe(remaining)}`,
    detail: `bis ${dueLabel}`,
    tone,
    percent,
  };
}

function formatDurationDe(ms: number): string {
  const totalMin = Math.max(1, Math.round(Math.abs(ms) / 60_000));
  if (totalMin < 60) return `${totalMin} Min`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours < 24) return mins ? `${hours} Std ${mins} Min` : `${hours} Std`;
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  const dayLabel = days === 1 ? "1 Tag" : `${days} Tage`;
  return remH ? `${dayLabel} ${remH} Std` : dayLabel;
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
