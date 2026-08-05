import type {
  AppointmentKind,
  AssetKind,
  DocumentType,
  ProjectStatus,
  VaultCategory,
} from "../types";

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
  other: "Sonstiges",
};

export const assetKindLabel: Record<AssetKind, string> = {
  pc: "PC / Client",
  server: "Server",
  firewall: "Firewall",
  license: "Lizenz",
  network: "Netzwerk",
  other: "Sonstig",
};

export function formatDate(value: string | Date) {
  try {
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
    return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(value));
  } catch {
    return value;
  }
}
