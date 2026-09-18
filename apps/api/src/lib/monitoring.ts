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
  ticketPriorities,
} from "../db/schema.js";
import { addActivity } from "../routes/activities.js";
import { createId } from "./id.js";
import { compareAgentVersions, platformFromAgent } from "./agentPackages.js";
import { findActiveContract, isOpenStatus, nextTicketNumber, slaFromContract } from "./tickets.js";
import { notifyMonitoringClose, notifyMonitoringOpen } from "./notify.js";

export const MONITORING_OFFLINE_MS = 2 * 60 * 1000;
export const MONITORING_SAMPLE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const CPU_HIGH_PCT = 90;
export const RAM_HIGH_PCT = 90;
export const DISK_FREE_MIN_PCT = 10;
export const STREAK_MINUTES = 5;
const SETTINGS_ID = "default";

export const DISK_WARN_USED_DEFAULT = 100 - DISK_FREE_MIN_PCT;
export const DISK_ISSUE_PREFIX = "disk:";

export const monitoringIssueLabel: Record<MonitoringIssueKind, string> = {
  offline: "Offline",
  disk: "Datenträger voll",
  cpu: "CPU hoch",
  ram: "RAM hoch",
  eventlog: "Ereignisprotokoll",
  updates: "Updates ausstehend",
};

export const defaultKindPriority: Record<MonitoringIssueKind, TicketPriority> = {
  offline: "high",
  disk: "high",
  cpu: "normal",
  ram: "normal",
  eventlog: "normal",
  updates: "low",
};

export type KindAlert = { enabled: boolean; priority: TicketPriority };
/** Schwellwert je Laufwerk; ohne Eintrag gelten die Datenträger-Defaults des Geräts. */
export type VolumeAlert = { enabled: boolean; warnUsedPct: number };
export type DiskKindAlert = KindAlert & {
  warnUsedPct: number;
  volumes: Record<string, VolumeAlert>;
};
export type AlertConfig = {
  [K in MonitoringIssueKind]: K extends "disk" ? DiskKindAlert : KindAlert;
};
export type OpenTicketMap = Record<string, string>;
export type FiringDisk = { id: string; name: string; usedPct: number; warnUsedPct: number };

/** Leere Konfiguration: alle Typen aus, mit Standard-Priorität. */
export function emptyAlertConfig(allEnabled = false): AlertConfig {
  return {
    offline: { enabled: allEnabled, priority: defaultKindPriority.offline },
    disk: {
      enabled: allEnabled,
      priority: defaultKindPriority.disk,
      warnUsedPct: DISK_WARN_USED_DEFAULT,
      volumes: {},
    },
    cpu: { enabled: allEnabled, priority: defaultKindPriority.cpu },
    ram: { enabled: allEnabled, priority: defaultKindPriority.ram },
    eventlog: { enabled: allEnabled, priority: defaultKindPriority.eventlog },
    updates: { enabled: allEnabled, priority: defaultKindPriority.updates },
  };
}

function isPriority(value: unknown): value is TicketPriority {
  return ticketPriorities.includes(value as TicketPriority);
}

/** Belegt-% für eine Datenträger-Warnung (1–99, Default 90). */
export function clampWarnUsedPct(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return DISK_WARN_USED_DEFAULT;
  return Math.min(99, Math.max(1, Math.round(n)));
}

/**
 * Stabile Laufwerk-ID: Windows `C:`, Linux Mountpoint `/` bzw. `/data`.
 */
export function normalizeDiskId(raw: string): string {
  const s = raw.trim();
  if (/^[A-Za-z]:/.test(s) || s.includes("\\")) {
    const m = s.match(/([A-Za-z]):/);
    if (m) return `${m[1].toUpperCase()}:`;
  }
  const trimmed = s.replace(/\/+$/, "");
  return trimmed || "/";
}

export function diskIdOf(disk: DiskSnapshot): string {
  if (disk.id?.trim()) return normalizeDiskId(disk.id);
  return normalizeDiskId(disk.name || disk.mount || "");
}

export function diskTicketKey(diskId: string): string {
  return `${DISK_ISSUE_PREFIX}${diskId}`;
}

export function diskIdFromTicketKey(key: string): string | null {
  if (key.startsWith(DISK_ISSUE_PREFIX) && key.length > DISK_ISSUE_PREFIX.length) {
    return key.slice(DISK_ISSUE_PREFIX.length);
  }
  return null;
}

export function volumeAlertFor(config: AlertConfig, diskId: string): VolumeAlert & { priority: TicketPriority } {
  const vol = config.disk.volumes[diskId];
  return {
    enabled: config.disk.enabled && (vol?.enabled ?? true),
    warnUsedPct: vol?.warnUsedPct ?? config.disk.warnUsedPct,
    priority: config.disk.priority,
  };
}

function parseVolumeMap(raw: unknown): Record<string, VolumeAlert> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, VolumeAlert> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!key.trim() || !value || typeof value !== "object" || Array.isArray(value)) continue;
    const row = value as { enabled?: unknown; warnUsedPct?: unknown };
    const id = normalizeDiskId(key);
    if (!id) continue;
    out[id] = {
      enabled: row.enabled === undefined ? true : Boolean(row.enabled),
      warnUsedPct: clampWarnUsedPct(row.warnUsedPct),
    };
  }
  return out;
}

/**
 * Liest die Warnungs-Konfiguration eines Inventar-Eintrags.
 * Leeres JSON fällt auf das alte Flag `monitoringAlertEnabled` zurück (alle Typen an/aus).
 */
export function parseAlertConfig(asset: Pick<Asset, "monitoringAlertEnabled" | "monitoringAlertsJson"> | null | undefined): AlertConfig {
  const fallback = emptyAlertConfig(Boolean(asset?.monitoringAlertEnabled));
  if (!asset?.monitoringAlertsJson) return fallback;
  try {
    const raw = JSON.parse(asset.monitoringAlertsJson) as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fallback;
    const obj = raw as Record<string, Record<string, unknown>>;
    if (Object.keys(obj).length === 0) return fallback;
    const cfg = emptyAlertConfig(false);
    for (const kind of monitoringIssueKinds) {
      if (kind === "disk") continue;
      const row = obj[kind];
      if (!row || typeof row !== "object") continue;
      cfg[kind] = {
        enabled: Boolean(row.enabled),
        priority: isPriority(row.priority) ? row.priority : defaultKindPriority[kind],
      };
    }
    const diskRow = obj.disk;
    if (diskRow && typeof diskRow === "object") {
      cfg.disk.enabled = Boolean(diskRow.enabled);
      cfg.disk.priority = isPriority(diskRow.priority) ? diskRow.priority : defaultKindPriority.disk;
      cfg.disk.warnUsedPct = clampWarnUsedPct(
        diskRow.warnUsedPct ?? (typeof diskRow.freeMinPct === "number" ? 100 - Number(diskRow.freeMinPct) : DISK_WARN_USED_DEFAULT),
      );
      cfg.disk.volumes = parseVolumeMap(diskRow.volumes);
    }
    return cfg;
  } catch {
    return fallback;
  }
}

export function serializeAlertConfig(cfg: AlertConfig): string {
  return JSON.stringify(cfg);
}

export function anyAlertEnabled(cfg: AlertConfig): boolean {
  return monitoringIssueKinds.some((k) => cfg[k].enabled);
}

function isTicketKey(key: string): boolean {
  return monitoringIssueKinds.includes(key as MonitoringIssueKind) || diskIdFromTicketKey(key) != null;
}

export function parseOpenTickets(raw: string | null | undefined): OpenTicketMap {
  try {
    const parsed = JSON.parse(raw || "{}") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: OpenTicketMap = {};
    for (const [key, id] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof id === "string" && id && isTicketKey(key)) out[key] = id;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Entfernt ein gelöschtes Ticket aus den offenen Monitoring-Zuordnungen.
 */
export async function unlinkDeletedMonitoringTicket(db: Db, ticketId: string) {
  const agents = await db.select().from(monitoringAgents).all();
  const now = new Date();
  for (const agent of agents) {
    const map = parseOpenTickets(agent.openTicketsJson);
    let changed = false;
    for (const [key, id] of Object.entries(map)) {
      if (id === ticketId) {
        delete map[key];
        changed = true;
      }
    }
    const openTicketId = agent.openTicketId === ticketId ? null : agent.openTicketId;
    if (!changed && openTicketId === agent.openTicketId) continue;
    await db
      .update(monitoringAgents)
      .set({
        openTicketsJson: JSON.stringify(map),
        openTicketId,
        updatedAt: now,
      })
      .where(eq(monitoringAgents.id, agent.id));
  }
}

export type DiskSnapshot = {
  id?: string;
  name: string;
  mount?: string;
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

export type HardwareInventory = {
  system?: { manufacturer?: string; model?: string; serial?: string; sku?: string };
  bios?: { vendor?: string; version?: string; date?: string; serial?: string };
  board?: { manufacturer?: string; product?: string; serial?: string };
  cpus?: { name?: string; cores?: number; threads?: number; mhz?: number; socket?: string }[];
  memoryModules?: {
    slot?: string;
    sizeBytes?: number;
    speedMhz?: number;
    manufacturer?: string;
    partNumber?: string;
    serial?: string;
    type?: string;
  }[];
  storage?: {
    name?: string;
    model?: string;
    serial?: string;
    sizeBytes?: number;
    bus?: string;
    media?: string;
  }[];
  gpus?: { name?: string; driver?: string; vramBytes?: number }[];
  nics?: { name?: string; mac?: string; manufacturer?: string; speedMbps?: number }[];
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
  hardware?: HardwareInventory;
  /** z.B. `windows-amd64` – vom Agent gemeldet. */
  platform?: string;
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

export function parseIssueTokens(raw: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(raw || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length < 200);
  } catch {
    return [];
  }
}

/**
 * Bekannte Warnungstypen aus dem Issues-JSON (inkl. `disk:C:` → `disk`).
 */
export function parseIssues(raw: string | null | undefined): MonitoringIssueKind[] {
  const kinds = new Set<MonitoringIssueKind>();
  for (const token of parseIssueTokens(raw)) {
    if (monitoringIssueKinds.includes(token as MonitoringIssueKind)) {
      kinds.add(token as MonitoringIssueKind);
    } else if (diskIdFromTicketKey(token)) {
      kinds.add("disk");
    }
  }
  return monitoringIssueKinds.filter((k) => kinds.has(k));
}

export function diskIdsFromTokens(raw: string | null | undefined): string[] {
  const ids: string[] = [];
  for (const token of parseIssueTokens(raw)) {
    const id = diskIdFromTicketKey(token);
    if (id) ids.push(id);
  }
  return ids;
}

/** Speichert Typen plus `disk:<id>` je voll laufendem Laufwerk. */
export function serializeDetectedIssues(kinds: MonitoringIssueKind[], diskIds: string[]): string {
  const tokens: string[] = [];
  for (const kind of kinds) {
    if (kind === "disk") continue;
    tokens.push(kind);
  }
  for (const id of diskIds) {
    if (id) tokens.push(diskTicketKey(id));
  }
  return JSON.stringify([...new Set(tokens)]);
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
 * Laufwerke, die den konfigurierten Belegt-Schwellwert überschreiten.
 */
export function firingDisksFrom(disks: DiskSnapshot[] | undefined, config: AlertConfig): FiringDisk[] {
  if (!config.disk.enabled || !disks?.length) return [];
  const out: FiringDisk[] = [];
  for (const disk of disks) {
    const id = diskIdOf(disk);
    if (!id) continue;
    const vol = volumeAlertFor(config, id);
    if (!vol.enabled) continue;
    const pct = disk.totalBytes > 0 ? usedPct(disk.usedBytes, disk.totalBytes) : null;
    if (pct != null && pct >= vol.warnUsedPct) {
      out.push({ id, name: disk.name || id, usedPct: pct, warnUsedPct: vol.warnUsedPct });
    }
  }
  return out;
}

/**
 * Schwellwerte aus dem letzten Heartbeat (ohne Offline).
 */
export function evaluateHeartbeatIssues(
  snapshot: AgentSnapshot,
  agent: Pick<MonitoringAgent, "cpuHighStreak" | "ramHighStreak">,
  config: AlertConfig,
): {
  issues: MonitoringIssueKind[];
  firingDisks: FiringDisk[];
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

  const firingDisks = firingDisksFrom(snapshot.disks, config);
  if (firingDisks.length) issues.push("disk");

  if ((snapshot.events ?? []).some((ev) => (ev.level || "error").toLowerCase() !== "warning")) {
    if ((snapshot.events ?? []).length > 0) issues.push("eventlog");
  }

  if ((snapshot.updates?.pendingCount ?? 0) > 0) issues.push("updates");

  return { issues, firingDisks, cpuHighStreak, ramHighStreak };
}

function issueTitle(deviceName: string, kind: MonitoringIssueKind, diskName?: string): string {
  if (kind === "disk" && diskName) return `[Monitoring] ${deviceName} — Datenträger ${diskName} voll`;
  return `[Monitoring] ${deviceName} — ${monitoringIssueLabel[kind]}`;
}

function issueDescription(deviceName: string, kind: MonitoringIssueKind, diskName?: string): string {
  if (kind === "disk" && diskName) {
    return `Automatische Monitoring-Meldung für ${deviceName}: Datenträger ${diskName} über dem Schwellwert.`;
  }
  return `Automatische Monitoring-Meldung für ${deviceName}: ${monitoringIssueLabel[kind]}.`;
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

async function closeTicket(
  db: Db,
  ticketId: string,
  authorId: string,
  now: Date,
  resolutionText: string,
) {
  const ticket = await db.select().from(tickets).where(eq(tickets.id, ticketId)).get();
  if (!ticket || !isOpenStatus(ticket.status)) return;
  const resolution = plainDoc(resolutionText);
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
  await addActivity(db, ticket.customerId, `Ticket ${ticket.number} geschlossen`, ticket.title, now);
}

type TicketSlot = {
  key: string;
  kind: MonitoringIssueKind;
  priority: TicketPriority;
  title: string;
  description: string;
  firing: boolean;
  enabled: boolean;
  closeOk: string;
  closeOff: string;
};

/**
 * Ein offenes Ticket je Warnung; Datenträger je Laufwerk. Schließt Tickets, deren Warnung weg ist.
 */
export async function syncMonitoringTickets(
  db: Db,
  agent: MonitoringAgent,
  detected: MonitoringIssueKind[],
  config: AlertConfig,
  deviceName: string,
  firingDisks: FiringDisk[] = [],
): Promise<OpenTicketMap> {
  const now = new Date();
  const authorId = await adminUserId(db);
  const openMap = parseOpenTickets(agent.openTicketsJson);
  if (Object.keys(openMap).length === 0 && agent.openTicketId) {
    const seed = firingDisks[0]
      ? diskTicketKey(firingDisks[0].id)
      : (detected.find((k) => k !== "disk") ?? detected[0] ?? "offline");
    openMap[seed] = agent.openTicketId;
  }
  if (openMap.disk && firingDisks.length) {
    const key = diskTicketKey(firingDisks[0].id);
    if (!openMap[key]) openMap[key] = openMap.disk;
    if (openMap[key] === openMap.disk) delete openMap.disk;
  }
  if (!authorId || !agent.customerId) return openMap;

  const firingKinds = new Set(detected.filter((kind) => kind !== "disk" && config[kind].enabled));
  const slots: TicketSlot[] = [];
  for (const kind of monitoringIssueKinds) {
    if (kind === "disk") continue;
    slots.push({
      key: kind,
      kind,
      priority: config[kind].priority,
      title: issueTitle(deviceName, kind),
      description: issueDescription(deviceName, kind),
      firing: firingKinds.has(kind),
      enabled: config[kind].enabled,
      closeOk: `Die Warnung „${monitoringIssueLabel[kind]}“ ist nicht mehr aktiv.`,
      closeOff: `Warnung „${monitoringIssueLabel[kind]}“ am Gerät deaktiviert.`,
    });
  }
  const firingDiskIds = new Set(firingDisks.map((d) => d.id));
  const diskNames = new Map(firingDisks.map((d) => [d.id, d.name]));
  const diskKeys = new Set<string>();
  for (const disk of firingDisks) {
    const key = diskTicketKey(disk.id);
    diskKeys.add(key);
    const vol = volumeAlertFor(config, disk.id);
    slots.push({
      key,
      kind: "disk",
      priority: vol.priority,
      title: issueTitle(deviceName, "disk", disk.name),
      description: issueDescription(deviceName, "disk", disk.name),
      firing: true,
      enabled: vol.enabled,
      closeOk: `Die Warnung für Datenträger ${disk.name} ist nicht mehr aktiv.`,
      closeOff: `Warnung für Datenträger ${disk.name} am Gerät deaktiviert.`,
    });
  }
  for (const key of Object.keys(openMap)) {
    const diskId = diskIdFromTicketKey(key);
    if (!diskId || diskKeys.has(key)) continue;
    const name = diskNames.get(diskId) ?? diskId;
    const vol = volumeAlertFor(config, diskId);
    slots.push({
      key,
      kind: "disk",
      priority: vol.priority,
      title: issueTitle(deviceName, "disk", name),
      description: issueDescription(deviceName, "disk", name),
      firing: firingDiskIds.has(diskId),
      enabled: vol.enabled,
      closeOk: `Die Warnung für Datenträger ${name} ist nicht mehr aktiv.`,
      closeOff: `Warnung für Datenträger ${name} am Gerät deaktiviert.`,
    });
  }
  if (openMap.disk) {
    slots.push({
      key: "disk",
      kind: "disk",
      priority: config.disk.priority,
      title: issueTitle(deviceName, "disk"),
      description: issueDescription(deviceName, "disk"),
      firing: false,
      enabled: config.disk.enabled,
      closeOk: `Die Warnung „${monitoringIssueLabel.disk}“ ist nicht mehr aktiv.`,
      closeOff: `Warnung „${monitoringIssueLabel.disk}“ am Gerät deaktiviert.`,
    });
  }

  const next: OpenTicketMap = {};
  const seen = new Set<string>();
  for (const slot of slots) {
    if (seen.has(slot.key)) continue;
    seen.add(slot.key);
    const existingId = openMap[slot.key];
    const existing = existingId
      ? await db.select().from(tickets).where(eq(tickets.id, existingId)).get()
      : undefined;
    const openExisting = existing && isOpenStatus(existing.status) ? existing : null;

    if (slot.firing) {
      if (openExisting) {
        const patch: { priority?: TicketPriority; title?: string; updatedAt: Date } = { updatedAt: now };
        if (openExisting.priority !== slot.priority) patch.priority = slot.priority;
        if (openExisting.title !== slot.title) patch.title = slot.title;
        if (patch.priority || patch.title) {
          await db.update(tickets).set(patch).where(eq(tickets.id, openExisting.id));
        }
        next[slot.key] = openExisting.id;
        continue;
      }
      const contract = await findActiveContract(db, agent.customerId);
      const sla = slaFromContract(contract, slot.priority, now);
      const row = {
        id: createId("tkt"),
        number: await nextTicketNumber(db),
        customerId: agent.customerId,
        title: slot.title,
        description: slot.description,
        status: "open" as TicketStatus,
        priority: slot.priority,
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
      await notifyMonitoringOpen(db, row);
      next[slot.key] = row.id;
      continue;
    }

    if (openExisting) {
      const reason = slot.enabled ? slot.closeOk : slot.closeOff;
      await closeTicket(db, openExisting.id, authorId, now, reason);
      await notifyMonitoringClose(db, { ...openExisting, status: "closed" }, reason);
    }
  }

  return next;
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
      smtpHost: null,
      smtpPort: null,
      smtpSecure: "starttls",
      smtpUser: null,
      smtpPassEnc: null,
      mailFromEmail: null,
      mailFromName: null,
      mailReplyTo: null,
      mailPublicUrl: null,
      mailStaffInbox: null,
      mailNotifyJson: "{}",
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

/** Füllt leere Inventar-Felder aus Heartbeat und Hardware-Inventur. */
export function hardwareAssetPatch(
  asset: Pick<
    Asset,
    | "kind"
    | "manufacturer"
    | "model"
    | "serialNumber"
    | "hostname"
    | "ipAddress"
    | "secondaryIp"
    | "macAddress"
    | "os"
    | "firmware"
    | "cpu"
    | "ramGb"
    | "diskGb"
  >,
  snapshot: AgentSnapshot,
  ip: string | null,
): Partial<
  Pick<
    Asset,
    | "manufacturer"
    | "model"
    | "serialNumber"
    | "hostname"
    | "ipAddress"
    | "secondaryIp"
    | "macAddress"
    | "os"
    | "firmware"
    | "cpu"
    | "ramGb"
    | "diskGb"
  >
> {
  const hw = snapshot.hardware;
  const patch: ReturnType<typeof hardwareAssetPatch> = {};
  const computer = ["pc", "laptop", "tablet", "server", "nas"].includes(asset.kind);

  if (!asset.manufacturer && hw?.system?.manufacturer) {
    patch.manufacturer = hw.system.manufacturer.slice(0, 200);
  } else if (!asset.manufacturer && hw?.board?.manufacturer) {
    patch.manufacturer = hw.board.manufacturer.slice(0, 200);
  }
  if (!asset.model && hw?.system?.model) patch.model = hw.system.model.slice(0, 200);
  else if (!asset.model && hw?.board?.product) patch.model = hw.board.product.slice(0, 200);

  const serial = hw?.system?.serial || hw?.bios?.serial;
  if (!asset.serialNumber && serial) patch.serialNumber = serial.slice(0, 200);

  if (!asset.hostname && snapshot.hostname?.trim()) patch.hostname = snapshot.hostname.trim().slice(0, 200);
  if (!asset.ipAddress && ip) patch.ipAddress = ip.slice(0, 80);
  const extraIps = (snapshot.ips ?? []).map((x) => x.trim()).filter((x) => x && x !== ip && !x.startsWith("127.") && x !== "::1");
  if (!asset.secondaryIp && extraIps.length) patch.secondaryIp = extraIps.slice(0, 4).join(", ").slice(0, 80);

  const mac = snapshot.mac?.trim() || hw?.nics?.find((n) => n.mac)?.mac;
  if (!asset.macAddress && mac) patch.macAddress = mac.slice(0, 80);

  if (computer) {
    if (!asset.os && (snapshot.os || snapshot.osVersion)) {
      patch.os = [snapshot.os, snapshot.osVersion].filter(Boolean).join(" ").slice(0, 200);
    }
    const bios = [hw?.bios?.vendor, hw?.bios?.version].filter(Boolean).join(" ");
    if (!asset.firmware && bios) patch.firmware = bios.slice(0, 200);
    const cpuName = hw?.cpus?.find((c) => c.name)?.name;
    if (!asset.cpu && cpuName) patch.cpu = cpuName.slice(0, 200);
    if (asset.ramGb == null && snapshot.ramTotalBytes) {
      const gb = snapshot.ramTotalBytes / 1024 ** 3;
      if (gb > 0) patch.ramGb = Math.round(gb * 10) / 10;
    }
    if (asset.diskGb == null && hw?.storage?.length) {
      const bytes = hw.storage.reduce((sum, d) => sum + (d.sizeBytes ?? 0), 0);
      if (bytes > 0) patch.diskGb = Math.round(bytes / 1024 ** 3);
    }
  }

  return patch;
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

export async function loadAlertConfig(db: Db, assetId: string | null): Promise<AlertConfig> {
  if (!assetId) return emptyAlertConfig(false);
  const asset = await db.select().from(assets).where(eq(assets.id, assetId)).get();
  return parseAlertConfig(asset ?? undefined);
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

export function warningActive(detected: MonitoringIssueKind[], config: AlertConfig): boolean {
  return detected.some((kind) => config[kind].enabled);
}

export function alertedIssues(detected: MonitoringIssueKind[], config: AlertConfig): MonitoringIssueKind[] {
  return detected.filter((kind) => config[kind].enabled);
}

/**
 * Tickets eines zugeordneten Agenten an aktuelle Warnungen und Geräte-Konfig anpassen.
 */
export async function refreshAssignedAgent(db: Db, agent: MonitoringAgent, now = new Date()): Promise<void> {
  if (!agent.assetId || !agent.customerId || agent.uninstallRequestedAt) return;
  const asset = await db.select().from(assets).where(eq(assets.id, agent.assetId)).get();
  const config = parseAlertConfig(asset ?? undefined);
  const online = isAgentOnline(agent.lastSeenAt, now);
  const snapshot = parseSnapshot(agent.lastSnapshotJson);
  const stored = parseIssues(agent.currentIssuesJson).filter((k) => k !== "offline" && k !== "disk");
  const firingDisks = firingDisksFrom(snapshot?.disks, config);
  const issues: MonitoringIssueKind[] = [...stored];
  if (firingDisks.length) issues.push("disk");
  if (!online) issues.unshift("offline");
  const name = asset?.name || agent.hostname || agent.machineId;
  const openTickets = await syncMonitoringTickets(db, agent, issues, config, name, firingDisks);
  const firstTicket = Object.values(openTickets)[0] ?? null;
  const issuesJson = serializeDetectedIssues(issues, firingDisks.map((d) => d.id));
  if (
    issuesJson !== (agent.currentIssuesJson || "[]") ||
    JSON.stringify(openTickets) !== (agent.openTicketsJson || "{}") ||
    firstTicket !== agent.openTicketId
  ) {
    await db
      .update(monitoringAgents)
      .set({
        currentIssuesJson: issuesJson,
        openTicketsJson: JSON.stringify(openTickets),
        openTicketId: firstTicket,
        updatedAt: now,
      })
      .where(eq(monitoringAgents.id, agent.id));
  }
}

/** Ticket-Sync nach Änderung der Warnungs-Konfiguration am Inventar-Eintrag. */
export async function refreshTicketsForAsset(db: Db, assetId: string): Promise<void> {
  const agent = await db
    .select()
    .from(monitoringAgents)
    .where(eq(monitoringAgents.assetId, assetId))
    .get();
  if (!agent) return;
  await refreshAssignedAgent(db, agent);
}

/**
 * Offline-Erkennung und Ticket-Sync für alle zugeordneten Agenten.
 */
export async function evaluateOfflineAgents(db: Db): Promise<void> {
  const now = new Date();
  const rows = await db.select().from(monitoringAgents).all();
  for (const agent of rows) {
    await refreshAssignedAgent(db, agent, now);
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
    uninstallRequested: Boolean(agent.uninstallRequestedAt),
  };
}

/**
 * Schließt offene Monitoring-Tickets und entfernt Agent samt Verlauf.
 */
export async function purgeMonitoringAgent(db: Db, agent: MonitoringAgent): Promise<void> {
  if (agent.assetId) {
    const name = await deviceNameFor(db, agent);
    await syncMonitoringTickets(db, agent, [], emptyAlertConfig(false), name, []);
  }
  await db.delete(monitoringSamples).where(eq(monitoringSamples.agentId, agent.id));
  await db.delete(monitoringAgents).where(eq(monitoringAgents.id, agent.id));
}

export async function mapDeviceSummary(
  db: Db,
  agent: MonitoringAgent,
  asset: Asset | undefined,
  customerName: string | null,
  now = new Date(),
  packages?: Map<string, { version: string }>,
) {
  const config = parseAlertConfig(asset);
  const detected = parseIssues(agent.currentIssuesJson);
  const online = isAgentOnline(agent.lastSeenAt, now);
  const snapshot = parseSnapshot(agent.lastSnapshotJson);
  const issues = alertedIssues(detected, config);
  const warn = issues.length > 0;
  const openMap = parseOpenTickets(agent.openTicketsJson);
  const firingDisks = firingDisksFrom(snapshot?.disks, config);
  const platform = platformFromAgent({
    platform: snapshot?.platform,
    os: snapshot?.os ?? agent.os,
    arch: snapshot?.arch,
  });
  const latest = platform ? packages?.get(platform) : undefined;
  const agentOutdated = Boolean(
    latest && (!agent.agentVersion || compareAgentVersions(agent.agentVersion, latest.version) < 0),
  );
  const ticketRows: {
    kind: MonitoringIssueKind;
    diskId?: string;
    ticketId: string;
    ticketNumber: string;
    priority: TicketPriority;
  }[] = [];
  async function pushTicket(kind: MonitoringIssueKind, key: string, diskId?: string) {
    const id = openMap[key];
    if (!id) return;
    const t = await db
      .select({ number: tickets.number, priority: tickets.priority })
      .from(tickets)
      .where(eq(tickets.id, id))
      .get();
    if (t) ticketRows.push({ kind, diskId, ticketId: id, ticketNumber: t.number, priority: t.priority });
  }
  if (warn) {
    for (const kind of issues) {
      if (kind === "disk") continue;
      await pushTicket(kind, kind);
    }
    for (const disk of firingDisks) {
      await pushTicket("disk", diskTicketKey(disk.id), disk.id);
    }
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
    alertEnabled: anyAlertEnabled(config),
    alertConfig: config,
    monitoringEnabled: Boolean(asset?.monitoringEnabled),
    warning: warn,
    issues,
    diskIssues: firingDisks.map((d) => ({ id: d.id, name: d.name, usedPct: d.usedPct, warnUsedPct: d.warnUsedPct })),
    tickets: ticketRows,
    ticketId: ticketRows[0]?.ticketId ?? null,
    ticketNumber: ticketRows[0]?.ticketNumber ?? null,
    agentVersion: agent.agentVersion,
    agentPlatform: platform,
    latestAgentVersion: latest?.version ?? null,
    agentOutdated,
    updateRequested: Boolean(agent.updateRequestedAt),
    uninstallRequested: Boolean(agent.uninstallRequestedAt),
    cpuPercent: snapshot?.cpuPercent ?? null,
    ramPercent: usedPct(snapshot?.ramUsedBytes ?? 0, snapshot?.ramTotalBytes ?? 0),
    diskUsedPct: worstDiskUsedPct(snapshot?.disks),
    uptimeSec: snapshot?.uptimeSec ?? null,
  };
}
