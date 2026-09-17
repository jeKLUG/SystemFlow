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

/** Ob TipTap-JSON oder Klartext sichtbaren Inhalt hat. */
export function richTextHasContent(raw: string | null | undefined): boolean {
  const t = raw?.trim();
  if (!t) return false;
  try {
    const doc = JSON.parse(t) as { type?: string; content?: unknown[] };
    if (doc?.type === "doc" || Array.isArray(doc?.content)) {
      return walkTipTapText(doc.content ?? []).trim().length > 0;
    }
  } catch {
    /* Klartext */
  }
  return t.length > 0;
}
