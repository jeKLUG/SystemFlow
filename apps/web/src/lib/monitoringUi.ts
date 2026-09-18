import type { MonitoringIssueKind, MonitoringSample } from "../types";

export const monitoringIssueLabel: Record<MonitoringIssueKind, string> = {
  offline: "Offline",
  disk: "Datenträger",
  cpu: "CPU",
  ram: "RAM",
  eventlog: "Ereignisse",
  updates: "Updates",
};

/**
 * Kurzlabels der ausgelösten Warnungen eines Geräts.
 */
export function deviceIssueChips(d: {
  issues: MonitoringIssueKind[];
  diskIssues?: { id: string; name: string }[];
}): string[] {
  const parts = d.issues.filter((i) => i !== "disk").map((i) => monitoringIssueLabel[i]);
  for (const disk of d.diskIssues ?? []) parts.push(`Datenträger ${disk.name}`);
  if (d.issues.includes("disk") && !(d.diskIssues ?? []).length) parts.push(monitoringIssueLabel.disk);
  return parts.length ? parts : ["Problem"];
}

export function deviceIssueText(d: {
  issues: MonitoringIssueKind[];
  diskIssues?: { id: string; name: string }[];
}): string {
  return deviceIssueChips(d).join(", ");
}

export function sampleTime(ts: string | number | Date): number {
  if (typeof ts === "number") return ts;
  if (ts instanceof Date) return ts.getTime();
  const n = Date.parse(ts);
  return Number.isFinite(n) ? n : 0;
}

export function formatBytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "–";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}

export function formatUptime(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return "–";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

/** Heartbeat gilt 2 Minuten als online – analog zum Server. */
export const MONITORING_ONLINE_MS = 2 * 60 * 1000;

export function isMonitoringOnline(iso: string | Date | null | undefined): boolean {
  if (!iso) return false;
  const t = sampleTime(iso);
  return t > 0 && Date.now() - t < MONITORING_ONLINE_MS;
}

/** Grober Versionsvergleich (1.0.4, 1.0.4-next). */
export function agentVersionAtLeast(version: string | null | undefined, min: string): boolean {
  if (!version) return false;
  const parse = (v: string) =>
    v
      .split(/[^\d]+/)
      .filter(Boolean)
      .map((n) => Number(n) || 0);
  const a = parse(version);
  const b = parse(min);
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    const da = a[i] ?? 0;
    const db = b[i] ?? 0;
    if (da > db) return true;
    if (da < db) return false;
  }
  return true;
}

export function relSeen(iso: string | null | undefined): string {
  if (!iso) return "nie";
  const t = sampleTime(iso);
  if (!t) return "nie";
  const delta = Date.now() - t;
  if (delta < 90_000) return "gerade eben";
  if (delta < 3600_000) return `vor ${Math.round(delta / 60_000)} Min.`;
  if (delta < 86400_000) return `vor ${Math.round(delta / 3600_000)} Std.`;
  return new Date(t).toLocaleString("de-DE");
}

export function pct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "–";
  return `${Math.round(n)} %`;
}

export function seriesFrom(samples: MonitoringSample[], key: keyof MonitoringSample) {
  return samples.map((s) => ({
    t: sampleTime(s.ts),
    v: typeof s[key] === "number" ? (s[key] as number) : null,
  }));
}

/**
 * Freitextsuche über Name, Hostname, IP und OS.
 */
export function deviceMatchesQuery(
  d: {
    assetName?: string;
    name?: string;
    hostname?: string | null;
    ipAddress?: string | null;
    os?: string | null;
  },
  query: string,
): boolean {
  const n = query.trim().toLowerCase();
  if (!n) return true;
  return [d.assetName, d.name, d.hostname, d.ipAddress, d.os].some((v) =>
    (v || "").toLowerCase().includes(n),
  );
}
