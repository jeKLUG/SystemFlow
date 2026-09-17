/** Leeres TipTap-Dokument. */
export const EMPTY_DOC = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] });

/**
 * Wandelt Klartext oder TipTap-JSON in Editor-JSON.
 */
export function toEditorContent(raw: string | null | undefined): string {
  const t = raw?.trim();
  if (!t) return EMPTY_DOC;
  try {
    const parsed = JSON.parse(t) as { type?: string };
    if (parsed?.type === "doc") return t;
  } catch {
    /* Klartext */
  }
  return JSON.stringify({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: t }] }],
  });
}

function walkTipTapText(nodes: unknown[]): string {
  const parts: string[] = [];
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const n = node as { type?: string; text?: string; content?: unknown[] };
    if (n.type === "text" && n.text) parts.push(n.text);
    else if (n.content?.length) parts.push(walkTipTapText(n.content));
  }
  return parts.join("");
}

/** Sichtbarer Klartext aus TipTap-JSON oder Rohtext. */
export function richTextPlain(raw: string | null | undefined): string {
  const t = raw?.trim();
  if (!t) return "";
  try {
    const doc = JSON.parse(t) as { type?: string; content?: unknown[] };
    if (doc?.type === "doc" || Array.isArray(doc?.content)) {
      return walkTipTapText(doc.content ?? []).trim();
    }
  } catch {
    /* Klartext */
  }
  return t;
}

/** Ob TipTap-JSON oder Klartext sichtbaren Inhalt hat. */
export function richTextHasContent(raw: string | null | undefined): boolean {
  return richTextPlain(raw).length > 0;
}
