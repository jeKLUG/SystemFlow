/** TipTap-JSON oder Klartext als lesbaren Fließtext. */
export function richTextPlain(raw: string | null | undefined, max = 1200): string {
  const t = raw?.trim();
  if (!t) return "";
  let text = t;
  try {
    const doc = JSON.parse(t) as { type?: string; content?: unknown[]; text?: string };
    if (doc?.type === "doc" || Array.isArray(doc?.content)) {
      text = walk(doc.content ?? []).trim();
    }
  } catch {
    /* Klartext */
  }
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max).trim()}…`;
}

/** TipTap-JSON oder Klartext auf sichtbaren Inhalt prüfen. */
export function richTextHasContent(raw: string | null | undefined): boolean {
  const t = raw?.trim();
  if (!t) return false;
  try {
    const doc = JSON.parse(t) as { type?: string; content?: unknown[]; text?: string };
    if (doc?.type === "doc" || Array.isArray(doc?.content)) {
      return walk(doc.content ?? []).trim().length > 0;
    }
  } catch {
    /* Klartext */
  }
  return t.length > 0;
}

function walk(nodes: unknown[]): string {
  const parts: string[] = [];
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const n = node as { type?: string; text?: string; content?: unknown[] };
    if (n.type === "text" && n.text) parts.push(n.text);
    else if (n.content?.length) parts.push(walk(n.content));
  }
  return parts.join("");
}
