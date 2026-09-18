import { formatBytes, pct } from "../lib/monitoringUi";
import type { MonitoringHardware, MonitoringSnapshot } from "../types";

const memoryTypeMap: Record<string, string> = {
  "20": "DDR",
  "21": "DDR2",
  "24": "DDR3",
  "26": "DDR3",
  "27": "DDR4",
  "30": "DDR4",
  "34": "DDR5",
  "35": "LPDDR5",
};

function formatSize(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return "–";
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(0)} MB`;
  const gb = n / 1024 ** 3;
  if (gb < 1024) return `${gb >= 10 ? gb.toFixed(0) : gb.toFixed(1)} GB`;
  return `${(gb / 1024).toFixed(1)} TB`;
}

function joinParts(parts: Array<string | null | undefined>): string {
  return parts.map((p) => p?.trim()).filter(Boolean).join(" · ");
}

function systemTitle(system?: MonitoringHardware["system"]): string {
  const sku = system?.sku?.trim() || "";
  const afterFm = sku.split(/FM[_-]/i).pop()?.replace(/_/g, " ").trim();
  if (afterFm && afterFm.length >= 4 && afterFm !== sku) return afterFm;
  if (sku && sku.length > 12 && /[a-z]/.test(sku)) return sku.replace(/_/g, " ");
  return joinParts([system?.manufacturer, system?.model]) || sku || "Unbekanntes System";
}

function memoryTypeLabel(raw?: string): string | null {
  if (!raw?.trim()) return null;
  const digits = raw.match(/\d+/);
  if (digits && memoryTypeMap[digits[0]]) return memoryTypeMap[digits[0]];
  return raw.replace(/^Type\s+/i, "").trim() || null;
}

function formatClock(mhz?: number): string | null {
  if (!mhz || !Number.isFinite(mhz)) return null;
  if (mhz >= 1000) {
    const ghz = mhz / 1000;
    return `${ghz >= 10 ? ghz.toFixed(0) : ghz.toFixed(1)} GHz`;
  }
  return `${mhz} MHz`;
}

function groupRam(modules: NonNullable<MonitoringHardware["memoryModules"]>) {
  const map = new Map<
    string,
    {
      count: number;
      sizeBytes: number;
      manufacturer?: string;
      type?: string | null;
      speedMhz?: number;
      partNumber?: string;
    }
  >();
  for (const m of modules) {
    const type = memoryTypeLabel(m.type);
    const key = [m.sizeBytes ?? 0, type || "", m.speedMhz ?? 0, m.manufacturer || "", m.partNumber || ""].join("|");
    const prev = map.get(key);
    if (prev) prev.count += 1;
    else {
      map.set(key, {
        count: 1,
        sizeBytes: m.sizeBytes ?? 0,
        manufacturer: m.manufacturer,
        type,
        speedMhz: m.speedMhz,
        partNumber: m.partNumber,
      });
    }
  }
  return [...map.values()];
}

function Meter({ value, warn }: { value: number | null | undefined; warn?: boolean }) {
  if (value == null || !Number.isFinite(value)) return null;
  return (
    <span className={`mon-meter${warn ? " is-over" : ""}`} aria-hidden>
      <span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </span>
  );
}

function HwCard({
  label,
  value,
  sub,
  warn,
}: {
  label: string;
  value: string;
  sub?: string | null;
  warn?: boolean;
}) {
  return (
    <article className={`mon-hw-card${warn ? " is-warn" : ""}`}>
      <span className="mon-hw-card-label">{label}</span>
      <strong>{value}</strong>
      {sub ? <p>{sub}</p> : null}
    </article>
  );
}

export type DeviceDiskView = {
  id: string;
  name: string;
  usedPct: number;
  freeLabel: string;
  totalLabel: string;
  over: boolean;
  thresh?: number;
};

/**
 * Geräteausstattung auf einen Blick: Modell, CPU, RAM, Speicher, Netz, Prozesse.
 */
export function MonitoringHardwarePanel({
  hardware,
  disks,
  processes,
  updates,
}: {
  hardware?: MonitoringHardware | null;
  disks?: DeviceDiskView[];
  processes?: MonitoringSnapshot["processes"];
  updates?: MonitoringSnapshot["updates"];
}) {
  const sysName = hardware ? systemTitle(hardware.system) : "";
  const sysLine = joinParts([hardware?.system?.manufacturer, hardware?.system?.model]);
  const board = joinParts([hardware?.board?.manufacturer, hardware?.board?.product]);
  const bios = joinParts([hardware?.bios?.vendor, hardware?.bios?.version, hardware?.bios?.date]);
  const cpus = hardware?.cpus ?? [];
  const ramModules = hardware?.memoryModules ?? [];
  const ramGroups = ramModules.length ? groupRam(ramModules) : [];
  const ramTotal = ramModules.reduce((sum, m) => sum + (m.sizeBytes ?? 0), 0);
  const storage = hardware?.storage ?? [];
  const gpus = hardware?.gpus ?? [];
  const nics = hardware?.nics ?? [];
  const hasHw = Boolean(
    hardware &&
      (sysName || board || bios || cpus.length || ramModules.length || storage.length || gpus.length || nics.length),
  );
  const hasLive = Boolean((disks?.length ?? 0) > 0 || (processes?.length ?? 0) > 0 || updates);

  if (!hasHw && !hasLive) {
    return (
      <div className="mon-block">
        <h3>Gerät</h3>
        <p className="muted">
          Noch keine Komponenten gemeldet. Agent 1.0.2 oder neuer installieren — die Inventur kommt
          mit dem nächsten Heartbeat.
        </p>
      </div>
    );
  }

  const cpu = cpus[0];
  const ramHeadline =
    ramTotal > 0
      ? formatSize(ramTotal)
      : ramGroups.length
        ? formatSize(ramGroups.reduce((s, g) => s + g.sizeBytes * g.count, 0))
        : null;
  const ramSub = ramGroups
    .map((g) => {
      const piece = formatSize(g.sizeBytes);
      const spec = joinParts([g.type && g.speedMhz ? `${g.type}-${g.speedMhz}` : g.type, g.speedMhz && !g.type ? `${g.speedMhz} MT/s` : null]);
      const qty = g.count > 1 ? `${g.count}× ${piece}` : piece;
      return joinParts([qty, spec, g.manufacturer]);
    })
    .filter(Boolean)
    .join(" · ");

  const storageBytes = storage.reduce((s, d) => s + (d.sizeBytes ?? 0), 0);
  const hottestDisk = disks?.length
    ? disks.reduce((a, b) => (a.usedPct >= b.usedPct ? a : b))
    : undefined;
  const storageSub = joinParts([
    storage[0] ? joinParts([storage[0].media, storage[0].bus, storage.length > 1 ? `${storage.length} Laufwerke` : null]) : null,
    hottestDisk ? `${Math.round(hottestDisk.usedPct)} % belegt` : null,
  ]);

  const gpu = gpus[0];
  const nic = nics[0];

  return (
    <div className="mon-hw">
      {hasHw ? (
        <div className="mon-hw-identity">
          <div>
            <h3>Ausstattung</h3>
            <p className="mon-hw-model">{sysName || "Unbekanntes System"}</p>
            {sysLine && sysLine !== sysName ? <p className="muted">{sysLine}</p> : null}
          </div>
          <ul className="mon-hw-tags">
            {hardware?.system?.serial ? <li>SN {hardware.system.serial}</li> : null}
            {board ? <li>{board}</li> : null}
            {hardware?.board?.serial ? <li>Board {hardware.board.serial}</li> : null}
            {bios ? <li>BIOS {bios}</li> : null}
            {updates?.pendingCount ? <li className="is-warn">{updates.pendingCount} Updates</li> : null}
          </ul>
        </div>
      ) : (
        <h3>Gerät</h3>
      )}

      <div className="mon-hw-cards">
        {cpu ? (
          <HwCard
            label="CPU"
            value={cpu.name || "Prozessor"}
            sub={joinParts([
              cpu.cores != null
                ? `${cpu.cores} Kerne${cpu.threads && cpu.threads !== cpu.cores ? ` · ${cpu.threads} Threads` : ""}`
                : null,
              formatClock(cpu.mhz),
              cpu.socket,
            ])}
          />
        ) : null}
        {ramHeadline ? <HwCard label="RAM" value={ramHeadline} sub={ramSub || `${ramModules.length} Riegel`} /> : null}
        {storageBytes > 0 || hottestDisk ? (
          <HwCard
            label="Speicher"
            value={storageBytes > 0 ? formatSize(storageBytes) : hottestDisk?.totalLabel || "–"}
            sub={storageSub || storage[0]?.model}
            warn={hottestDisk?.over}
          />
        ) : null}
        {gpu ? (
          <HwCard
            label="Grafik"
            value={gpu.name || "GPU"}
            sub={joinParts([gpu.vramBytes ? formatSize(gpu.vramBytes) : null, gpu.driver ? `Treiber ${gpu.driver}` : null])}
          />
        ) : null}
        {nic ? (
          <HwCard
            label="Netzwerk"
            value={nic.name?.replace(/\s+/g, " ") || "NIC"}
            sub={joinParts([nic.speedMbps ? `${nic.speedMbps} Mbit/s` : null, nic.mac])}
          />
        ) : null}
      </div>

      {disks?.length ? (
        <div className="mon-hw-section">
          <h4>Datenträger</h4>
          <ul className="mon-hw-disks">
            {disks.map((d, i) => {
              const phys = storage[Math.min(i, Math.max(0, storage.length - 1))];
              const showPhys = storage.length === 1 || storage.length === disks.length;
              return (
                <li key={d.id} className={d.over ? "is-over" : undefined}>
                  <div className="mon-hw-disk-head">
                    <strong>{d.name}</strong>
                    <span>
                      {Math.round(d.usedPct)} % · {d.freeLabel} frei
                    </span>
                  </div>
                  <Meter value={d.usedPct} warn={d.over} />
                  <p className="muted">
                    {d.totalLabel} gesamt
                    {d.over && d.thresh != null ? ` · Warnung ab ${d.thresh} %` : ""}
                    {showPhys && phys
                      ? ` · ${joinParts([phys.model || phys.name, phys.media, phys.bus, phys.serial])}`
                      : ""}
                  </p>
                </li>
              );
            })}
          </ul>
          {storage.length > 1 && storage.length !== disks.length ? (
            <ul className="mon-hw-quiet">
              {storage.map((s, i) => (
                <li key={`${s.serial}-${i}`}>
                  {joinParts([s.model || s.name, formatSize(s.sizeBytes), s.media, s.bus, s.serial])}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : storage.length ? (
        <div className="mon-hw-section">
          <h4>Datenträger</h4>
          <p className="muted">
            {storage.map((s) => joinParts([s.model || s.name, formatSize(s.sizeBytes), s.media, s.bus])).join(" · ")}.
            Keine Laufwerksbelegung gemeldet.
          </p>
        </div>
      ) : null}

      {nics.length > 1 ? (
        <div className="mon-hw-section">
          <h4>Netzwerk</h4>
          <ul className="mon-hw-nics">
            {nics.map((n, i) => (
              <li key={`${n.mac}-${i}`}>
                <strong>{n.name || "NIC"}</strong>
                <span className="muted">{joinParts([n.manufacturer, n.speedMbps ? `${n.speedMbps} Mbit/s` : null, n.mac])}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {processes?.length ? (
        <div className="mon-hw-section">
          <h4>Top-Prozesse</h4>
          <ul className="mon-hw-procs">
            {processes.map((p, i) => (
              <li key={`${p.name}-${i}`}>
                <span className="mon-hw-proc-name">{p.name}</span>
                <span className="mon-hw-proc-cpu">{pct(p.cpuPercent ?? null)}</span>
                <span className="muted">{formatBytes(p.rssBytes)}</span>
                <Meter value={p.cpuPercent} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
