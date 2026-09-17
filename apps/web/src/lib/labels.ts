import type {
  AppointmentKind,
  AssetKind,
  AssetOwnership,
  AssetStatus,
  ContractStatus,
  DocumentType,
  EmailDirection,
  ProjectStatus,
  TicketPriority,
  TicketStatus,
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

export const emailDirectionLabel: Record<EmailDirection, string> = {
  inbound: "Eingang",
  outbound: "Ausgang",
  internal: "Intern",
};

export const projectStatusLabel: Record<ProjectStatus, string> = {
  planned: "Geplant",
  active: "Aktiv",
  on_hold: "Pausiert",
  done: "Abgeschlossen",
};

export const contractStatusLabel: Record<ContractStatus, string> = {
  draft: "Entwurf",
  active: "Aktiv",
  paused: "Pausiert",
  expired: "Abgelaufen",
  cancelled: "Beendet",
};

/** SLA-Zeiten lesbar formatieren (Minuten unter 1 h). */
export function formatSlaHours(hours: number | null | undefined): string {
  if (hours == null || Number.isNaN(hours)) return "–";
  if (hours < 1) {
    const mins = Math.round(hours * 60);
    return `${mins} Min.`;
  }
  const rounded = Math.round(hours * 100) / 100;
  return Number.isInteger(rounded) ? `${rounded} h` : `${rounded} h`;
}

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
  tablet: "Tablet",
  server: "Server",
  firewall: "Firewall",
  switch: "Switch",
  router: "Router",
  access_point: "Access Point",
  printer: "Drucker",
  nas: "NAS / Storage",
  ups: "USV",
  phone: "Telefon / Softphone",
  monitor: "Monitor",
  accessory: "Zubehör",
  software: "Software",
  license: "Lizenz",
  network: "Netzwerk allgemein",
  other: "Sonstiges",
};

/** Zuordnung: Kundeneigentum, von uns verliehen, oder Kundengerät bei uns. */
export const assetOwnershipLabel: Record<AssetOwnership, string> = {
  customer: "Kundeneigentum",
  loaned: "Von uns verliehen",
  held: "Bei uns (Kundengerät)",
};

/** Kurzlabels für Filter-Chips. */
export const assetOwnershipFilterLabel: Record<AssetOwnership, string> = {
  customer: "Kundeneigentum",
  loaned: "Verliehen",
  held: "Bei uns",
};

export const assetStatusLabel: Record<AssetStatus, string> = {
  active: "Aktiv",
  spare: "Ersatz / Lager",
  retired: "Außer Betrieb",
};

export const ticketStatusLabel: Record<TicketStatus, string> = {
  open: "Offen",
  in_progress: "In Bearbeitung",
  waiting_customer: "Wartet auf Kunde",
  resolved: "Gelöst",
  closed: "Geschlossen",
};

/** Kundenfreundliche Statusbezeichnungen im Portal. */
export const portalTicketStatusLabel: Record<TicketStatus, string> = {
  open: "Eingegangen",
  in_progress: "In Bearbeitung",
  waiting_customer: "Rückmeldung nötig",
  resolved: "Gelöst",
  closed: "Abgeschlossen",
};

/** Kurzer Hinweistext zum Ticketstatus für Kunden. */
export const portalTicketStatusHint: Record<TicketStatus, string> = {
  open: "Wir haben Ihre Anfrage erhalten.",
  in_progress: "Wir kümmern uns darum.",
  waiting_customer: "Bitte antworten Sie uns im Ticket.",
  resolved: "Die Anfrage ist erledigt.",
  closed: "Das Ticket ist geschlossen.",
};

export const ticketPriorityLabel: Record<TicketPriority, string> = {
  low: "Niedrig",
  normal: "Normal",
  high: "Hoch",
  critical: "Kritisch",
};

/** Kurzhilfe zur Priorität im Portal-Anlegen-Dialog. */
export const portalTicketPriorityHint: Record<TicketPriority, string> = {
  low: "Kann warten",
  normal: "Alltägliche Anfrage",
  high: "Bitte zeitnah",
  critical: "Ausfall oder Stillstand",
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
