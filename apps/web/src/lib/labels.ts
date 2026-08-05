import type { DocumentType } from "../types";

export const documentTypeLabel: Record<DocumentType, string> = {
  note: "Notiz",
  protocol: "Protokoll",
  documentation: "Dokumentation",
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
