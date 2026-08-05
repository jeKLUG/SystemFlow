import type {
  AppointmentKind,
  AssetKind,
  AssetStatus,
  DocumentType,
  ProjectStatus,
  VaultCategory,
} from "../types";
import { parseDateOnly } from "./dates";

export const documentTypeLabel: Record<DocumentType, string> = {
  note: "Notiz",
  protocol: "Protokoll",
  documentation: "Dokumentation",
  article: "Artikel",
  workflow: "Workflow",
};

export const projectStatusLabel: Record<ProjectStatus, string> = {
  planned: "Geplant",
  active: "Aktiv",
  on_hold: "Pausiert",
  done: "Abgeschlossen",
};

export const appointmentKindLabel: Record<AppointmentKind, string> = {
  customer: "Kunde",
  internal: "Intern",
  personal: "Persönlich",
  other: "Sonstiges",
};

export const vaultCategoryLabel: Record<VaultCategory, string> = {
  vpn: "VPN",
  admin: "Admin / Root",
  hosting: "Hosting",
  email: "E-Mail",
  firewall: "Firewall",
  remote: "Remote / RDP",
  wifi: "WLAN / Wi‑Fi",
  database: "Datenbank",
  cloud: "Cloud / SaaS",
  license: "Lizenz / Portal",
  office: "Microsoft 365",
  isp: "Provider / ISP",
  other: "Sonstiges",
};

export const assetKindLabel: Record<AssetKind, string> = {
  pc: "PC / Client",
  laptop: "Notebook",
  server: "Server",
  firewall: "Firewall",
  switch: "Switch",
  router: "Router",
  access_point: "Access Point",
  printer: "Drucker",
  nas: "NAS / Storage",
  ups: "USV",
  phone: "Telefon / Softphone",
  license: "Lizenz",
  network: "Netzwerk allgemein",
  other: "Sonstig",
};

export const assetStatusLabel: Record<AssetStatus, string> = {
  active: "Aktiv",
  spare: "Ersatz / Lager",
  retired: "Außer Betrieb",
};

export function formatDate(value: string | Date) {
  try {
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
      return formatDateOnly(value);
    }
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

export function formatDateOnly(value: string | null | undefined) {
  if (!value) return "–";
  try {
    const trimmed = value.trim();
    const date = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
      ? parseDateOnly(trimmed)
      : new Date(trimmed);
    return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(date);
  } catch {
    return value;
  }
}
