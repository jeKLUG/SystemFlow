import type { AssetKind, DocumentType } from "../types";

export const documentTypeLabel: Record<DocumentType, string> = {
  note: "Notiz",
  protocol: "Protokoll",
  documentation: "Dokumentation",
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
