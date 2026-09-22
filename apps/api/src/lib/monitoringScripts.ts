import { and, asc, desc, eq, inArray, lt } from "drizzle-orm";
import type { Db } from "../db/index.js";
import {
  monitoringScriptJobs,
  monitoringScriptTemplates,
  users,
  type MonitoringScriptJob,
  type MonitoringScriptJobStatus,
} from "../db/schema.js";
import { createId } from "./id.js";
import { compareAgentVersions } from "./agentPackages.js";

export const SCRIPT_JOB_MIN_AGENT = "1.0.11";
export const SCRIPT_MAX_CHARS = 32 * 1024;
export const SCRIPT_OUTPUT_MAX_CHARS = 64 * 1024;
export const SCRIPT_TIMEOUT_DEFAULT_SEC = 60;
export const SCRIPT_TIMEOUT_MIN_SEC = 10;
export const SCRIPT_TIMEOUT_MAX_SEC = 120;
export const SCRIPT_JOB_HISTORY = 20;
const SCRIPT_RUNNING_EXPIRE_MS = 15 * 60 * 1000;
const OPEN_JOB_STATUSES: MonitoringScriptJobStatus[] = ["pending", "running"];

export type ScriptJobWire = {
  id: string;
  agentId: string;
  assetId: string | null;
  createdByUserId: string | null;
  createdByUsername: string | null;
  templateId: string | null;
  script: string;
  status: MonitoringScriptJobStatus;
  timeoutSec: number;
  exitCode: number | null;
  stdout: string | null;
  stderr: string | null;
  errorMessage: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
};

export type ScriptTemplateWire = {
  id: string;
  name: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
};

export type AgentScriptResultIn = {
  jobId: string;
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
  timedOut?: boolean;
  error?: string;
};

/**
 * Kürzt Ausgabe auf das Limit (Bytes/Zeichen).
 */
export function clipScriptOutput(value: string | null | undefined, max = SCRIPT_OUTPUT_MAX_CHARS): string {
  const text = value ?? "";
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n… (Ausgabe gekürzt)`;
}

/**
 * Windows-Agent (OS-Name oder Paketplattform).
 */
export function isWindowsMonitoringAgent(os?: string | null, platform?: string | null): boolean {
  const plat = (platform || "").toLowerCase();
  if (plat.startsWith("windows")) return true;
  return /^windows/i.test(os || "");
}

/**
 * Agent kann Remote-PowerShell (Windows ab 1.0.11).
 */
export function agentAcceptsScriptJobs(opts: {
  version?: string | null;
  os?: string | null;
  platform?: string | null;
}): boolean {
  if (!isWindowsMonitoringAgent(opts.os, opts.platform)) return false;
  return compareAgentVersions(opts.version || "0", SCRIPT_JOB_MIN_AGENT) >= 0;
}

function mapTemplate(row: typeof monitoringScriptTemplates.$inferSelect): ScriptTemplateWire {
  return {
    id: row.id,
    name: row.name,
    body: row.body,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapJob(row: MonitoringScriptJob, username: string | null): ScriptJobWire {
  return {
    id: row.id,
    agentId: row.agentId,
    assetId: row.assetId,
    createdByUserId: row.createdByUserId,
    createdByUsername: username,
    templateId: row.templateId,
    script: row.script,
    status: row.status,
    timeoutSec: row.timeoutSec,
    exitCode: row.exitCode,
    stdout: row.stdout,
    stderr: row.stderr,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
  };
}

/**
 * Hängt hängengebliebene running-Jobs ab.
 */
export async function expireStaleScriptJobs(db: Db, agentId: string, now = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - SCRIPT_RUNNING_EXPIRE_MS);
  await db
    .update(monitoringScriptJobs)
    .set({
      status: "expired",
      errorMessage: "Keine Rückmeldung vom Agent (Timeout).",
      finishedAt: now,
    })
    .where(
      and(
        eq(monitoringScriptJobs.agentId, agentId),
        eq(monitoringScriptJobs.status, "running"),
        lt(monitoringScriptJobs.startedAt, cutoff),
      ),
    );
}

/**
 * Offener Auftrag (pending oder running) für diesen Agent.
 */
export async function findOpenScriptJob(db: Db, agentId: string) {
  return db
    .select()
    .from(monitoringScriptJobs)
    .where(
      and(eq(monitoringScriptJobs.agentId, agentId), inArray(monitoringScriptJobs.status, OPEN_JOB_STATUSES)),
    )
    .get();
}

/**
 * Speichert die Agent-Rückmeldung zum Auftrag.
 */
export async function applyScriptResult(
  db: Db,
  agentId: string,
  result: AgentScriptResultIn,
  now = new Date(),
): Promise<void> {
  const job = await db
    .select()
    .from(monitoringScriptJobs)
    .where(and(eq(monitoringScriptJobs.id, result.jobId), eq(monitoringScriptJobs.agentId, agentId)))
    .get();
  if (!job) return;
  if (job.status === "done" || job.status === "error" || job.status === "expired") return;

  const timedOut = Boolean(result.timedOut);
  const errText = clipScriptOutput(result.error?.trim() || (timedOut ? "Zeitüberschreitung." : ""), 2000);
  const status: MonitoringScriptJobStatus = timedOut || Boolean(result.error?.trim()) ? "error" : "done";
  await db
    .update(monitoringScriptJobs)
    .set({
      status,
      exitCode: result.exitCode ?? null,
      stdout: clipScriptOutput(result.stdout),
      stderr: clipScriptOutput(result.stderr),
      errorMessage: errText || null,
      finishedAt: now,
    })
    .where(eq(monitoringScriptJobs.id, job.id));
}

/**
 * Nächster pending-Job für den Heartbeat; setzt Status auf running.
 */
export async function takePendingScriptJob(
  db: Db,
  agentId: string,
  now = new Date(),
): Promise<{ id: string; timeoutSec: number; script: string } | null> {
  const rows = await db
    .select()
    .from(monitoringScriptJobs)
    .where(and(eq(monitoringScriptJobs.agentId, agentId), eq(monitoringScriptJobs.status, "pending")))
    .orderBy(asc(monitoringScriptJobs.createdAt))
    .limit(1)
    .all();
  const job = rows[0];
  if (!job) return null;
  await db
    .update(monitoringScriptJobs)
    .set({ status: "running", startedAt: now })
    .where(eq(monitoringScriptJobs.id, job.id));
  return { id: job.id, timeoutSec: job.timeoutSec, script: job.script };
}

/**
 * Neuen Auftrag anlegen.
 */
export async function createScriptJob(
  db: Db,
  input: {
    agentId: string;
    assetId: string | null;
    userId: string;
    script: string;
    templateId?: string | null;
    timeoutSec?: number;
  },
): Promise<ScriptJobWire> {
  const script = input.script.trim();
  if (!script) throw new Error("Skript fehlt");
  if (script.length > SCRIPT_MAX_CHARS) throw new Error("Skript ist zu lang");
  const open = await findOpenScriptJob(db, input.agentId);
  if (open) throw new Error("Es läuft bereits ein Auftrag auf diesem Gerät");
  let templateId: string | null = null;
  if (input.templateId) {
    const tpl = await db
      .select()
      .from(monitoringScriptTemplates)
      .where(eq(monitoringScriptTemplates.id, input.templateId))
      .get();
    if (tpl) templateId = tpl.id;
  }
  const timeoutSec = clampTimeout(input.timeoutSec);
  const now = new Date();
  const id = createId("msjob");
  await db.insert(monitoringScriptJobs).values({
    id,
    agentId: input.agentId,
    assetId: input.assetId,
    createdByUserId: input.userId,
    templateId,
    script,
    status: "pending",
    timeoutSec,
    createdAt: now,
  });
  const user = await db.select({ username: users.username }).from(users).where(eq(users.id, input.userId)).get();
  const row = await db.select().from(monitoringScriptJobs).where(eq(monitoringScriptJobs.id, id)).get();
  if (!row) throw new Error("Auftrag nicht gespeichert");
  return mapJob(row, user?.username ?? null);
}

function clampTimeout(value?: number): number {
  if (!Number.isFinite(value) || value == null) return SCRIPT_TIMEOUT_DEFAULT_SEC;
  return Math.min(SCRIPT_TIMEOUT_MAX_SEC, Math.max(SCRIPT_TIMEOUT_MIN_SEC, Math.round(value)));
}

/**
 * Letzte Aufträge eines Geräts.
 */
export async function listScriptJobsForAgent(db: Db, agentId: string): Promise<ScriptJobWire[]> {
  const rows = await db
    .select()
    .from(monitoringScriptJobs)
    .where(eq(monitoringScriptJobs.agentId, agentId))
    .orderBy(desc(monitoringScriptJobs.createdAt))
    .limit(SCRIPT_JOB_HISTORY)
    .all();
  const userIds = [...new Set(rows.map((r) => r.createdByUserId).filter((id): id is string => Boolean(id)))];
  const names = new Map<string, string>();
  if (userIds.length) {
    const found = await db.select({ id: users.id, username: users.username }).from(users).where(inArray(users.id, userIds)).all();
    for (const u of found) names.set(u.id, u.username);
  }
  return rows.map((row) => mapJob(row, row.createdByUserId ? names.get(row.createdByUserId) ?? null : null));
}

/**
 * Alle PowerShell-Vorlagen.
 */
export async function listScriptTemplates(db: Db): Promise<ScriptTemplateWire[]> {
  const rows = await db
    .select()
    .from(monitoringScriptTemplates)
    .orderBy(asc(monitoringScriptTemplates.name))
    .all();
  return rows.map(mapTemplate);
}

/**
 * Neue Vorlage speichern.
 */
export async function createScriptTemplate(db: Db, name: string, body: string): Promise<ScriptTemplateWire> {
  const n = name.trim();
  const script = body.trim();
  if (!n) throw new Error("Name fehlt");
  if (n.length > 80) throw new Error("Name ist zu lang");
  if (!script) throw new Error("Skript fehlt");
  if (script.length > SCRIPT_MAX_CHARS) throw new Error("Skript ist zu lang");
  const now = new Date();
  const id = createId("mstpl");
  await db.insert(monitoringScriptTemplates).values({
    id,
    name: n,
    body: script,
    createdAt: now,
    updatedAt: now,
  });
  const row = await db.select().from(monitoringScriptTemplates).where(eq(monitoringScriptTemplates.id, id)).get();
  if (!row) throw new Error("Vorlage nicht gespeichert");
  return mapTemplate(row);
}

/**
 * Vorlage ändern.
 */
export async function updateScriptTemplate(
  db: Db,
  id: string,
  patch: { name?: string; body?: string },
): Promise<ScriptTemplateWire | null> {
  const row = await db.select().from(monitoringScriptTemplates).where(eq(monitoringScriptTemplates.id, id)).get();
  if (!row) return null;
  const nextName = patch.name != null ? patch.name.trim() : row.name;
  const nextBody = patch.body != null ? patch.body.trim() : row.body;
  if (!nextName) throw new Error("Name fehlt");
  if (nextName.length > 80) throw new Error("Name ist zu lang");
  if (!nextBody) throw new Error("Skript fehlt");
  if (nextBody.length > SCRIPT_MAX_CHARS) throw new Error("Skript ist zu lang");
  const now = new Date();
  await db
    .update(monitoringScriptTemplates)
    .set({ name: nextName, body: nextBody, updatedAt: now })
    .where(eq(monitoringScriptTemplates.id, id));
  const updated = await db.select().from(monitoringScriptTemplates).where(eq(monitoringScriptTemplates.id, id)).get();
  return updated ? mapTemplate(updated) : null;
}

/**
 * Vorlage löschen.
 */
export async function deleteScriptTemplate(db: Db, id: string): Promise<boolean> {
  const row = await db.select().from(monitoringScriptTemplates).where(eq(monitoringScriptTemplates.id, id)).get();
  if (!row) return false;
  await db.delete(monitoringScriptTemplates).where(eq(monitoringScriptTemplates.id, id));
  return true;
}
