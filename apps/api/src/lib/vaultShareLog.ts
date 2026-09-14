import { createId } from "./id.js";
import type { Db } from "../db/index.js";
import { vaultShareEvents, type VaultShareEventOutcome } from "../db/schema.js";

/** Client-IP aus Request (X-Forwarded-For oder Socket), ohne PII außer Adresse. */
export function clientIp(request: {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}): string | null {
  const xf = request.headers["x-forwarded-for"];
  const raw = Array.isArray(xf) ? xf[0] : xf;
  if (typeof raw === "string" && raw.trim()) {
    return raw.split(",")[0]!.trim().slice(0, 64);
  }
  const ip = request.ip?.trim();
  return ip ? ip.slice(0, 64) : null;
}

/**
 * Schreibt einen Share-Abruf-Eintrag (kein Klartext von Geheimnissen).
 */
export async function logShareEvent(
  db: Db,
  shareId: string,
  outcome: VaultShareEventOutcome,
  ip: string | null,
) {
  await db.insert(vaultShareEvents).values({
    id: createId("vse"),
    shareId,
    at: new Date(),
    ip,
    outcome,
  });
}
