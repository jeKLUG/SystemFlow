import { formatDateOnly } from "./labels";
import type { Asset, AssetKind } from "../types";

export type AssetFieldId =
  | "manufacturer"
  | "model"
  | "serialNumber"
  | "hostname"
  | "ipAddress"
  | "secondaryIp"
  | "macAddress"
  | "vlan"
  | "rack"
  | "os"
  | "firmware"
  | "cpu"
  | "ramGb"
  | "diskGb"
  | "ports"
  | "role"
  | "managementUrl"
  | "purchaseDate"
  | "installedAt"
  | "responsiblePerson"
  | "warrantyUntil"
  | "notes"
  | "portalVisible";

export type AssetFieldGroup = "product" | "specs" | "network" | "lifecycle";

export type AssetFieldSpec = {
  id: AssetFieldId;
  group: AssetFieldGroup;
  label: string;
  placeholder?: string;
  input?: "text" | "number" | "date" | "url" | "textarea";
  span2?: boolean;
};

const groupTitle: Record<AssetFieldGroup, string> = {
  product: "Gerät & Produkt",
  specs: "Ausstattung",
  network: "Netzwerk",
  lifecycle: "Laufzeit & Notizen",
};

function f(
  id: AssetFieldId,
  group: AssetFieldGroup,
  label: string,
  extra: Partial<AssetFieldSpec> = {},
): AssetFieldSpec {
  return { id, group, label, input: "text", ...extra };
}

const computerProduct = [
  f("manufacturer", "product", "Hersteller"),
  f("model", "product", "Modell"),
  f("serialNumber", "product", "Seriennummer", { placeholder: "Service-Tag / SN" }),
];

const computerSpecs = [
  f("cpu", "specs", "Prozessor"),
  f("ramGb", "specs", "RAM (GB)", { input: "number", placeholder: "16" }),
  f("diskGb", "specs", "Speicher (GB)", { input: "number", placeholder: "512" }),
  f("os", "specs", "Betriebssystem", { placeholder: "Windows 11 24H2" }),
];

const computerNet = [
  f("hostname", "network", "Hostname"),
  f("ipAddress", "network", "IP-Adresse"),
  f("macAddress", "network", "MAC-Adresse"),
];

const datesCommon = [
  f("responsiblePerson", "lifecycle", "Ansprechpartner"),
  f("purchaseDate", "lifecycle", "Kaufdatum", { input: "date" }),
  f("warrantyUntil", "lifecycle", "Garantie bis", { input: "date" }),
  f("notes", "lifecycle", "Notizen", { input: "textarea", span2: true }),
  f("portalVisible", "lifecycle", "Im Kundenportal zeigen", { span2: true }),
];

const kindFields: Record<AssetKind, AssetFieldSpec[]> = {
  pc: [
    ...computerProduct,
    ...computerSpecs,
    ...computerNet,
    ...datesCommon,
  ],
  laptop: [
    ...computerProduct,
    ...computerSpecs,
    ...computerNet,
    ...datesCommon,
  ],
  tablet: [
    ...computerProduct,
    f("os", "specs", "Betriebssystem", { placeholder: "iPadOS / Android" }),
    f("hostname", "network", "Gerätename"),
    f("ipAddress", "network", "IP-Adresse"),
    f("macAddress", "network", "MAC-Adresse / WLAN"),
    ...datesCommon,
  ],
  server: [
    ...computerProduct,
    f("role", "product", "Rolle", { placeholder: "DC, Fileserver, Hyper-V, …" }),
    ...computerSpecs,
    f("firmware", "specs", "BIOS / Firmware"),
    f("hostname", "network", "Hostname"),
    f("ipAddress", "network", "IP-Adresse"),
    f("secondaryIp", "network", "Weitere IP / iLO / iDRAC"),
    f("macAddress", "network", "MAC-Adresse"),
    f("vlan", "network", "VLAN"),
    f("rack", "network", "Rack / HE"),
    f("responsiblePerson", "lifecycle", "Ansprechpartner"),
    f("installedAt", "lifecycle", "In Betrieb seit", { input: "date" }),
    f("purchaseDate", "lifecycle", "Kaufdatum", { input: "date" }),
    f("warrantyUntil", "lifecycle", "Garantie / Support bis", { input: "date" }),
    f("notes", "lifecycle", "Notizen", { input: "textarea", span2: true }),
    f("portalVisible", "lifecycle", "Im Kundenportal zeigen", { span2: true }),
  ],
  firewall: [
    f("manufacturer", "product", "Hersteller", { placeholder: "Fortinet, OPNsense, …" }),
    f("model", "product", "Modell"),
    f("serialNumber", "product", "Seriennummer"),
    f("firmware", "specs", "Firmware"),
    f("hostname", "network", "Hostname"),
    f("ipAddress", "network", "LAN / Management-IP"),
    f("secondaryIp", "network", "WAN-IP"),
    f("macAddress", "network", "MAC-Adresse"),
    f("vlan", "network", "VLAN"),
    f("ports", "network", "Interfaces / Ports", { placeholder: "WAN, LAN, DMZ, …" }),
    f("managementUrl", "network", "Management-URL", { input: "url", placeholder: "https://…", span2: true }),
    f("rack", "network", "Rack / Platz"),
    f("purchaseDate", "lifecycle", "Kaufdatum", { input: "date" }),
    f("warrantyUntil", "lifecycle", "Support / Garantie bis", { input: "date" }),
    f("notes", "lifecycle", "Notizen", { input: "textarea", span2: true }),
    f("portalVisible", "lifecycle", "Im Kundenportal zeigen", { span2: true }),
  ],
  switch: [
    f("manufacturer", "product", "Hersteller"),
    f("model", "product", "Modell"),
    f("serialNumber", "product", "Seriennummer"),
    f("firmware", "specs", "Firmware"),
    f("ipAddress", "network", "Management-IP"),
    f("macAddress", "network", "MAC-Adresse"),
    f("vlan", "network", "Management-VLAN"),
    f("ports", "network", "Port-Ausstattung", { placeholder: "24×1G + 4×SFP+" }),
    f("managementUrl", "network", "Management-URL", { input: "url", span2: true }),
    f("rack", "network", "Rack / HE"),
    f("purchaseDate", "lifecycle", "Kaufdatum", { input: "date" }),
    f("warrantyUntil", "lifecycle", "Garantie bis", { input: "date" }),
    f("notes", "lifecycle", "Notizen", { input: "textarea", span2: true }),
    f("portalVisible", "lifecycle", "Im Kundenportal zeigen", { span2: true }),
  ],
  router: [
    f("manufacturer", "product", "Hersteller"),
    f("model", "product", "Modell"),
    f("serialNumber", "product", "Seriennummer"),
    f("firmware", "specs", "Firmware"),
    f("hostname", "network", "Hostname"),
    f("ipAddress", "network", "LAN-IP"),
    f("secondaryIp", "network", "WAN-IP"),
    f("macAddress", "network", "MAC-Adresse"),
    f("vlan", "network", "VLAN"),
    f("managementUrl", "network", "Management-URL", { input: "url", span2: true }),
    f("purchaseDate", "lifecycle", "Kaufdatum", { input: "date" }),
    f("warrantyUntil", "lifecycle", "Garantie bis", { input: "date" }),
    f("notes", "lifecycle", "Notizen", { input: "textarea", span2: true }),
    f("portalVisible", "lifecycle", "Im Kundenportal zeigen", { span2: true }),
  ],
  access_point: [
    f("manufacturer", "product", "Hersteller"),
    f("model", "product", "Modell"),
    f("serialNumber", "product", "Seriennummer"),
    f("firmware", "specs", "Firmware"),
    f("ipAddress", "network", "IP-Adresse"),
    f("macAddress", "network", "MAC-Adresse"),
    f("vlan", "network", "VLAN / SSID-Netz"),
    f("managementUrl", "network", "Controller / URL", { input: "url", span2: true }),
    f("purchaseDate", "lifecycle", "Kaufdatum", { input: "date" }),
    f("warrantyUntil", "lifecycle", "Garantie bis", { input: "date" }),
    f("notes", "lifecycle", "Notizen", { input: "textarea", span2: true }),
    f("portalVisible", "lifecycle", "Im Kundenportal zeigen", { span2: true }),
  ],
  printer: [
    f("manufacturer", "product", "Hersteller"),
    f("model", "product", "Modell"),
    f("serialNumber", "product", "Seriennummer"),
    f("hostname", "network", "Hostname"),
    f("ipAddress", "network", "IP-Adresse"),
    f("macAddress", "network", "MAC-Adresse"),
    f("managementUrl", "network", "Webinterface", { input: "url", span2: true }),
    f("responsiblePerson", "lifecycle", "Ansprechpartner"),
    f("purchaseDate", "lifecycle", "Kaufdatum", { input: "date" }),
    f("warrantyUntil", "lifecycle", "Garantie / Click-Vertrag bis", { input: "date" }),
    f("notes", "lifecycle", "Notizen", { input: "textarea", span2: true }),
    f("portalVisible", "lifecycle", "Im Kundenportal zeigen", { span2: true }),
  ],
  nas: [
    ...computerProduct,
    f("ramGb", "specs", "RAM (GB)", { input: "number" }),
    f("diskGb", "specs", "Brutto-Kapazität (GB)", { input: "number" }),
    f("os", "specs", "DSM / OS"),
    f("firmware", "specs", "Firmware"),
    f("hostname", "network", "Hostname"),
    f("ipAddress", "network", "IP-Adresse"),
    f("macAddress", "network", "MAC-Adresse"),
    f("managementUrl", "network", "Management-URL", { input: "url", span2: true }),
    f("rack", "network", "Rack / Platz"),
    f("purchaseDate", "lifecycle", "Kaufdatum", { input: "date" }),
    f("warrantyUntil", "lifecycle", "Garantie bis", { input: "date" }),
    f("notes", "lifecycle", "Notizen", { input: "textarea", span2: true }),
    f("portalVisible", "lifecycle", "Im Kundenportal zeigen", { span2: true }),
  ],
  ups: [
    f("manufacturer", "product", "Hersteller"),
    f("model", "product", "Modell"),
    f("serialNumber", "product", "Seriennummer"),
    f("ipAddress", "network", "NMC-IP"),
    f("macAddress", "network", "MAC-Adresse"),
    f("managementUrl", "network", "NMC / Management-URL", { input: "url", span2: true }),
    f("rack", "network", "Rack / Platz"),
    f("purchaseDate", "lifecycle", "Kaufdatum", { input: "date" }),
    f("warrantyUntil", "lifecycle", "Batterie / Garantie bis", { input: "date" }),
    f("notes", "lifecycle", "Notizen", { input: "textarea", span2: true }),
    f("portalVisible", "lifecycle", "Im Kundenportal zeigen", { span2: true }),
  ],
  phone: [
    f("manufacturer", "product", "Hersteller"),
    f("model", "product", "Modell"),
    f("serialNumber", "product", "Seriennummer"),
    f("hostname", "network", "Hostname"),
    f("ipAddress", "network", "IP-Adresse"),
    f("macAddress", "network", "MAC-Adresse"),
    f("responsiblePerson", "lifecycle", "Nutzer"),
    f("purchaseDate", "lifecycle", "Kaufdatum", { input: "date" }),
    f("warrantyUntil", "lifecycle", "Garantie bis", { input: "date" }),
    f("notes", "lifecycle", "Notizen", { input: "textarea", span2: true }),
    f("portalVisible", "lifecycle", "Im Kundenportal zeigen", { span2: true }),
  ],
  monitor: [
    f("manufacturer", "product", "Hersteller"),
    f("model", "product", "Modell"),
    f("serialNumber", "product", "Seriennummer"),
    f("responsiblePerson", "lifecycle", "Nutzer / Platz"),
    f("purchaseDate", "lifecycle", "Kaufdatum", { input: "date" }),
    f("warrantyUntil", "lifecycle", "Garantie bis", { input: "date" }),
    f("notes", "lifecycle", "Notizen", { input: "textarea", span2: true }),
    f("portalVisible", "lifecycle", "Im Kundenportal zeigen", { span2: true }),
  ],
  accessory: [
    f("manufacturer", "product", "Hersteller"),
    f("model", "product", "Modell / Bezeichnung"),
    f("serialNumber", "product", "Seriennummer"),
    f("purchaseDate", "lifecycle", "Kaufdatum", { input: "date" }),
    f("warrantyUntil", "lifecycle", "Garantie bis", { input: "date" }),
    f("notes", "lifecycle", "Notizen", { input: "textarea", span2: true, placeholder: "Zubehör, Kabel, Dongle, …" }),
    f("portalVisible", "lifecycle", "Im Kundenportal zeigen", { span2: true }),
  ],
  software: [
    f("manufacturer", "product", "Hersteller / Publisher"),
    f("model", "product", "Produkt / Edition"),
    f("serialNumber", "product", "Lizenzschlüssel", { span2: true }),
    f("managementUrl", "network", "Portal / Download", { input: "url", span2: true }),
    f("responsiblePerson", "lifecycle", "Lizenznehmer"),
    f("purchaseDate", "lifecycle", "Kaufdatum", { input: "date" }),
    f("warrantyUntil", "lifecycle", "Laufzeit bis", { input: "date" }),
    f("notes", "lifecycle", "Notizen", { input: "textarea", span2: true, placeholder: "Sitze, Zuweisung, …" }),
    f("portalVisible", "lifecycle", "Im Kundenportal zeigen", { span2: true }),
  ],
  license: [
    f("manufacturer", "product", "Hersteller"),
    f("model", "product", "Lizenz / Plan"),
    f("serialNumber", "product", "Lizenzschlüssel / Tenant", { span2: true }),
    f("managementUrl", "network", "Admin-Portal", { input: "url", span2: true }),
    f("responsiblePerson", "lifecycle", "Lizenznehmer"),
    f("purchaseDate", "lifecycle", "Beginn", { input: "date" }),
    f("warrantyUntil", "lifecycle", "Ende / Verlängerung", { input: "date" }),
    f("notes", "lifecycle", "Notizen", { input: "textarea", span2: true, placeholder: "Anzahl Sitze, CSP, …" }),
    f("portalVisible", "lifecycle", "Im Kundenportal zeigen", { span2: true }),
  ],
  network: [
    f("manufacturer", "product", "Hersteller"),
    f("model", "product", "Modell / Bezeichnung"),
    f("serialNumber", "product", "Seriennummer"),
    f("role", "product", "Rolle", { placeholder: "Patchfeld, Medienkonverter, …" }),
    f("ipAddress", "network", "IP-Adresse"),
    f("macAddress", "network", "MAC-Adresse"),
    f("vlan", "network", "VLAN"),
    f("ports", "network", "Ports"),
    f("managementUrl", "network", "Management-URL", { input: "url", span2: true }),
    f("notes", "lifecycle", "Notizen", { input: "textarea", span2: true }),
    f("portalVisible", "lifecycle", "Im Kundenportal zeigen", { span2: true }),
  ],
  other: [
    f("manufacturer", "product", "Hersteller"),
    f("model", "product", "Modell / Bezeichnung"),
    f("serialNumber", "product", "Serien- / Lizenznummer"),
    f("hostname", "network", "Hostname"),
    f("ipAddress", "network", "IP-Adresse"),
    f("managementUrl", "network", "URL", { input: "url", span2: true }),
    f("warrantyUntil", "lifecycle", "Garantie / Laufzeit bis", { input: "date" }),
    f("notes", "lifecycle", "Notizen", { input: "textarea", span2: true }),
    f("portalVisible", "lifecycle", "Im Kundenportal zeigen", { span2: true }),
  ],
};

/** Gerätetypen, auf denen ein Monitoring-Agent sinnvoll ist. */
export const assetAgentKinds: AssetKind[] = ["pc", "laptop", "tablet", "server", "nas"];

export function assetKindShowsMonitoring(kind: AssetKind): boolean {
  return assetAgentKinds.includes(kind);
}

export function assetNamePlaceholder(kind: AssetKind): string {
  const map: Record<AssetKind, string> = {
    pc: "z. B. PC-Müller / Buchhaltung",
    laptop: "z. B. NB-Müller",
    tablet: "z. B. iPad Empfang",
    server: "z. B. SRV-DC01",
    firewall: "z. B. FW-Zentrale",
    switch: "z. B. SW-Core-EG",
    router: "z. B. GW-Filiale",
    access_point: "z. B. AP-Büro-1",
    printer: "z. B. HP-Flur-EG",
    nas: "z. B. NAS-Backup",
    ups: "z. B. USV-Serverraum",
    phone: "z. B. TEL-Müller",
    monitor: "z. B. Dell 27\" Arbeitsplatz 3",
    accessory: "z. B. USB-Dock / HDMI-Dongle",
    software: "z. B. Adobe Creative Cloud",
    license: "z. B. Microsoft 365 Business",
    network: "z. B. Patchfeld EG",
    other: "z. B. Bezeichnung",
  };
  return map[kind];
}

export function fieldsForKind(kind: AssetKind): AssetFieldSpec[] {
  return kindFields[kind] ?? kindFields.other;
}

export function assetFieldGroupTitle(group: AssetFieldGroup): string {
  return groupTitle[group];
}

export function groupedFieldsForKind(kind: AssetKind): { group: AssetFieldGroup; title: string; fields: AssetFieldSpec[] }[] {
  const groups: AssetFieldGroup[] = ["product", "specs", "network", "lifecycle"];
  const fields = fieldsForKind(kind);
  return groups
    .map((group) => ({
      group,
      title: groupTitle[group],
      fields: fields.filter((x) => x.group === group),
    }))
    .filter((g) => g.fields.length > 0);
}

export type AssetDetailRow = { label: string; value: string; mono?: boolean; href?: string };

function normalizeHref(raw: string): string {
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function fieldValue(asset: Asset, id: AssetFieldId): string | null {
  switch (id) {
    case "manufacturer":
    case "model":
    case "serialNumber":
    case "hostname":
    case "ipAddress":
    case "secondaryIp":
    case "macAddress":
    case "vlan":
    case "rack":
    case "os":
    case "firmware":
    case "cpu":
    case "ports":
    case "role":
    case "managementUrl":
    case "responsiblePerson":
    case "notes":
      return asset[id]?.trim() || null;
    case "ramGb":
      return asset.ramGb != null ? `${asset.ramGb} GB` : null;
    case "diskGb":
      return asset.diskGb != null ? `${asset.diskGb} GB` : null;
    case "purchaseDate":
    case "installedAt":
    case "warrantyUntil": {
      const raw = asset[id];
      return raw ? formatDateOnly(raw) : null;
    }
    case "portalVisible":
      return null;
    default:
      return null;
  }
}

const monoFields = new Set<AssetFieldId>([
  "serialNumber",
  "hostname",
  "ipAddress",
  "secondaryIp",
  "macAddress",
]);

/**
 * Typgerechte Detailzeilen für Vorschau (nur gesetzte Felder).
 */
export function assetKindDetailRows(asset: Asset, opts?: { notes?: boolean }): AssetDetailRow[] {
  const includeNotes = opts?.notes !== false;
  const rows: AssetDetailRow[] = [];
  const hardware = [asset.manufacturer, asset.model].filter(Boolean).join(" ");
  if (hardware) rows.push({ label: "Gerät", value: hardware });
  if (asset.location?.trim()) rows.push({ label: "Standort", value: asset.location.trim() });

  const skip = new Set<AssetFieldId>(["manufacturer", "model", "portalVisible"]);
  if (!includeNotes) skip.add("notes");

  for (const spec of fieldsForKind(asset.kind)) {
    if (skip.has(spec.id)) continue;
    const value = fieldValue(asset, spec.id);
    if (!value) continue;
    rows.push({
      label: spec.label,
      value,
      mono: monoFields.has(spec.id),
      href: spec.id === "managementUrl" ? normalizeHref(value) : undefined,
    });
  }
  return rows;
}

export type AssetFact = { label: string; value: string; mono?: boolean };

/**
 * Kompakte Kernfelder für Inventar-Listen, passend zum Typ.
 */
export function assetSummaryFacts(asset: Asset, limit = 8): AssetFact[] {
  const facts: AssetFact[] = [];
  const push = (label: string, value: string | null | undefined, mono?: boolean) => {
    if (value?.trim()) facts.push({ label, value: value.trim(), mono });
  };

  push("IP", asset.ipAddress, true);
  push("Host", asset.hostname, true);
  const hardware = [asset.manufacturer, asset.model].filter(Boolean).join(" ");
  push("Gerät", hardware || null);
  push("Ort", asset.location);
  if (asset.kind === "firewall" || asset.kind === "switch" || asset.kind === "router" || asset.kind === "access_point") {
    push("FW", asset.firmware);
    push("Ports", asset.ports);
  } else if (asset.kind === "license" || asset.kind === "software") {
    push("Schlüssel", asset.serialNumber, true);
    push("Ende", asset.warrantyUntil ? formatDateOnly(asset.warrantyUntil) : null);
  } else {
    push("OS", asset.os);
    const specs = [
      asset.cpu,
      asset.ramGb != null ? `${asset.ramGb} GB RAM` : null,
      asset.diskGb != null ? `${asset.diskGb} GB` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    push("Specs", specs || null);
  }
  push("Rolle", asset.role);
  push("SN", asset.serialNumber, true);
  push("VLAN", asset.vlan);
  push("Kontakt", asset.responsiblePerson);

  const seen = new Set<string>();
  const unique: AssetFact[] = [];
  for (const fact of facts) {
    const key = `${fact.label}:${fact.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(fact);
    if (unique.length >= limit) break;
  }
  return unique;
}
