import { useMemo, useState } from "react";
import { formatBytes } from "../lib/monitoringUi";
import type { MonitoringSnapshot } from "../types";

type Proc = NonNullable<MonitoringSnapshot["processes"]>[number];
export type ProcessSort = "cpu" | "ram";

type GroupedProc = {
  name: string;
  cpu: number;
  rss: number;
  count: number;
};

function groupProcesses(list: Proc[]): GroupedProc[] {
  const map = new Map<string, GroupedProc>();
  for (const p of list) {
    const name = p.name?.trim() || "Unbekannt";
    const key = name.toLowerCase();
    const prev = map.get(key);
    const cpu = Number.isFinite(p.cpuPercent) ? Math.max(0, p.cpuPercent ?? 0) : 0;
    const rss = Number.isFinite(p.rssBytes) ? Math.max(0, p.rssBytes ?? 0) : 0;
    if (prev) {
      prev.cpu += cpu;
      prev.rss += rss;
      prev.count += 1;
    } else {
      map.set(key, { name, cpu, rss, count: 1 });
    }
  }
  return [...map.values()];
}

function fmtCpu(n: number): string {
  if (!Number.isFinite(n) || n < 0.05) return "0 %";
  if (n < 10) return `${n.toFixed(1)} %`;
  return `${Math.round(n)} %`;
}

/**
 * Prozessliste wie im Taskmanager: gruppiert nach Name, sortierbar nach CPU oder RAM.
 */
export function MonitoringProcessList({
  processes,
  sort,
  onSort,
  ramTotalBytes,
}: {
  processes: Proc[];
  sort: ProcessSort;
  onSort: (next: ProcessSort) => void;
  ramTotalBytes?: number | null;
}) {
  const [query, setQuery] = useState("");
  const grouped = useMemo(() => groupProcesses(processes), [processes]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = q ? grouped.filter((p) => p.name.toLowerCase().includes(q)) : grouped;
    return [...rows].sort((a, b) => (sort === "ram" ? b.rss - a.rss : b.cpu - a.cpu));
  }, [grouped, query, sort]);
  const maxCpu = Math.max(1, ...filtered.map((p) => p.cpu));
  const maxRss = Math.max(1, ...filtered.map((p) => p.rss));

  if (!processes.length) {
    return <p className="muted">Keine Prozesse im letzten Heartbeat.</p>;
  }

  return (
    <div className="mon-proc">
      <div className="mon-proc-toolbar">
        <input
          type="search"
          className="mon-proc-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Prozess suchen"
          aria-label="Prozess suchen"
        />
        <span className="muted mon-proc-meta">
          {filtered.length === grouped.length
            ? `${grouped.length} ${grouped.length === 1 ? "Prozess" : "Prozesse"}`
            : `${filtered.length} von ${grouped.length}`}
        </span>
      </div>
      <table className="mon-proc-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>
              <button
                type="button"
                className={sort === "cpu" ? "is-active" : undefined}
                onClick={() => onSort("cpu")}
              >
                CPU
              </button>
            </th>
            <th>
              <button
                type="button"
                className={sort === "ram" ? "is-active" : undefined}
                onClick={() => onSort("ram")}
              >
                RAM
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((p) => {
            const ramShare =
              ramTotalBytes && ramTotalBytes > 0 ? Math.min(100, (p.rss / ramTotalBytes) * 100) : null;
            const bar = sort === "ram" ? (p.rss / maxRss) * 100 : (p.cpu / maxCpu) * 100;
            return (
              <tr key={p.name}>
                <td>
                  <span className="mon-proc-cell">
                    <span className="mon-proc-name" title={p.name}>
                      {p.name}
                    </span>
                    {p.count > 1 ? <span className="mon-proc-count">{p.count}×</span> : null}
                  </span>
                </td>
                <td>
                  <span className="mon-proc-val">{fmtCpu(p.cpu)}</span>
                  {sort === "cpu" ? (
                    <span className="mon-meter" aria-hidden>
                      <span style={{ width: `${bar}%` }} />
                    </span>
                  ) : null}
                </td>
                <td>
                  <span className="mon-proc-val">
                    {formatBytes(p.rss)}
                    {ramShare != null && ramShare >= 0.5 ? ` · ${Math.round(ramShare)} %` : ""}
                  </span>
                  {sort === "ram" ? (
                    <span className="mon-meter" aria-hidden>
                      <span style={{ width: `${bar}%` }} />
                    </span>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
