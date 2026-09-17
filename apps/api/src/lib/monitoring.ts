import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import type { Db } from "../db/index.js";
import {
  assets,
  customers,
  monitoringAgents,
  monitoringIssueKinds,
  monitoringSamples,
  orgSettings,
  ticketMessages,
  tickets,
  users,
  type Asset,
  type MonitoringAgent,
  type MonitoringIssueKind,
  type TicketPriority,
  type TicketStatus,
} from "../db/schema.js";
import { addActivity } from "../routes/activities.js";
import { createId } from "./id.js";
import { findActiveContract, isOpenStatus, nextTicketNumber, slaFromContract } from "./tickets.js";

export const MONITORING_OFFLINE_MS = 2 * 60 * 1000;
export const MONITORING_SAMPLE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const CPU_HIGH_PCT = 90;
export const RAM_HIGH_PCT = 90;
export const DISK_FREE_MIN_PCT = 10;
export const STREAK_MINUTES = 5;
const SETTINGS_ID = "default";

export const monitoringIssueLabel: Record<MonitoringIssueKind, string> = {
  offline: "Offline",
  disk: "Datenträger voll",
  cpu: "CPU hoch",
  ram: "RAM hoch",
  eventlog: "Ereignisprotokoll",
  updates: "Updates ausstehend",
};

export type DiskSnapshot = {
  name: string;
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
};

export type NicSnapshot = {
  name: string;
  bytesRecv: number;
  bytesSent: number;
  up?: boolean;
};

export type ProcessSnapshot = {
  name: string;
  cpuPercent?: number;
  rssBytes?: number;
};

export type EventSnapshot = {
  source?: string;
  level?: string;
  time?: string;
  message: string;
};

export type AgentSnapshot = {
  hostname?: string;
  os?: string;
  osVersion?: string;
  arch?: string;
  uptimeSec?: number;
  agentVersion?: string;
  ip?: string;
  ips?: string[];
  mac?: string;
  cpuPercent?: number | null;
  ramUsedBytes?: number | null;
  ramTotalBytes?: number | null;
  disks?: DiskSnapshot[];
  nics?: NicSnapshot[];
  processes?: ProcessSnapshot[];
  updates?: { pendingCount?: number; lastInstalled?: string | null };
  events?: EventSnapshot[];
};

/**
 * SHA-256-Hash eines Agent-Tokens (hex).
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Vergleicht zwei Hashes in konstanter Zeit.
 */
export function hashesEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Neues Geräte-Token für den Agenten. */
export function newAgentToken(): string {
  return `mon_${randomBytes(24).toString("hex")}`;
}

/** Enrollment-Key, den Staff in der Agent-Config hinterlegt. */
export function newEnrollmentKey(): string {
  return `enr_${randomBytes(18).toString("hex")}`;
}

export function parseIssues(raw: string | null | undefined): MonitoringIssueKind[] {
  try {
    const parsed = JSON.parse(raw || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is MonitoringIssueKind =>
      monitoringIssueKinds.includes(x as MonitoringIssueKind),
    );
  } catch {
    return [];
  }
}

export function serializeIssues(issues: MonitoringIssueKind[]): string {
  return JSON.stringify([...new Set(issues)]);
}

export function isAgentOnline(lastSeenAt: Date | null | undefined, now = new Date()): boolean {
  if (!lastSeenAt) return false;
  return now.getTime() - lastSeenAt.getTime() <= MONITORING_OFFLINE_MS;
}

export function usedPct(used: number, total: number): number | null {
  if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) return null;
  return Math.max(0, Math.min(100, (used / total) * 100));
}

export function worstDiskUsedPct(disks: DiskSnapshot[] | undefined): number | null {
  if (!disks?.length) return null;
  let worst: number | null = null;
  for (const disk of disks) {
    const pct =
      disk.totalBytes > 0
        ? usedPct(disk.usedBytes, disk.totalBytes)
        : disk.freeBytes >= 0 && disk.totalBytes > 0
          ? usedPct(disk.totalBytes - disk.freeBytes, disk.totalBytes)
          : null;
    if (pct == null) continue;
    if (worst == null || pct > worst) worst = pct;
  }
  return worst;
}

function nicTotals(nics: NicSnapshot[] | undefined): { rx: number | null; tx: number | null } {
  if (!nics?.length) return { rx: null, tx: null };
  let rx = 0;
  let tx = 0;
  for (const nic of nics) {
    rx += Number(nic.bytesRecv) || 0;
    tx += Number(nic.bytesSent) || 0;
  }
  return { rx, tx };
}

/**
 * Schwellwerte aus dem letzten Heartbeat (ohne Offline).
 */
export function evaluateHeartbeatIssues(
  snapshot: AgentSnapshot,
  agent: Pick<MonitoringAgent, "cpuHighStreak" | "ramHighStreak">,
): {
  issues: MonitoringIssueKind[];
  cpuHighStreak: number;
  ramHighStreak: number;
} {
  const issues: MonitoringIssueKind[] = [];
  const cpu = snapshot.cpuPercent;
  const cpuHighStreak =
    cpu != null && Number.isFinite(cpu) && cpu > CPU_HIGH_PCT ? agent.cpuHighStreak + 1 : 0;
  if (cpuHighStreak >= STREAK_MINUTES) issues.push("cpu");

  const ramPct = usedPct(snapshot.ramUsedBytes ?? 0, snapshot.ramTotalBytes ?? 0);
  const ramHighStreak =
    ramPct != null && ramPct > RAM_HIGH_PCT ? agent.ramHighStreak + 1 : 0;
  if (ramHighStreak >= STREAK_MINUTES) issues.push("ram");

  const diskPct = worstDiskUsedPct(snapshot.disks);
  if (diskPct != null && diskPct >= 100 - DISK_FREE_MIN_PCT) issues.push("disk");

  if ((snapshot.events ?? []).some((ev) => (ev.level || "error").toLowerCase() !== "warning")) {
    if ((snapshot.events ?? []).length > 0) issues.push("eventlog");
  }

  if ((snapshot.updates?.pendingCount ?? 0) > 0) issues.push("updates");

  return { issues, cpuHighStreak, ramHighStreak };
}

function issuePriority(issues: MonitoringIssueKind[]): TicketPriority {
  if (issues.includes("offline") || issues.includes("disk")) return "high";
  if (issues.includes("cpu") || issues.includes("ram") || issues.includes("eventlog")) return "normal";
  return "low";
}

function issueTitle(deviceName: string, issues: MonitoringIssueKind[]): string {
  const head = issues[0] ? monitoringIssueLabel[issues[0]] : "Problem";
  return `[Monitoring] ${deviceName} — ${head}`;
}

function issueDescription(deviceName: string, issues: MonitoringIssueKind[]): string {
  const lines = issues.map((k) => `• ${monitoringIssueLabel[k]}`);
  return `Automatische Monitoring-Meldung für ${deviceName}:\n${lines.join("\n")}`;
}

function plainDoc(text: string): string {
  return JSON.stringify({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  });
}

async function adminUserId(db: Db): Promise<string | null> {
  const row = await db.select({ id: users.id }).from(users).limit(1).get();
  return row?.id ?? null;
}

function issuesEqual(a: MonitoringIssueKind[], b: MonitoringIssueKind[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort().join(",");
  const sb = [...b].sort().join(",");
  return sa === sb;
}

/**
 * Öffnet oder schließt das eine Monitoring-Ticket passend zu den aktuellen Problemen.
 */
export async function syncMonitoringTicket(
  db: Db,
  agent: MonitoringAgent,
  issues: MonitoringIssueKind[],
  alertEnabled: boolean,
  deviceName: string,
): Promise<string | null> {
  const now = new Date();
  const authorId = await adminUserId(db);
  if (!authorId || !agent.customerId) return agent.openTicketId;

  const shouldAlert = alertEnabled && issues.length > 0;
  let openTicketId = agent.openTicketId;

  if (openTicketId) {
    const ticket = await db.select().from(tickets).where(eq(tickets.id, openTicketId)).get();
    if (!ticket || !isOpenStatus(ticket.status)) {
      openTicketId = null;
    }
  }

  if (!shouldAlert) {
    if (!openTicketId) return null;
    const ticket = await db.select().from(tickets).where(eq(tickets.id, openTicketId)).get();
    if (ticket && isOpenStatus(ticket.status)) {
      const resolution = plainDoc(
        alertEnabled
          ? "Gerät wieder erreichbar. Schwellwerte wieder im Normalbereich."
          : "Warnung am Gerät deaktiviert.",
      );
      await db
        .update(tickets)
        .set({
          status: "closed" as TicketStatus,
          resolution,
          resolvedAt: ticket.resolvedAt ?? now,
          closedAt: now,
          updatedAt: now,
        })
        .where(eq(tickets.id, ticket.id));
      await db.insert(ticketMessages).values({
        id: createId("tmsg"),
        ticketId: ticket.id,
        visibility: "public",
        kind: "resolution",
        authorRole: "admin",
        authorUserId: authorId,
        body: resolution,
        createdAt: now,
      });
      await addActivity(
        db,
        ticket.customerId,
        `Ticket ${ticket.number} geschlossen`,
        ticket.title,
        now,
      );
    }
    return null;
  }

  if (openTicketId) {
    const ticket = await db.select().from(tickets).where(eq(tickets.id, openTicketId)).get();
    if (ticket) {
      const prev = parseIssues(agent.currentIssuesJson);
      if (!issuesEqual(prev, issues)) {
        const title = issueTitle(deviceName, issues);
        await db
          .update(tickets)
          .set({
            title,
            description: issueDescription(deviceName, issues),
            priority: issuePriority(issues),
            updatedAt: now,
          })
          .where(eq(tickets.id, ticket.id));
        await db.insert(ticketMessages).values({
          id: createId("tmsg"),
          ticketId: ticket.id,
          visibility: "internal",
          kind: "comment",
          authorRole: "admin",
          authorUserId: authorId,
          body: plainDoc(`Aktualisiert: ${issues.map((k) => monitoringIssueLabel[k]).join(", ")}`),
          createdAt: now,
        });
      }
      return ticket.id;
    }
  }

  const contract = await findActiveContract(db, agent.customerId);
  const priority = issuePriority(issues);
  const sla = slaFromContract(contract, priority, now);
  const title = issueTitle(deviceName, issues);
  const row = {
    id: createId("tkt"),
    number: await nextTicketNumber(db),
    customerId: agent.customerId,
    title,
    description: issueDescription(deviceName, issues),
    status: "open" as TicketStatus,
    priority,
    source: "monitoring" as const,
    contractId: sla.contractId,
    createdByRole: "admin" as const,
    createdByUserId: authorId,
    firstResponseAt: null as Date | null,
    resolvedAt: null as Date | null,
    closedAt: null as Date | null,
    slaResponseDueAt: sla.slaResponseDueAt,
    slaResolveDueAt: sla.slaResolveDueAt,
    resolution: null as string | null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(tickets).values(row);
  await addActivity(db, agent.customerId, `Ticket ${row.number} angelegt`, row.title, now);
  return row.id;
}

export async function ensureEnrollmentKey(db: Db): Promise<string> {
  const existing = await db.select().from(orgSettings).where(eq(orgSettings.id, SETTINGS_ID)).get();
  if (existing?.monitoringEnrollmentKey) return existing.monitoringEnrollmentKey;
  const key = newEnrollmentKey();
  const now = new Date();
  if (existing) {
    await db
      .update(orgSettings)
      .set({ monitoringEnrollmentKey: key, updatedAt: now })
      .where(eq(orgSettings.id, SETTINGS_ID));
  } else {
    await db.insert(orgSettings).values({
      id: SETTINGS_ID,
      defaultHourlyRate: null,
      currency: "EUR",
      defaultVatPercent: 19,
      invoiceNote: null,
      monitoringEnrollmentKey: key,
      updatedAt: now,
    });
  }
  return key;
}

export async function rotateEnrollmentKey(db: Db): Promise<string> {
  await ensureEnrollmentKey(db);
  const key = newEnrollmentKey();
  await db
    .update(orgSettings)
    .set({ monitoringEnrollmentKey: key, updatedAt: new Date() })
    .where(eq(orgSettings.id, SETTINGS_ID));
  return key;
}

export function primaryIp(snapshot: AgentSnapshot): string | null {
  const ip = snapshot.ip?.trim();
  if (ip) return ip;
  const first = snapshot.ips?.find((x) => x && !x.startsWith("127.") && x !== "::1");
  return first ?? snapshot.ips?.[0] ?? null;
}

export function sampleFromSnapshot(snapshot: AgentSnapshot, agentId: string, now: Date) {
  const ramPct = usedPct(snapshot.ramUsedBytes ?? 0, snapshot.ramTotalBytes ?? 0);
  const diskUsedPct = worstDiskUsedPct(snapshot.disks);
  const net = nicTotals(snapshot.nics);
  return {
    id: createId("msmp"),
    agentId,
    ts: now,
    cpuPct: snapshot.cpuPercent ?? null,
    ramPct,
    diskUsedPct,
    netRxBytes: net.rx,
    netTxBytes: net.tx,
  };
}

export async function pruneMonitoringSamples(db: Db, now = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - MONITORING_SAMPLE_RETENTION_MS);
  await db.delete(monitoringSamples).where(lt(monitoringSamples.ts, cutoff));
}

export function parseSnapshot(raw: string | null | undefined): AgentSnapshot | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AgentSnapshot;
  } catch {
    return null;
  }
}

export async function loadAlertFlag(db: Db, assetId: string | null): Promise<boolean> {
  if (!assetId) return false;
  const asset = await db.select().from(assets).where(eq(assets.id, assetId)).get();
  return Boolean(asset?.monitoringAlertEnabled);
}

export async function deviceNameFor(db: Db, agent: MonitoringAgent): Promise<string> {
  if (agent.assetId) {
    const asset = await db.select().from(assets).where(eq(assets.id, agent.assetId)).get();
    if (asset?.name) return asset.name;
  }
  return agent.hostname || agent.machineId;
}

export type DeviceStatus = "online" | "offline" | "pending";

export function devicePublicStatus(agent: MonitoringAgent, now = new Date()): DeviceStatus {
  if (!agent.assetId) return "pending";
  return isAgentOnline(agent.lastSeenAt, now) ? "online" : "offline";
}

export function warningActive(
  agent: MonitoringAgent,
  alertEnabled: boolean,
  now = new Date(),
): boolean {
  if (!alertEnabled || !agent.assetId) return false;
  const issues = parseIssues(agent.currentIssuesJson);
  const online = isAgentOnline(agent.lastSeenAt, now);
  const hasOffline = issues.includes("offline") || !online;
  const hasOther = issues.some((k) => k !== "offline");
  return hasOffline || hasOther;
}

/**
 * Offline-Erkennung und Ticket-Sync für alle zugeordneten Agenten.
 */
export async function evaluateOfflineAgents(db: Db): Promise<void> {
  const now = new Date();
  const rows = await db.select().from(monitoringAgents).all();
  for (const agent of rows) {
    if (!agent.assetId || !agent.customerId) continue;
    const asset = await db.select().from(assets).where(eq(assets.id, agent.assetId)).get();
    const alertEnabled = Boolean(asset?.monitoringAlertEnabled);
    const online = isAgentOnline(agent.lastSeenAt, now);
    const issues: MonitoringIssueKind[] = parseIssues(agent.currentIssuesJson).filter(
      (k) => k !== "offline",
    );
    if (!online) issues.unshift("offline");
    const name = asset?.name || agent.hostname || agent.machineId;
    const openTicketId = await syncMonitoringTicket(db, agent, issues, alertEnabled, name);
    if (
      serializeIssues(issues) !== (agent.currentIssuesJson || "[]") ||
      openTicketId !== agent.openTicketId
    ) {
      await db
        .update(monitoringAgents)
        .set({
          currentIssuesJson: serializeIssues(issues),
          openTicketId,
          updatedAt: now,
        })
        .where(eq(monitoringAgents.id, agent.id));
    }
  }
}

export async function findAssignableAssets(db: Db) {
  const enabled = await db.select().from(assets).where(eq(assets.monitoringEnabled, true)).all();
  const taken = await db
    .select({ assetId: monitoringAgents.assetId })
    .from(monitoringAgents)
    .all();
  const takenSet = new Set(taken.map((t) => t.assetId).filter(Boolean) as string[]);
  const free = enabled.filter((a) => !takenSet.has(a.id));
  const customerIds = [...new Set(free.map((a) => a.customerId))];
  const customerRows =
    customerIds.length === 0
      ? []
      : await db.select().from(customers).all();
  const cmap = new Map(customerRows.map((c) => [c.id, c]));
  return free.map((a) => {
    const c = cmap.get(a.customerId);
    return {
      id: a.id,
      name: a.name,
      hostname: a.hostname,
      customerId: a.customerId,
      customerName: c?.company?.trim() || c?.name || "Kunde",
    };
  });
}

export function mapPendingAgent(agent: MonitoringAgent) {
  return {
    id: agent.id,
    machineId: agent.machineId,
    hostname: agent.hostname,
    os: agent.os,
    osVersion: agent.osVersion,
    ipAddress: agent.ipAddress,
    agentVersion: agent.agentVersion,
    lastSeenAt: agent.lastSeenAt,
    createdAt: agent.createdAt,
  };
}

export async function mapDeviceSummary(
  db: Db,
  agent: MonitoringAgent,
  asset: Asset | undefined,
  customerName: string | null,
  now = new Date(),
) {
  const alertEnabled = Boolean(asset?.monitoringAlertEnabled);
  const issues = parseIssues(agent.currentIssuesJson);
  const online = isAgentOnline(agent.lastSeenAt, now);
  const snapshot = parseSnapshot(agent.lastSnapshotJson);
  const warn = warningActive(agent, alertEnabled, now);
  let ticketNumber: string | null = null;
  if (agent.openTicketId) {
    const t = await db.select({ number: tickets.number }).from(tickets).where(eq(tickets.id, agent.openTicketId)).get();
    ticketNumber = t?.number ?? null;
  }
  return {
    agentId: agent.id,
    assetId: agent.assetId,
    assetName: asset?.name ?? agent.hostname ?? agent.machineId,
    customerId: agent.customerId,
    customerName,
    hostname: agent.hostname,
    os: agent.os,
    osVersion: agent.osVersion,
    ipAddress: agent.ipAddress,
    lastSeenAt: agent.lastSeenAt,
    status: devicePublicStatus(agent, now),
    online,
    alertEnabled,
    monitoringEnabled: Boolean(asset?.monitoringEnabled),
    warning: warn,
    issues: warn ? (online ? issues.filter((k) => k !== "offline") : issues.includes("offline") ? issues : ["offline", ...issues]) : [],
    ticketId: warn ? agent.openTicketId : null,
    ticketNumber: warn ? ticketNumber : null,
    cpuPercent: snapshot?.cpuPercent ?? null,
    ramPercent: usedPct(snapshot?.ramUsedBytes ?? 0, snapshot?.ramTotalBytes ?? 0),
    diskUsedPct: worstDiskUsedPct(snapshot?.disks),
    uptimeSec: snapshot?.uptimeSec ?? null,
  };
}
