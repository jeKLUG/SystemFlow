import { randomBytes } from "node:crypto";

/** Erzeugt eine kurze zufällige ID. */
export function createId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}
