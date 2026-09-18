import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, rename, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import type { FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import {
  agentPackagePlatforms,
  monitoringAgentPackages,
  type AgentPackagePlatform,
  type MonitoringAgentPackage,
} from "../db/schema.js";
import { createId } from "./id.js";

export const AGENT_PACKAGE_PLATFORMS: {
  id: AgentPackagePlatform;
  label: string;
  filename: string;
}[] = [
  { id: "windows-amd64", label: "Windows 64-bit", filename: "systemhaus-agent.exe" },
  { id: "linux-amd64", label: "Linux 64-bit (x86_64)", filename: "systemhaus-agent" },
  { id: "linux-arm64", label: "Linux ARM64 (aarch64)", filename: "systemhaus-agent" },
];

const PLATFORM_SET = new Set<string>(agentPackagePlatforms);

/**
 * Prüft, ob `value` eine unterstützte Agent-Plattform ist.
 */
export function isAgentPackagePlatform(value: string): value is AgentPackagePlatform {
  return PLATFORM_SET.has(value);
}

/**
 * Vergleicht zwei Agent-Versionen (punktgetrennt, numerisch). Negativ = a < b.
 */
export function compareAgentVersions(a: string, b: string): number {
  const pa = a.split(/[^\d]+/).filter(Boolean).map((n) => Number(n) || 0);
  const pb = b.split(/[^\d]+/).filter(Boolean).map((n) => Number(n) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da < db ? -1 : 1;
  }
  return 0;
}

/**
 * Ermittelt die Paket-Plattform aus OS/Architektur oder einem expliziten Wert.
 */
export function platformFromAgent(opts: {
  platform?: string | null;
  os?: string | null;
  arch?: string | null;
}): AgentPackagePlatform | null {
  const explicit = (opts.platform ?? "").trim().toLowerCase();
  if (isAgentPackagePlatform(explicit)) return explicit;
  const os = (opts.os ?? "").trim().toLowerCase();
  const arch = (opts.arch ?? "").trim().toLowerCase();
  const archNorm =
    arch === "x64" || arch === "x86_64" ? "amd64" : arch === "aarch64" ? "arm64" : arch;
  if (os.includes("win")) {
    if (archNorm === "amd64" || archNorm === "") return "windows-amd64";
  }
  if (os.includes("linux")) {
    if (archNorm === "amd64" || archNorm === "") return "linux-amd64";
    if (archNorm === "arm64") return "linux-arm64";
  }
  return null;
}

function packagesDir(uploadDir: string): string {
  return join(uploadDir, "agent-packages");
}

/**
 * Absoluter Pfad zur gespeicherten Binary; `null` wenn die Datei fehlt.
 */
export function packageFilePath(uploadDir: string, storedName: string): string {
  return join(uploadDir, storedName);
}

/**
 * SHA-256 (hex) einer Datei.
 */
export async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(path);
  for await (const chunk of stream) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

export type PublicPackageInfo = {
  platform: AgentPackagePlatform;
  version: string;
  filename: string;
  sha256: string;
  sizeBytes: number;
  uploadedAt: Date;
};

function toPublic(row: MonitoringAgentPackage): PublicPackageInfo {
  return {
    platform: row.platform as AgentPackagePlatform,
    version: row.version,
    filename: row.filename,
    sha256: row.sha256,
    sizeBytes: row.sizeBytes,
    uploadedAt: row.uploadedAt,
  };
}

/**
 * Lädt alle hochgeladenen Agent-Pakete.
 */
export async function listAgentPackages(db: Db): Promise<PublicPackageInfo[]> {
  const rows = await db.select().from(monitoringAgentPackages).all();
  return rows.map(toPublic);
}

/**
 * Version je Plattform für Geräte-Zusammenfassungen.
 */
export async function agentPackageVersionMap(db: Db): Promise<Map<string, PublicPackageInfo>> {
  const map = new Map<string, PublicPackageInfo>();
  for (const pkg of await listAgentPackages(db)) map.set(pkg.platform, pkg);
  return map;
}

/**
 * Ein Paket nach Plattform.
 */
export async function getAgentPackage(
  db: Db,
  platform: AgentPackagePlatform,
): Promise<MonitoringAgentPackage | undefined> {
  return db
    .select()
    .from(monitoringAgentPackages)
    .where(eq(monitoringAgentPackages.platform, platform))
    .get();
}

export type SavedAgentPackage = {
  id: string;
  filename: string;
  bytesRead: number;
  tmpPath: string;
};

/**
 * Speichert die erste Datei eines Multipart-Requests unter `agent-packages/`.
 */
export async function saveAgentPackageUpload(
  request: FastifyRequest,
  uploadDir: string,
): Promise<{ uploaded: SavedAgentPackage | null; fields: Record<string, string> }> {
  const fields: Record<string, string> = {};
  let uploaded: SavedAgentPackage | null = null;
  const tmpDir = join(packagesDir(uploadDir), "_tmp");
  await mkdir(tmpDir, { recursive: true });

  for await (const part of request.parts()) {
    if (part.type === "file") {
      if (uploaded) {
        part.file.resume();
        continue;
      }
      const id = createId("apag");
      const safeName = part.filename.replace(/[^\w.\-()+\säöüÄÖÜß]/gi, "_").slice(0, 180) || "agent.bin";
      const tmpPath = join(tmpDir, `${id}_${safeName}`);
      await pipeline(part.file, createWriteStream(tmpPath));
      if (part.file.truncated) {
        await unlink(tmpPath).catch(() => undefined);
        throw new Error("UPLOAD_ABORTED");
      }
      uploaded = {
        id,
        filename: part.filename || safeName,
        bytesRead: Number(part.file.bytesRead || 0),
        tmpPath,
      };
    } else {
      fields[part.fieldname] = String(part.value ?? "").trim();
    }
  }

  return { uploaded, fields };
}

/**
 * Ersetzt das aktuelle Binary einer Plattform (alte Datei wird gelöscht).
 */
export async function commitAgentPackage(
  db: Db,
  uploadDir: string,
  opts: {
    platform: AgentPackagePlatform;
    version: string;
    uploaded: SavedAgentPackage;
  },
): Promise<PublicPackageInfo> {
  const destDir = join(packagesDir(uploadDir), opts.platform);
  await mkdir(destDir, { recursive: true });
  const storedName = `agent-packages/${opts.platform}/${opts.uploaded.id}_${opts.uploaded.filename.replace(/[^\w.\-()+\säöüÄÖÜß]/gi, "_").slice(0, 180)}`;
  const destPath = join(uploadDir, storedName);
  await mkdir(dirname(destPath), { recursive: true });
  await rename(opts.uploaded.tmpPath, destPath);
  const digest = await sha256File(destPath);
  const now = new Date();

  const existing = await getAgentPackage(db, opts.platform);
  if (existing) {
    const oldPath = packageFilePath(uploadDir, existing.storedName);
    if (oldPath !== destPath && existsSync(oldPath)) {
      await unlink(oldPath).catch(() => undefined);
    }
    await db
      .update(monitoringAgentPackages)
      .set({
        version: opts.version,
        filename: opts.uploaded.filename,
        sha256: digest,
        sizeBytes: opts.uploaded.bytesRead,
        storedName,
        uploadedAt: now,
      })
      .where(eq(monitoringAgentPackages.id, existing.id));
    const row = await getAgentPackage(db, opts.platform);
    return toPublic(row!);
  }

  await db.insert(monitoringAgentPackages).values({
    id: opts.uploaded.id,
    platform: opts.platform,
    version: opts.version,
    filename: opts.uploaded.filename,
    sha256: digest,
    sizeBytes: opts.uploaded.bytesRead,
    storedName,
    uploadedAt: now,
  });
  const row = await getAgentPackage(db, opts.platform);
  return toPublic(row!);
}

/**
 * Löscht Paket-Metadaten und Datei einer Plattform.
 */
export async function deleteAgentPackage(
  db: Db,
  uploadDir: string,
  platform: AgentPackagePlatform,
): Promise<boolean> {
  const existing = await getAgentPackage(db, platform);
  if (!existing) return false;
  const path = packageFilePath(uploadDir, existing.storedName);
  if (existsSync(path)) await unlink(path).catch(() => undefined);
  await db.delete(monitoringAgentPackages).where(eq(monitoringAgentPackages.id, existing.id));
  return true;
}

