/**
 * Extrahiert Plaintext aus TipTap-JSON für Exporte.
 */
export function tiptapToText(raw: string): string {
  try {
    const doc = JSON.parse(raw) as { content?: unknown[] };
    return walk(doc.content ?? []).trim();
  } catch {
    return raw;
  }
}

function walk(nodes: unknown[]): string {
  const parts: string[] = [];
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const n = node as { type?: string; text?: string; content?: unknown[]; attrs?: { level?: number } };
    if (n.type === "text" && n.text) {
      parts.push(n.text);
      continue;
    }
    if (n.content?.length) {
      const inner = walk(n.content);
      if (n.type === "heading") parts.push(`\n${"#".repeat(n.attrs?.level ?? 1)} ${inner}\n`);
      else if (n.type === "paragraph") parts.push(`${inner}\n`);
      else if (n.type === "listItem") parts.push(`- ${inner}\n`);
      else parts.push(inner);
    } else if (n.type === "hardBreak") {
      parts.push("\n");
    }
  }
  return parts.join("");
}
