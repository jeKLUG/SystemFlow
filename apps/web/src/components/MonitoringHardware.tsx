import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { HelpHint } from "./HelpHint";
import { formatBytes, pct } from "../lib/monitoringUi";
import type { MonitoringHardware, MonitoringSnapshot } from "../types";

type SoftItem = NonNullable<MonitoringSnapshot["software"]>[number];

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

/** Version und Verlag, ohne Doppelung mit dem Programmnamen. */
function softwareMeta(item: SoftItem): string {
  const version = item.version?.trim() || "";
  const publisher = item.publisher?.trim() || "";
  const name = item.name.toLowerCase();
  return joinParts([
    publisher && !name.includes(publisher.toLowerCase()) ? publisher : null,
    version && !item.name.includes(version) ? version : null,
  ]);
}

function sortSoftware(items: SoftItem[]): SoftItem[] {
  return [...items].sort((a, b) => {
    if (Boolean(a.match) !== Boolean(b.match)) return a.match ? -1 : 1;
    return a.name.localeCompare(b.name, "de", { sensitivity: "base", numeric: true });
  });
}

/**
 * Eine Zeile in der Geräteliste der installierten Software.
 */
function SoftwareRow({ item, customerId }: { item: SoftItem; customerId?: string }) {
  const meta = softwareMeta(item);
  return (
    <li className={item.match ? "is-match" : undefined}>
      <span className="mon-hw-soft-name" title={item.name}>
        {item.name}
      </span>
      {meta ? (
        <span className="muted mon-hw-soft-meta" title={meta}>
          {meta}
        </span>
      ) : null}
      {item.match ? (
        customerId ? (
          <Link className="mon-hw-soft-hit" to={`/customers/${customerId}/assets`} title={item.match.name}>
            {item.match.name}
          </Link>
        ) : (
          <span className="mon-hw-soft-hit" title={item.match.name}>
            {item.match.name}
          </span>
        )
      ) : null}
    </li>
  );
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

function formatBiosDate(raw?: string): string | null {
  if (!raw?.trim()) return null;
  const m = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  return raw.trim();
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

function HealthChip({ health }: { health?: string | null }) {
  const h = (health || "").toLowerCase();
  if (h !== "ok" && h !== "warn" && h !== "fail") return null;
  const label = h === "fail" ? "Kritisch" : h === "warn" ? "Warnung" : "Ok";
  return <span className={`mon-hw-health is-${h}`}>{label}</span>;
}

function sessionLine(session?: MonitoringSnapshot["session"]): string | null {
  if (!session) return null;
  const users = [...(session.users ?? [])];
  if (session.user && !users.some((u) => u.toLowerCase() === session.user!.toLowerCase())) {
    users.unshift(session.user);
  }
  if (!users.length) return session.lastLogon ? `Letzte Anmeldung ${session.lastLogon}` : null;
  const extra = users.length > 1 ? ` · ${users.length} Sitzungen` : "";
  const last = session.lastLogon ? ` · zuletzt ${session.lastLogon}` : "";
  return `${users[0]}${extra}${last}`;
}

/**
 * Geräteausstattung auf einen Blick: Modell, Netz, SMART, Dienste, Software.
 */
export function MonitoringHardwarePanel({
  hardware,
  disks,
  processes,
  updates,
  session,
  network,
  ip,
  ips,
  services,
  software,
  customerId,
}: {
  hardware?: MonitoringHardware | null;
  disks?: DeviceDiskView[];
  processes?: MonitoringSnapshot["processes"];
  updates?: MonitoringSnapshot["updates"];
  session?: MonitoringSnapshot["session"];
  network?: MonitoringSnapshot["network"];
  ip?: string;
  ips?: string[];
  services?: MonitoringSnapshot["services"];
  software?: MonitoringSnapshot["software"];
  customerId?: string;
}) {
  const [softQuery, setSoftQuery] = useState("");
  const [softFilter, setSoftFilter] = useState<"all" | "match" | "missing">("all");
  const sysName = hardware ? systemTitle(hardware.system) : "";
  const sysLine = joinParts([hardware?.system?.manufacturer, hardware?.system?.model]);
  const boardName = hardware?.board?.product?.trim() || "";
  const boardMaker = hardware?.board?.manufacturer?.trim() || "";
  const boardSerial = hardware?.board?.serial?.trim() || "";
  const biosVersion = hardware?.bios?.version?.trim() || "";
  const biosDate = formatBiosDate(hardware?.bios?.date);
  const systemSerial = hardware?.system?.serial?.trim() || "";
  const cpus = hardware?.cpus ?? [];
  const ramModules = hardware?.memoryModules ?? [];
  const ramGroups = ramModules.length ? groupRam(ramModules) : [];
  const ramTotal = ramModules.reduce((sum, m) => sum + (m.sizeBytes ?? 0), 0);
  const storage = hardware?.storage ?? [];
  const gpus = hardware?.gpus ?? [];
  const nics = hardware?.nics ?? [];
  const userLine = sessionLine(session);
  const lanIp = ip || ips?.[0] || "";
  const hasNet = Boolean(
    network?.publicIp ||
      network?.gateway ||
      (network?.dns && network.dns.length) ||
      network?.dhcp != null ||
      (ips && ips.length) ||
      nics.length,
  );
  const hasHw = Boolean(
    hardware &&
      (sysName ||
        boardName ||
        boardSerial ||
        biosVersion ||
        systemSerial ||
        cpus.length ||
        ramModules.length ||
        storage.length ||
        gpus.length ||
        nics.length),
  );
  const hasLive = Boolean(
    (disks?.length ?? 0) > 0 ||
      (processes?.length ?? 0) > 0 ||
      updates ||
      userLine ||
      hasNet ||
      (services?.length ?? 0) > 0 ||
      (software?.length ?? 0) > 0,
  );

  const matchedCount = (software ?? []).filter((s) => s.match).length;
  const missingCount = (software ?? []).length - matchedCount;
  const filteredSoftware = useMemo(() => {
    const q = softQuery.trim().toLowerCase();
    return sortSoftware(
      (software ?? []).filter((s) => {
        if (softFilter === "match" && !s.match) return false;
        if (softFilter === "missing" && s.match) return false;
        if (!q) return true;
        return [s.name, s.publisher, s.version, s.match?.name].some((v) => v?.toLowerCase().includes(q));
      }),
    );
  }, [software, softQuery, softFilter]);
  const matchedVisible = filteredSoftware.filter((s) => s.match);
  const missingVisible = filteredSoftware.filter((s) => !s.match);

  if (!hasHw && !hasLive) {
    return (
      <div className="mon-block">
        <h3>Gerät</h3>
        <p className="muted">
          Noch keine Komponenten gemeldet. Agent 1.0.6 oder neuer installieren — die Inventur kommt
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
      const spec = joinParts([
        g.type && g.speedMhz ? `${g.type}-${g.speedMhz}` : g.type,
        g.speedMhz && !g.type ? `${g.speedMhz} MT/s` : null,
      ]);
      const qty = g.count > 1 ? `${g.count}× ${piece}` : piece;
      return joinParts([qty, spec, g.manufacturer]);
    })
    .filter(Boolean)
    .join(" · ");

  const storageBytes = storage.reduce((s, d) => s + (d.sizeBytes ?? 0), 0);
  const hottestDisk = disks?.length
    ? disks.reduce((a, b) => (a.usedPct >= b.usedPct ? a : b))
    : undefined;
  const storageHealth = storage.some((s) => s.health === "fail" || s.health === "warn");
  const storageSub = joinParts([
    storage[0]
      ? joinParts([storage[0].media, storage[0].bus, storage.length > 1 ? `${storage.length} Laufwerke` : null])
      : null,
    hottestDisk ? `${Math.round(hottestDisk.usedPct)} % belegt` : null,
  ]);

  const gpu = gpus[0];
  const nic = nics[0];
  const dns = (network?.dns ?? []).filter(Boolean);

  return (
    <div className="mon-hw">
      {hasHw || userLine || updates?.pendingCount || updates?.rebootPending ? (
        <section className="mon-hw-hero">
          <div className="mon-hw-hero-top">
            <div>
              <p className="eyebrow">Ausstattung</p>
              <h3 className="mon-hw-model">{sysName || "Unbekanntes System"}</h3>
              {sysLine && sysLine !== sysName ? <p className="muted">{sysLine}</p> : null}
              {userLine ? <p className="mon-hw-user">{userLine}</p> : null}
            </div>
            <div className="mon-hw-pills">
              {updates?.rebootPending ? <span className="mon-hw-update-pill is-reboot">Neustart nötig</span> : null}
              {updates?.pendingCount ? (
                <span className="mon-hw-update-pill">{updates.pendingCount} Updates</span>
              ) : null}
            </div>
          </div>
          {systemSerial || boardName || boardSerial || biosVersion ? (
            <dl className="mon-hw-specs">
              {systemSerial ? (
                <div>
                  <dt>Seriennummer</dt>
                  <dd>{systemSerial}</dd>
                </div>
              ) : null}
              {boardName || boardMaker ? (
                <div>
                  <dt>Mainboard</dt>
                  <dd>{boardName || boardMaker}</dd>
                  {boardName &&
                  boardMaker &&
                  boardMaker.toLowerCase() !== hardware?.system?.manufacturer?.toLowerCase() ? (
                    <dd className="muted">{boardMaker}</dd>
                  ) : null}
                </div>
              ) : null}
              {boardSerial ? (
                <div>
                  <dt>Board-SN</dt>
                  <dd>{boardSerial}</dd>
                </div>
              ) : null}
              {biosVersion || biosDate ? (
                <div>
                  <dt>BIOS</dt>
                  <dd>{biosVersion || biosDate}</dd>
                  {biosVersion && biosDate ? <dd className="muted">{biosDate}</dd> : null}
                </div>
              ) : null}
            </dl>
          ) : null}
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
                warn={Boolean(hottestDisk?.over || storageHealth)}
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
                label="Adapter"
                value={nic.name?.replace(/\s+/g, " ") || "NIC"}
                sub={joinParts([nic.speedMbps ? `${nic.speedMbps} Mbit/s` : null, nic.mac])}
              />
            ) : null}
          </div>
        </section>
      ) : (
        <h3>Gerät</h3>
      )}

      {hasNet ? (
        <div className="mon-hw-section">
          <h4>Netzwerk</h4>
          <div className="mon-hw-cards mon-hw-net-cards">
            <HwCard label="LAN" value={lanIp || ips?.[0] || "–"} sub={joinParts([network?.adapter, ips && ips.length > 1 ? ips.slice(1).join(" · ") : null])} />
            <HwCard label="Öffentlich" value={network?.publicIp || "–"} sub={network?.publicIp ? "WAN-Adresse" : "Nicht ermittelt"} />
            <HwCard label="Gateway" value={network?.gateway || "–"} />
            <HwCard
              label="DNS"
              value={dns[0] || "–"}
              sub={joinParts([dns.slice(1).join(" · ") || null, network?.dhcp == null ? null : network.dhcp ? "DHCP" : "Statisch"])}
            />
          </div>
          {network?.dhcp != null ? (
            <p className="mon-hw-dhcp">
              <span className={`mon-hw-health ${network.dhcp ? "is-ok" : "is-info"}`}>{network.dhcp ? "DHCP" : "Statisch"}</span>
              {network.adapter ? <span className="muted"> {network.adapter}</span> : null}
            </p>
          ) : null}
          {nics.length > 1 ? (
            <ul className="mon-hw-nics">
              {nics.map((n, i) => (
                <li key={`${n.mac}-${i}`}>
                  <strong>{n.name || "NIC"}</strong>
                  <span className="muted">
                    {joinParts([n.manufacturer, n.speedMbps ? `${n.speedMbps} Mbit/s` : null, n.mac])}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {disks?.length ? (
        <div className="mon-hw-section">
          <h4>Datenträger</h4>
          <ul className="mon-hw-disks">
            {disks.map((d, i) => {
              const phys = storage[Math.min(i, Math.max(0, storage.length - 1))];
              const showPhys = storage.length === 1 || storage.length === disks.length;
              const health = showPhys ? phys?.health : undefined;
              const bad = health === "fail" || health === "warn";
              return (
                <li key={d.id} className={d.over || bad ? "is-over" : undefined}>
                  <div className="mon-hw-disk-head">
                    <strong>
                      {d.name} <HealthChip health={health} />
                    </strong>
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
                  <HealthChip health={s.health} />{" "}
                  {joinParts([s.model || s.name, formatSize(s.sizeBytes), s.media, s.bus, s.serial])}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : storage.length ? (
        <div className="mon-hw-section">
          <h4>Datenträger</h4>
          <ul className="mon-hw-quiet">
            {storage.map((s, i) => (
              <li key={`${s.serial}-${i}`}>
                <HealthChip health={s.health} />{" "}
                {joinParts([s.model || s.name, formatSize(s.sizeBytes), s.media, s.bus, s.serial])}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {services?.length ? (
        <div className="mon-hw-section">
          <h4>Fehlgeschlagene Dienste</h4>
          <ul className="mon-hw-procs mon-hw-services">
            {services.map((s, i) => (
              <li key={`${s.name}-${i}`} className="is-warn">
                <span className="mon-hw-proc-name">{s.display || s.name}</span>
                <span className="muted">{s.name !== s.display ? s.name : ""}</span>
                <span className="mon-hw-health is-fail">{s.state || "gestoppt"}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {software?.length ? (
        <div className="mon-hw-section mon-hw-soft-block">
          <div className="mon-hw-soft-head">
            <div className="page-head-title">
              <h4>Software</h4>
              <HelpHint text="Installierte Programme dieses Geräts. Ein Treffer in Grün liegt als Lizenz oder Software im Inventar." />
            </div>
            <input
              type="search"
              value={softQuery}
              onChange={(e) => setSoftQuery(e.target.value)}
              placeholder="Suchen…"
              aria-label="Software durchsuchen"
            />
          </div>
          <div className="mon-hw-soft-filters" role="tablist" aria-label="Software filtern">
            {(
              [
                ["all", "Alle", software.length],
                ["match", "Inventar", matchedCount],
                ["missing", "Fehlt", missingCount],
              ] as const
            ).map(([id, label, count]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={softFilter === id}
                className={`mon-hw-soft-filter${softFilter === id ? " is-active" : ""}`}
                onClick={() => setSoftFilter(id)}
              >
                {label}
                <em>{count}</em>
              </button>
            ))}
          </div>
          {filteredSoftware.length === 0 ? (
            <p className="muted">Keine Treffer.</p>
          ) : softFilter === "all" && matchedVisible.length > 0 && missingVisible.length > 0 ? (
            <div className="mon-hw-soft-pane">
              <p className="mon-hw-soft-label">Im Inventar</p>
              <ul className="mon-hw-soft">
                {matchedVisible.map((s, i) => (
                  <SoftwareRow key={`${s.name}-${s.version}-${i}`} item={s} customerId={customerId} />
                ))}
              </ul>
              <p className="mon-hw-soft-label">Nicht erfasst</p>
              <ul className="mon-hw-soft">
                {missingVisible.map((s, i) => (
                  <SoftwareRow key={`${s.name}-${s.version}-${i}`} item={s} customerId={customerId} />
                ))}
              </ul>
            </div>
          ) : (
            <div className="mon-hw-soft-pane">
              <ul className="mon-hw-soft">
                {filteredSoftware.map((s, i) => (
                  <SoftwareRow key={`${s.name}-${s.version}-${i}`} item={s} customerId={customerId} />
                ))}
              </ul>
            </div>
          )}
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
