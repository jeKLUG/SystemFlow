import { useMemo, useState } from "react";
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

/** Dateiendung weg, Anzeigename wie im Taskmanager. */
function displayName(raw: string): string {
  return raw.replace(/\.(exe|bin)$/i, "").trim() || raw;
}

function fmtCpu(n: number): string {
  if (!Number.isFinite(n) || n < 0.05) return "0 %";
  if (n < 10) return `${n.toFixed(1)} %`;
  return `${Math.round(n)} %`;
}

function fmtRam(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 KB";
  if (n < 1024 ** 2) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 ** 3) {
    const mb = n / 1024 ** 2;
    return mb >= 100 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
  }
  const gb = n / 1024 ** 3;
  return gb >= 10 ? `${Math.round(gb)} GB` : `${gb.toFixed(1)} GB`;
}

function barPct(value: number, max: number): number {
  if (!(max > 0) || !(value > 0)) return 0;
  return Math.min(100, (value / max) * 100);
}

/**
 * Prozessliste: Name, Instanzen, CPU- und RAM-Balken; Sortierung über Schalter oder die Spalte.
 */
export function MonitoringProcessList({
  processes,
  sort,
  onSort,
}: {
  processes: Proc[];
  sort: ProcessSort;
  onSort: (next: ProcessSort) => void;
}) {
  const [query, setQuery] = useState("");
  const grouped = useMemo(() => groupProcesses(processes), [processes]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = q
      ? grouped.filter((p) => p.name.toLowerCase().includes(q) || displayName(p.name).toLowerCase().includes(q))
      : grouped;
    return [...rows].sort((a, b) => (sort === "ram" ? b.rss - a.rss : b.cpu - a.cpu));
  }, [grouped, query, sort]);
  const maxCpu = Math.max(0.01, ...filtered.map((p) => p.cpu));
  const maxRss = Math.max(1, ...filtered.map((p) => p.rss));

  if (!processes.length) {
    return <p className="muted">Keine Prozesse im letzten Heartbeat.</p>;
  }

  return (
    <div className="mon-proc">
      <div className="mon-proc-toolbar">
        <div className="mon-hw-soft-filters" role="tablist" aria-label="Sortierung">
          <button
            type="button"
            role="tab"
            aria-selected={sort === "cpu"}
            className={`mon-hw-soft-filter${sort === "cpu" ? " is-active" : ""}`}
            onClick={() => onSort("cpu")}
          >
            CPU
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={sort === "ram"}
            className={`mon-hw-soft-filter${sort === "ram" ? " is-active" : ""}`}
            onClick={() => onSort("ram")}
          >
            RAM
          </button>
        </div>
        <input
          type="search"
          className="mon-proc-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Suchen…"
          aria-label="Prozess suchen"
        />
        <span className="muted mon-proc-meta">
          {filtered.length === grouped.length
            ? `${grouped.length}`
            : `${filtered.length}/${grouped.length}`}
        </span>
      </div>
      {filtered.length === 0 ? (
        <p className="muted">Keine Treffer.</p>
      ) : (
        <ol className="mon-proc-list">
          {filtered.map((p, i) => {
            const label = displayName(p.name);
            return (
              <li key={p.name} className={i === 0 ? "is-top" : undefined}>
                <span className="mon-proc-rank" aria-hidden>
                  {i + 1}
                </span>
                <div className="mon-proc-main">
                  <div className="mon-proc-head">
                    <strong title={p.name}>{label}</strong>
                    {p.count > 1 ? (
                      <span className="mon-proc-count" title={`${p.count} Instanzen`}>
                        {p.count}
                      </span>
                    ) : null}
                  </div>
                  <div className="mon-proc-metrics">
                    <button
                      type="button"
                      className={`mon-proc-metric is-cpu${sort === "cpu" ? " is-sort" : ""}`}
                      onClick={() => onSort("cpu")}
                      aria-pressed={sort === "cpu"}
                      aria-label={`CPU ${fmtCpu(p.cpu)}, nach CPU sortieren`}
                    >
                      <span className="mon-proc-metric-label">CPU</span>
                      <span className="mon-proc-val">{fmtCpu(p.cpu)}</span>
                      <span className="mon-meter" aria-hidden>
                        <span style={{ width: `${barPct(p.cpu, maxCpu)}%` }} />
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`mon-proc-metric is-ram${sort === "ram" ? " is-sort" : ""}`}
                      onClick={() => onSort("ram")}
                      aria-pressed={sort === "ram"}
                      aria-label={`RAM ${fmtRam(p.rss)}, nach RAM sortieren`}
                    >
                      <span className="mon-proc-metric-label">RAM</span>
                      <span className="mon-proc-val">{fmtRam(p.rss)}</span>
                      <span className="mon-meter" aria-hidden>
                        <span style={{ width: `${barPct(p.rss, maxRss)}%` }} />
                      </span>
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
