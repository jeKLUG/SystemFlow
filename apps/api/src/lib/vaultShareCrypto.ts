import { randomBytes } from "node:crypto";
import { decryptText, deriveKek, encryptText, wipe } from "./vaultCrypto.js";

/** Payload eines Einweg-Shares (nach PIN-Entschlüsselung). */
export type VaultSharePayload = {
  title: string;
  username: string | null;
  password: string | null;
  url: string | null;
  notes: string | null;
  totpSecret: string | null;
};

/** Öffentlicher URL-Token (auch Primärschlüssel). */
export function createShareToken(): string {
  return randomBytes(24).toString("base64url");
}

/** Sechsstellige PIN (nur einmal anzeigen). */
export function createSharePin(): string {
  const n = randomBytes(4).readUInt32BE(0) % 1_000_000;
  return String(n).padStart(6, "0");
}

/**
 * Verschlüsselt Share-Payload mit Schlüssel aus PIN + Salt (scrypt).
 * Vault-Passphrase wird nicht benötigt und nie an Empfänger weitergegeben.
 */
export async function encryptSharePayload(
  pin: string,
  payload: VaultSharePayload,
): Promise<{ saltB64: string; payloadEnc: string }> {
  const salt = randomBytes(16);
  const key = await deriveKek(pin, salt);
  try {
    return {
      saltB64: salt.toString("base64"),
      payloadEnc: encryptText(key, JSON.stringify(payload)),
    };
  } finally {
    wipe(key);
  }
}

/**
 * Entschlüsselt Share-Payload. Wirft bei falscher PIN / Manipulation.
 */
export async function decryptSharePayload(
  pin: string,
  saltB64: string,
  payloadEnc: string,
): Promise<VaultSharePayload> {
  const salt = Buffer.from(saltB64, "base64");
  const key = await deriveKek(pin, salt);
  try {
    const raw = decryptText(key, payloadEnc);
    const parsed = JSON.parse(raw) as VaultSharePayload;
    return {
      title: typeof parsed.title === "string" ? parsed.title : "",
      username: parsed.username ?? null,
      password: parsed.password ?? null,
      url: parsed.url ?? null,
      notes: parsed.notes ?? null,
      totpSecret: parsed.totpSecret ?? null,
    };
  } finally {
    wipe(key);
  }
}
