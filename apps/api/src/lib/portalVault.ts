import type { Attachment, FileFolder } from "../db/schema.js";

/** Ablage-Datei (kein Wiki/Inventar/Mail/Ticket). */
export function isVaultFile(row: Pick<Attachment, "documentId" | "assetId" | "emailId" | "ticketId">) {
  return !row.documentId && !row.assetId && !row.emailId && !row.ticketId;
}

/**
 * Alle Ordner-IDs, die durch eine direkte Portal-Freigabe sichtbar sind
 * (freigegebener Ordner plus Unterordner).
 */
export function sharedFolderIds(folders: FileFolder[]): Set<string> {
  const byParent = new Map<string, FileFolder[]>();
  for (const folder of folders) {
    if (!folder.parentId) continue;
    const list = byParent.get(folder.parentId) ?? [];
    list.push(folder);
    byParent.set(folder.parentId, list);
  }
  const ids = new Set<string>();
  const stack = folders.filter((f) => f.portalVisible).map((f) => f.id);
  for (const id of stack) ids.add(id);
  while (stack.length) {
    const id = stack.pop()!;
    for (const child of byParent.get(id) ?? []) {
      if (ids.has(child.id)) continue;
      ids.add(child.id);
      stack.push(child.id);
    }
  }
  return ids;
}

/** Ordner ohne interne Felder für das Portal. */
export function publicFolder(row: FileFolder) {
  return {
    id: row.id,
    customerId: row.customerId,
    parentId: row.parentId,
    name: row.name,
    portalVisible: row.portalVisible,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
