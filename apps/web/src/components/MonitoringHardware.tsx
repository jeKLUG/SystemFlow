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

function isApipa(ip: string): boolean {
  return ip.startsWith("169.254.");
}

function isPrivateLan(ip: string): boolean {
  if (ip.startsWith("10.") || ip.startsWith("192.168.")) return true;
  const m = ip.match(/^172\.(\d+)\./);
  if (!m) return false;
  const n = Number(m[1]);
  return n >= 16 && n <= 31;
}

/** Bevorzugt eine echte LAN-Adresse, APIPA nur als Notnagel. */
function pickLanAddresses(ip?: string, ips?: string[], publicIp?: string) {
  const all = [...new Set([ip, ...(ips ?? [])].filter((v): v is string => Boolean(v?.trim())))].filter(
    (v) => v !== publicIp,
  );
  const lan = all.filter(isPrivateLan);
  const apipa = all.filter(isApipa);
  const other = all.filter((v) => !isPrivateLan(v) && !isApipa(v));
  const primary = lan[0] || other[0] || apipa[0] || "";
  const extras = [...lan, ...other].filter((v) => v !== primary);
  return { primary, extras, apipaOnly: Boolean(primary && isApipa(primary) && !lan.length) };
}

function isVirtualGpu(name?: string): boolean {
  return /displaylink|usb|remote|microsoft basic|virtual|mirror/i.test(name || "");
}

/** Bevorzugt eine eingebaute GPU, überspringt USB-/DisplayLink-Adapter. */
function pickGpu(
  gpus: NonNullable<MonitoringHardware["gpus"]>,
  cpuName?: string,
): NonNullable<MonitoringHardware["gpus"]>[number] | null {
  const real = gpus.filter((g) => !isVirtualGpu(g.name));
  if (real.length) return real[0];
  if (/radeon|uhd|iris|vega|graphics/i.test(cpuName || "")) return null;
  return gpus[0] ?? null;
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

function diskModelLabel(raw?: string): string | null {
  const t = raw?.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  return t || null;
}

type PhysDisk = NonNullable<MonitoringHardware["storage"]>[number];

/**
 * Ein Laufwerk mit Belegung, Gesundheit und Hardware-Chips.
 */
function DiskVolume({ disk, phys }: { disk: DeviceDiskView; phys?: PhysDisk }) {
  const health = phys?.health;
  const bad = health === "fail" || health === "warn";
  const used = Math.round(disk.usedPct);
  const chips = [
    phys?.media,
    phys?.bus && phys.bus !== phys.media ? phys.bus : null,
    disk.over && disk.thresh != null ? `Warnung ab ${disk.thresh} %` : null,
  ].filter((v): v is string => Boolean(v));
  const model = diskModelLabel(phys?.model || phys?.name);
  const serial = phys?.serial?.trim() || "";

  return (
    <article className={`mon-hw-disk${disk.over || bad ? " is-over" : ""}`}>
      <div className="mon-hw-disk-head">
        <div className="mon-hw-disk-title">
          <strong>{disk.name}</strong>
          <HealthChip health={health} />
        </div>
        <div className="mon-hw-disk-stats">
          <span>
            <em>{used} %</em> belegt
          </span>
          <span>
            <em>{disk.freeLabel}</em> frei
          </span>
          <span className="muted">
            <em>{disk.totalLabel}</em> gesamt
          </span>
        </div>
      </div>
      <Meter value={disk.usedPct} warn={disk.over || bad} />
      {chips.length || model || serial ? (
        <ul className="mon-hw-chips">
          {chips.map((chip) => (
            <li key={chip}>{chip}</li>
          ))}
          {model ? <li className="is-wide" title={model}>{model}</li> : null}
          {serial ? (
            <li className="is-mono" title={serial}>
              {serial}
            </li>
          ) : null}
        </ul>
      ) : null}
    </article>
  );
}

/**
 * Physisches Laufwerk ohne gemountetes Volume.
 */
function DiskPhys({ disk }: { disk: PhysDisk }) {
  const model = diskModelLabel(disk.model || disk.name) || "Datenträger";
  const serial = disk.serial?.trim() || "";
  return (
    <article className="mon-hw-disk is-phys">
      <div className="mon-hw-disk-head">
        <div className="mon-hw-disk-title">
          <strong>{model}</strong>
          <HealthChip health={disk.health} />
        </div>
        {disk.sizeBytes ? (
          <div className="mon-hw-disk-stats">
            <span>
              <em>{formatSize(disk.sizeBytes)}</em> Kapazität
            </span>
          </div>
        ) : null}
      </div>
      <ul className="mon-hw-chips">
        {disk.media ? <li>{disk.media}</li> : null}
        {disk.bus && disk.bus !== disk.media ? <li>{disk.bus}</li> : null}
        {serial ? (
          <li className="is-mono" title={serial}>
            {serial}
          </li>
        ) : null}
      </ul>
    </article>
  );
}

function Meter({ value, warn }: { value: number | null | undefined; warn?: boolean }) {
  if (value == null || !Number.isFinite(value)) return null;
  return (
    <span className={`mon-meter${warn ? " is-over" : ""}`} aria-hidden>
      <span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </span>
  );
}

function formatLinkSpeed(mbps?: number): string | null {
  if (!mbps || !Number.isFinite(mbps) || mbps <= 0) return null;
  if (mbps >= 1000) {
    const g = mbps / 1000;
    return `${g >= 10 || Number.isInteger(g) ? g.toFixed(0) : g.toFixed(1)} Gbit/s`;
  }
  return `${mbps} Mbit/s`;
}

function nicKindLabel(name: string): string | null {
  if (/wi-?fi|wlan|802\.11|wireless/i.test(name)) return "WLAN";
  if (/ethernet|lan|usb/i.test(name)) return "LAN";
  return null;
}

/** Kleine Netz-Kachel für eine Adresse (LAN, WAN, Gateway, DNS). */
function NetAddr({
  label,
  value,
  chips,
  warn,
}: {
  label: string;
  value: string;
  chips?: string[];
  warn?: boolean;
}) {
  return (
    <article className={`mon-hw-net-addr${warn ? " is-warn" : ""}`}>
      <span className="mon-hw-card-label">{label}</span>
      <strong className="mon-hw-net-ip" title={value}>
        {value}
      </strong>
      {chips?.length ? (
        <ul className="mon-hw-net-chips">
          {chips.map((chip) => (
            <li key={chip}>{chip}</li>
          ))}
        </ul>
      ) : null}
    </article>
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
  return `Angemeldet: ${users[0]}${extra}${last}`;
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

  const gpu = pickGpu(gpus, cpu?.name);
  const dns = (network?.dns ?? []).filter(Boolean);
  const lan = pickLanAddresses(ip, ips, network?.publicIp || undefined);
  const ident = joinParts([
    hardware?.system?.manufacturer,
    sysLine && sysLine !== sysName ? hardware?.system?.model : null,
    boardName && boardName !== sysName && boardName !== hardware?.system?.model ? boardName : null,
    systemSerial ? `SN ${systemSerial}` : boardSerial ? `SN ${boardSerial}` : null,
    systemSerial && boardSerial && boardSerial !== systemSerial ? `Platine ${boardSerial}` : null,
    biosVersion ? `BIOS ${biosVersion}` : biosDate,
    biosVersion && biosDate ? biosDate : null,
  ]);
  const lanMode = network?.dhcp == null ? null : network.dhcp ? "DHCP" : "Statisch";
  const adapterHint = (network?.adapter || "").trim().toLowerCase();
  const lanChips = [
    lan.apipaOnly ? "APIPA" : lanMode,
    ...lan.extras.slice(0, 3),
  ].filter((v): v is string => Boolean(v));
  const dnsChips = dns.slice(1);

  return (
    <div className="mon-hw">
      {hasHw || userLine || updates?.pendingCount || updates?.rebootPending ? (
        <section className="mon-hw-hero">
          <div className="mon-hw-hero-top">
            <div>
              <p className="eyebrow">Ausstattung</p>
              <h3 className="mon-hw-model">{sysName || "Unbekanntes System"}</h3>
              {ident ? <p className="muted">{ident}</p> : sysLine && sysLine !== sysName ? <p className="muted">{sysLine}</p> : null}
              {userLine ? <p className="mon-hw-user">{userLine}</p> : null}
            </div>
            <div className="mon-hw-pills">
              {updates?.rebootPending ? <span className="mon-hw-update-pill is-reboot">Neustart nötig</span> : null}
              {updates?.pendingCount ? (
                <span className="mon-hw-update-pill">{updates.pendingCount} Updates</span>
              ) : null}
            </div>
          </div>
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
          </div>
        </section>
      ) : (
        <h3>Gerät</h3>
      )}

      {hasNet ? (
        <div className="mon-hw-section">
          <h4>Netzwerk</h4>
          <div className="mon-hw-net">
            {lan.primary || network?.publicIp || network?.gateway || dns[0] ? (
              <div className="mon-hw-net-addrs">
                {lan.primary || lan.apipaOnly ? (
                  <NetAddr
                    label="LAN"
                    value={lan.primary || "–"}
                    chips={lanChips}
                    warn={lan.apipaOnly}
                  />
                ) : null}
                {network?.publicIp ? <NetAddr label="Öffentlich" value={network.publicIp} /> : null}
                {network?.gateway ? <NetAddr label="Gateway" value={network.gateway} /> : null}
                {dns[0] ? <NetAddr label="DNS" value={dns[0]} chips={dnsChips} /> : null}
              </div>
            ) : null}
            {nics.length ? (
              <ul className="mon-hw-nics">
                {nics.map((n, i) => {
                  const name = n.name?.replace(/\s+/g, " ") || "Adapter";
                  const active = Boolean(
                    adapterHint &&
                      (name.toLowerCase().includes(adapterHint) || adapterHint.includes(name.toLowerCase())),
                  );
                  const speed = formatLinkSpeed(n.speedMbps);
                  const kind = nicKindLabel(name);
                  return (
                    <li key={`${n.mac}-${i}`} className={active ? "is-active" : undefined}>
                      <span className="mon-hw-nic-main">
                        <strong title={name}>{name}</strong>
                        {active ? <span className="mon-hw-nic-chip is-on">Aktiv</span> : null}
                        {kind && !active ? <span className="mon-hw-nic-chip">{kind}</span> : null}
                      </span>
                      {speed ? <span className="mon-hw-nic-speed">{speed}</span> : <span />}
                      <span className="mon-hw-nic-mac">{n.mac || n.manufacturer || ""}</span>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}

      {disks?.length ? (
        <div className="mon-hw-section">
          <h4>Datenträger</h4>
          <div className="mon-hw-disk-panel">
            {disks.map((d, i) => {
              const phys = storage[Math.min(i, Math.max(0, storage.length - 1))];
              const showPhys = storage.length === 1 || storage.length === disks.length;
              return <DiskVolume key={d.id} disk={d} phys={showPhys ? phys : undefined} />;
            })}
            {storage.length > 1 && storage.length !== disks.length
              ? storage.map((s, i) => <DiskPhys key={`${s.serial}-${i}`} disk={s} />)
              : null}
          </div>
        </div>
      ) : storage.length ? (
        <div className="mon-hw-section">
          <h4>Datenträger</h4>
          <div className="mon-hw-disk-panel">
            {storage.map((s, i) => (
              <DiskPhys key={`${s.serial}-${i}`} disk={s} />
            ))}
          </div>
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
