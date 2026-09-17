import { desc, eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import {
  contracts,
  tickets,
  type Contract,
  type Ticket,
  type TicketPriority,
  type TicketStatus,
} from "../db/schema.js";

const OPEN_STATUSES: TicketStatus[] = ["open", "in_progress", "waiting_customer"];

/**
 * Nächste Ticketnummer `T-1001`, `T-1002`, …
 */
export async function nextTicketNumber(db: Db): Promise<string> {
  const rows = await db.select({ number: tickets.number }).from(tickets).all();
  let max = 1000;
  for (const row of rows) {
    const match = /^T-(\d+)$/.exec(row.number);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `T-${max + 1}`;
}

function hoursForPriority(
  contract: Contract,
  priority: TicketPriority,
  kind: "response" | "resolve",
): number | null {
  const map: Record<TicketPriority, number | null> =
    kind === "response"
      ? {
          critical: contract.responseCriticalHours,
          high: contract.responseHighHours,
          normal: contract.responseNormalHours ?? contract.slaResponseHours,
          low: contract.responseLowHours,
        }
      : {
          critical: contract.resolveCriticalHours,
          high: contract.resolveHighHours,
          normal: contract.resolveNormalHours,
          low: contract.resolveLowHours,
        };
  const value = map[priority];
  return value != null && Number.isFinite(value) && value > 0 ? value : null;
}

export type SlaStamp = {
  contractId: string | null;
  slaResponseDueAt: Date | null;
  slaResolveDueAt: Date | null;
};

/**
 * Wählt den Vertrag und berechnet Kalenderstunden-Fälligkeiten.
 */
export function slaFromContract(
  contract: Contract | null | undefined,
  priority: TicketPriority,
  now: Date,
): SlaStamp {
  if (!contract) {
    return { contractId: null, slaResponseDueAt: null, slaResolveDueAt: null };
  }
  const responseHours = hoursForPriority(contract, priority, "response");
  const resolveHours = hoursForPriority(contract, priority, "resolve");
  return {
    contractId: contract.id,
    slaResponseDueAt: responseHours != null ? new Date(now.getTime() + responseHours * 3600_000) : null,
    slaResolveDueAt: resolveHours != null ? new Date(now.getTime() + resolveHours * 3600_000) : null,
  };
}

/**
 * Aktiver Vertrag des Kunden (neueste Änderung zuerst).
 */
export async function findActiveContract(db: Db, customerId: string, contractId?: string | null) {
  if (contractId) {
    const row = await db.select().from(contracts).where(eq(contracts.id, contractId)).get();
    if (row && row.customerId === customerId) return row;
  }
  const rows = await db
    .select()
    .from(contracts)
    .where(eq(contracts.customerId, customerId))
    .orderBy(desc(contracts.updatedAt))
    .all();
  return rows.find((c) => c.status === "active") ?? rows.find((c) => c.status === "paused") ?? null;
}

export function isOpenStatus(status: TicketStatus) {
  return OPEN_STATUSES.includes(status);
}

export function slaFlags(ticket: Ticket, now = new Date()) {
  const responseDue = ticket.slaResponseDueAt;
  const resolveDue = ticket.slaResolveDueAt;
  const responseBreached = Boolean(
    responseDue && !ticket.firstResponseAt && isOpenStatus(ticket.status) && now.getTime() > responseDue.getTime(),
  );
  const resolveBreached = Boolean(
    resolveDue &&
      !ticket.resolvedAt &&
      ticket.status !== "closed" &&
      ticket.status !== "resolved" &&
      now.getTime() > resolveDue.getTime(),
  );
  return { responseBreached, resolveBreached, slaBreached: responseBreached || resolveBreached };
}

export function timestampsForStatus(
  status: TicketStatus,
  existing: { resolvedAt: Date | null; closedAt: Date | null },
  now: Date,
) {
  let resolvedAt = existing.resolvedAt;
  let closedAt = existing.closedAt;
  if (status === "resolved") {
    resolvedAt = resolvedAt ?? now;
  } else if (status === "closed") {
    resolvedAt = resolvedAt ?? now;
    closedAt = closedAt ?? now;
  } else if (status === "open" || status === "in_progress" || status === "waiting_customer") {
    resolvedAt = null;
    closedAt = null;
  }
  return { resolvedAt, closedAt };
}
