import { type ReactNode, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { HelpHint } from "./HelpHint";
import { formatClockOffset } from "../lib/monitoringUi";
import type { MonitoringClock, MonitoringHardware, MonitoringSnapshot } from "../types";

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

function formatSize(n: number | null | undefined, whole = false): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return "–";
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(0)} MB`;
  const gb = n / 1024 ** 3;
  if (gb < 1024) {
    if (whole || gb >= 10 || Math.abs(gb - Math.round(gb)) < 0.08) return `${Math.round(gb)} GB`;
    return `${gb.toFixed(1)} GB`;
  }
  return `${(gb / 1024).toFixed(1)} TB`;
}

const brandNames: Record<string, string> = {
  LENOVO: "Lenovo",
  DELL: "Dell",
  HP: "HP",
  "HEWLETT-PACKARD": "HP",
  ASUS: "ASUS",
  ASUSTEK: "ASUS",
  ACER: "Acer",
  MICROSOFT: "Microsoft",
  APPLE: "Apple",
  FUJITSU: "Fujitsu",
  TOSHIBA: "Toshiba",
  SAMSUNG: "Samsung",
  GIGABYTE: "Gigabyte",
  MSI: "MSI",
};

/** Hersteller lesbar, ohne SCHREIWEISE aus dem BIOS. */
function prettyBrand(raw?: string | null): string {
  const t = raw?.trim() || "";
  return brandNames[t.toUpperCase()] || t;
}

function shortVendor(raw?: string | null): string | null {
  const t = raw?.trim() || "";
  if (!t) return null;
  return t.replace(/\s+(technology|technologies|corp\.?|corporation|inc\.?)$/i, "").trim() || t;
}

/** Interne Board-Codes (z. B. LNVNB161216) gehören nicht in die Übersicht. */
function isInternalBoardId(name: string, model?: string, title?: string): boolean {
  if (!name || name === model || name === title) return false;
  return /^[A-Z0-9]{8,}$/.test(name);
}

function firewallView(fw: NonNullable<MonitoringSnapshot["firewall"]>): {
  value: string;
  warn: boolean;
  chips: string[];
} {
  const profiles = fw.profiles ?? [];
  const chips = profiles.map((p) => `${p.name} ${p.enabled ? "an" : "aus"}`);
  const active = (fw.active || "").trim().toLowerCase();
  const current = active ? profiles.find((p) => p.name.toLowerCase() === active) : undefined;
  if (current) return { value: `${current.name}: ${current.enabled ? "an" : "aus"}`, warn: !current.enabled, chips };
  if (profiles.length === 1) {
    return { value: profiles[0].enabled ? "An" : "Aus", warn: !profiles[0].enabled, chips };
  }
  const importantOff = profiles.some(
    (p) => ["domain", "private", "host", "ufw", "firewalld"].includes(p.name.toLowerCase()) && !p.enabled,
  );
  return { value: importantOff ? "Teilweise aus" : "An", warn: importantOff, chips };
}

function isRamLikeSocket(socket?: string | null): boolean {
  return /lpddr|ddr[2345]|dimm|sodimm/i.test(socket || "");
}

/** Entfernt die integrierte GPU aus dem CPU-Namen, wenn sie extra als Grafik steht. */
function shortCpuName(name: string): string {
  return name.replace(/\s+w\/\s+.+$/i, "").trim() || name;
}

function isIntegratedGpu(gpuName: string, cpuName?: string): boolean {
  if (!cpuName) return false;
  if (/radeon\s*\d+/i.test(gpuName) && /radeon\s*\d+/i.test(cpuName)) return true;
  if (/(uhd|iris)\s*\d*/i.test(gpuName) && /(uhd|iris)/i.test(cpuName)) return true;
  return false;
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
  chips,
  warn,
}: {
  label: string;
  value: string;
  chips?: Array<string | null | undefined>;
  warn?: boolean;
}) {
  const visible = (chips ?? []).map((c) => c?.trim()).filter((c): c is string => Boolean(c));
  return (
    <article className={`mon-hw-card${warn ? " is-warn" : ""}`}>
      <span className="mon-hw-card-label">{label}</span>
      <strong title={value}>{value}</strong>
      {visible.length ? (
        <ul className="mon-hw-chips">
          {visible.map((chip) => (
            <li key={chip}>{chip}</li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

/**
 * Beschriftetes Kurzfeld in der Geräte-Übersicht (Hersteller, SN, Benutzer …).
 */
function Fact({ label, value, hint }: { label: string; value: string; hint?: string | null }) {
  return (
    <div className="mon-hw-fact">
      <span className="mon-hw-card-label">{label}</span>
      <strong title={value}>{value}</strong>
      {hint ? <span className="muted">{hint}</span> : null}
    </div>
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

/** Angemeldete Windows-/Linux-Benutzer ohne Duplikate. */
function sessionUsers(session?: MonitoringSnapshot["session"]): string[] {
  if (!session) return [];
  const users = [...(session.users ?? [])];
  if (session.user && !users.some((u) => u.toLowerCase() === session.user!.toLowerCase())) {
    users.unshift(session.user);
  }
  return users.map((u) => u.trim()).filter(Boolean);
}

/**
 * Geräteausstattung auf einen Blick: Modell, Netz, Uhrzeit, Pings, Dienst-Wächter, SMART, Software.
 */
export function MonitoringHardwarePanel({
  hardware,
  disks,
  updates,
  session,
  network,
  ip,
  ips,
  services,
  software,
  customerId,
  defender,
  firewall,
  crash,
  pings,
  watches,
  clock,
}: {
  hardware?: MonitoringHardware | null;
  disks?: DeviceDiskView[];
  updates?: MonitoringSnapshot["updates"];
  session?: MonitoringSnapshot["session"];
  network?: MonitoringSnapshot["network"];
  ip?: string;
  ips?: string[];
  services?: MonitoringSnapshot["services"];
  software?: MonitoringSnapshot["software"];
  customerId?: string;
  defender?: MonitoringSnapshot["defender"];
  firewall?: MonitoringSnapshot["firewall"];
  crash?: MonitoringSnapshot["crash"];
  pings?: ReactNode;
  watches?: ReactNode;
  clock?: MonitoringClock | null;
}) {
  const [softQuery, setSoftQuery] = useState("");
  const [softFilter, setSoftFilter] = useState<"all" | "match" | "missing">("all");
  const sysName = hardware ? systemTitle(hardware.system) : "";
  const manufacturer = prettyBrand(hardware?.system?.manufacturer);
  const modelNr = hardware?.system?.model?.trim() || "";
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
  const users = sessionUsers(session);
  const hasSession = Boolean(users.length || session?.lastLogon);
  const hasNet = Boolean(
    network?.publicIp ||
      network?.gateway ||
      (network?.dns && network.dns.length) ||
      network?.dhcp != null ||
      (ips && ips.length) ||
      nics.length ||
      pings ||
      clock,
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
      updates ||
      hasSession ||
      hasNet ||
      (services?.length ?? 0) > 0 ||
      (software?.length ?? 0) > 0 ||
      Boolean(defender) ||
      Boolean(firewall) ||
      Boolean(crash?.unexpected) ||
      Boolean(pings) ||
      Boolean(watches) ||
      Boolean(clock),
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
      ? formatSize(ramTotal, true)
      : ramGroups.length
        ? formatSize(ramGroups.reduce((s, g) => s + g.sizeBytes * g.count, 0), true)
        : null;
  const ramChips = ramGroups.flatMap((g) => {
    const piece = formatSize(g.sizeBytes, true);
    const qty = g.count > 1 ? `${g.count} × ${piece}` : ramGroups.length > 1 ? piece : null;
    const spec = g.type && g.speedMhz ? `${g.type}-${g.speedMhz}` : g.type || (g.speedMhz ? `${g.speedMhz} MT/s` : null);
    return [qty, spec, shortVendor(g.manufacturer)];
  });

  const storageBytes = storage.reduce((s, d) => s + (d.sizeBytes ?? 0), 0);
  const hottestDisk = disks?.length
    ? disks.reduce((a, b) => (a.usedPct >= b.usedPct ? a : b))
    : undefined;
  const storageHealth = storage.some((s) => s.health === "fail" || s.health === "warn");
  const storageChips = [
    storage[0]?.media,
    storage[0]?.bus && storage[0].bus !== storage[0].media ? storage[0].bus : null,
    storage.length > 1 ? `${storage.length} Laufwerke` : null,
    hottestDisk ? `${Math.round(hottestDisk.usedPct)} % belegt` : null,
  ];

  const gpu = pickGpu(gpus, cpu?.name);
  const gpuIntegrated = gpu?.name ? isIntegratedGpu(gpu.name, cpu?.name) : false;
  const cpuName = cpu?.name ? (gpu && gpuIntegrated ? shortCpuName(cpu.name) : cpu.name) : "";
  const dns = (network?.dns ?? []).filter(Boolean);
  const lan = pickLanAddresses(ip, ips, network?.publicIp || undefined);
  const identityFacts = [
    manufacturer && manufacturer.toLowerCase() !== sysName.toLowerCase()
      ? { label: "Hersteller", value: manufacturer }
      : null,
    modelNr && modelNr !== sysName && modelNr.toLowerCase() !== manufacturer.toLowerCase()
      ? { label: "Typ", value: modelNr }
      : null,
    boardName &&
    !isInternalBoardId(boardName, modelNr, sysName) &&
    boardName !== modelNr
      ? { label: "Board", value: boardName }
      : null,
    systemSerial || boardSerial ? { label: "Seriennr.", value: systemSerial || boardSerial } : null,
    biosVersion ? { label: "BIOS", value: biosVersion, hint: biosDate } : biosDate ? { label: "BIOS", value: biosDate } : null,
    users.length
      ? {
          label: "Benutzer",
          value: users.join(", "),
          hint: users.length > 1 ? `${users.length} Sitzungen` : null,
        }
      : null,
    session?.lastLogon ? { label: "Zuletzt", value: session.lastLogon } : null,
  ].filter((f): f is { label: string; value: string; hint?: string | null } => Boolean(f));
  const lanMode = network?.dhcp == null ? null : network.dhcp ? "DHCP" : "Statisch";
  const adapterHint = (network?.adapter || "").trim().toLowerCase();
  const lanChips = [
    lan.apipaOnly ? "APIPA" : lanMode,
    ...lan.extras.slice(0, 3),
  ].filter((v): v is string => Boolean(v));
  const dnsChips = dns.slice(1);
  const fwView = firewall ? firewallView(firewall) : null;

  return (
    <div className="mon-hw">
      {hasHw || hasSession || updates?.pendingCount || updates?.rebootPending || crash?.unexpected ? (
        <section className="mon-hw-hero">
          <div className="mon-hw-hero-top">
            <div>
              <p className="eyebrow">Ausstattung</p>
              <h3 className="mon-hw-model">{sysName || "Unbekanntes System"}</h3>
            </div>
            <div className="mon-hw-pills">
              {crash?.unexpected ? (
                <span className="mon-hw-update-pill" title={crash.reason || undefined}>
                  Unerwarteter Neustart
                </span>
              ) : null}
              {updates?.rebootPending ? <span className="mon-hw-update-pill is-reboot">Neustart nötig</span> : null}
              {updates?.pendingCount ? (
                <span className="mon-hw-update-pill">{updates.pendingCount} Updates</span>
              ) : null}
            </div>
          </div>
          {identityFacts.length ? (
            <div className="mon-hw-facts">
              {identityFacts.map((f) => (
                <Fact key={f.label} label={f.label} value={f.value} hint={f.hint} />
              ))}
            </div>
          ) : null}
          <div className="mon-hw-cards">
            {cpu ? (
              <HwCard
                label="CPU"
                value={cpuName || cpu.name || "Prozessor"}
                chips={[
                  cpu.cores != null ? `${cpu.cores} Kerne` : null,
                  cpu.threads && cpu.threads !== cpu.cores ? `${cpu.threads} Threads` : null,
                  formatClock(cpu.mhz),
                  cpu.socket && !isRamLikeSocket(cpu.socket) ? cpu.socket : null,
                ]}
              />
            ) : null}
            {ramHeadline ? (
              <HwCard label="RAM" value={ramHeadline} chips={ramChips.length ? ramChips : [`${ramModules.length} Riegel`]} />
            ) : null}
            {storageBytes > 0 || hottestDisk ? (
              <HwCard
                label="Speicher"
                value={storageBytes > 0 ? formatSize(storageBytes, true) : hottestDisk?.totalLabel || "–"}
                chips={storageChips.length ? storageChips : [storage[0]?.model]}
                warn={Boolean(hottestDisk?.over || storageHealth)}
              />
            ) : null}
            {gpu ? (
              <HwCard
                label="Grafik"
                value={gpu.name || "GPU"}
                chips={[
                  gpuIntegrated ? "integriert" : null,
                  gpu.vramBytes ? formatSize(gpu.vramBytes) : null,
                ]}
              />
            ) : null}
          </div>
        </section>
      ) : (
        <h3>Gerät</h3>
      )}

      {defender || firewall ? (
        <div className="mon-hw-section">
          <h4>Schutz</h4>
          <div className="mon-hw-cards">
            {defender ? (
              <HwCard
                label="Antivirus"
                value={
                  defender.realtime === false || defender.antivirus === false
                    ? "Aus"
                    : defender.realtime
                      ? "Echtzeitschutz an"
                      : defender.product || "Defender"
                }
                chips={[
                  defender.product && defender.product !== "Microsoft Defender" ? defender.product : null,
                  defender.signaturesAgeHours != null
                    ? defender.signaturesAgeHours < 24
                      ? `Signaturen ${defender.signaturesAgeHours} h`
                      : `Signaturen ${Math.round(defender.signaturesAgeHours / 24)} Tage`
                    : defender.signaturesUpdated || null,
                  defender.lastScan ? `Scan ${defender.lastScan.replace("T", " ").slice(0, 16)}` : null,
                ]}
                warn={
                  defender.realtime === false ||
                  defender.antivirus === false ||
                  (defender.signaturesAgeHours != null && defender.signaturesAgeHours > 168)
                }
              />
            ) : null}
            {fwView ? (
              <HwCard label="Firewall" value={fwView.value} chips={fwView.chips} warn={fwView.warn} />
            ) : null}
          </div>
        </div>
      ) : null}

      {hasNet ? (
        <div className="mon-hw-section">
          <h4>Netzwerk</h4>
          <div className="mon-hw-net">
            {lan.primary || network?.publicIp || network?.gateway || dns[0] || (clock && clock.offsetSec != null) ? (
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
                {network?.gateway ? (
                  <NetAddr
                    label="Gateway"
                    value={network.gateway}
                    chips={[
                      network.gatewayOk === true ? "erreichbar" : network.gatewayOk === false ? "keine Antwort" : null,
                    ].filter((v): v is string => Boolean(v))}
                    warn={network.gatewayOk === false}
                  />
                ) : null}
                {dns[0] ? (
                  <NetAddr
                    label="DNS"
                    value={dns[0]}
                    chips={[
                      network?.dnsOk === true ? "löst auf" : network?.dnsOk === false ? "keine Antwort" : null,
                      ...dnsChips,
                    ].filter((v): v is string => Boolean(v))}
                    warn={network?.dnsOk === false}
                  />
                ) : null}
                {clock && clock.offsetSec != null ? (
                  <NetAddr
                    label="Uhrzeit"
                    value={formatClockOffset(clock.offsetSec)}
                    chips={[
                      clock.source?.startsWith("ntp:") ? "NTP" : clock.source?.startsWith("http:") ? "HTTP" : clock.source || null,
                    ].filter((v): v is string => Boolean(v))}
                    warn={clock.ok === false}
                  />
                ) : null}
              </div>
            ) : null}
            {pings}
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

      {(watches || services?.length) ? (
        <div className="mon-hw-section">
          <h4>Dienste</h4>
          {watches}
          {services?.length ? (
            <>
              <h5 className="mon-hw-sub">Fehlgeschlagene Auto-Start-Dienste</h5>
              <ul className="mon-hw-procs mon-hw-services">
                {services.map((s, i) => (
                  <li key={`${s.name}-${i}`} className="is-warn">
                    <span className="mon-hw-proc-name">{s.display || s.name}</span>
                    <span className="muted">{s.name !== s.display ? s.name : ""}</span>
                    <span className="mon-hw-health is-fail">{s.state || "gestoppt"}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
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
    </div>
  );
}
