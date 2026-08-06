/** Hilfen für Dokumentenablage (MIME, Größe, Sortierung). */

export type FileKind = "image" | "pdf" | "office" | "archive" | "text" | "other";

export function fileKind(mime: string | null | undefined, name: string): FileKind {
  const m = (mime || "").toLowerCase();
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (m.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext)) {
    return "image";
  }
  if (m === "application/pdf" || ext === "pdf") return "pdf";
  if (
    m.includes("word") ||
    m.includes("excel") ||
    m.includes("powerpoint") ||
    m.includes("spreadsheet") ||
    m.includes("presentation") ||
    ["doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods"].includes(ext)
  ) {
    return "office";
  }
  if (
    m.includes("zip") ||
    m.includes("rar") ||
    m.includes("7z") ||
    m.includes("gzip") ||
    ["zip", "rar", "7z", "tar", "gz"].includes(ext)
  ) {
    return "archive";
  }
  if (m.startsWith("text/") || ["txt", "md", "csv", "log", "json"].includes(ext)) return "text";
  return "other";
}

export function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10_240 ? 1 : 0)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export type VaultSort = "name" | "date" | "size";

export function sortByName<T extends { name?: string; originalName?: string }>(a: T, b: T) {
  const an = (a.name ?? a.originalName ?? "").toLocaleLowerCase("de");
  const bn = (b.name ?? b.originalName ?? "").toLocaleLowerCase("de");
  return an.localeCompare(bn, "de");
}
