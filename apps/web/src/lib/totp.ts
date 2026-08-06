/**
 * TOTP (RFC 6238) und otpauth-URI-Hilfen für den Passworttresor.
 * Reine Client-Logik – Secrets bleiben nach Reveal nur im Browser.
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Normalisiert Base32 (Leerzeichen/Bindestriche weg, Großbuchstaben). */
export function normalizeTotpSecret(raw: string): string {
  const fromUri = extractSecretFromInput(raw);
  return fromUri.replace(/[\s\-]/g, "").toUpperCase().replace(/=+$/, "");
}

/** Extrahiert Secret aus Base32 oder otpauth://-URI. */
export function extractSecretFromInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.toLowerCase().startsWith("otpauth://")) {
    try {
      const url = new URL(trimmed);
      return url.searchParams.get("secret") ?? "";
    } catch {
      const m = /[?&]secret=([^&]+)/i.exec(trimmed);
      return m?.[1] ? decodeURIComponent(m[1]) : "";
    }
  }
  return trimmed;
}

function decodeBase32(secret: string): Uint8Array {
  const cleaned = normalizeTotpSecret(secret);
  if (!cleaned) throw new Error("Leeres TOTP-Secret");
  let bits = "";
  for (const ch of cleaned) {
    const val = BASE32_ALPHABET.indexOf(ch);
    if (val < 0) throw new Error("Ungültiges Base32-Secret");
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return new Uint8Array(bytes);
}

function counterBytes(counter: number): Uint8Array {
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  // high 32 bits 0 for typical counters
  view.setUint32(0, 0, false);
  view.setUint32(4, counter >>> 0, false);
  return new Uint8Array(buf);
}

async function hmacSha1(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key.buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, data.buffer as ArrayBuffer);
  return new Uint8Array(sig);
}

/**
 * Erzeugt den aktuellen TOTP-Code (Standard: 30s, 6 Ziffern).
 */
export async function generateTotp(
  secret: string,
  opts?: { step?: number; digits?: number; now?: number },
): Promise<{ code: string; remaining: number; step: number }> {
  const step = opts?.step ?? 30;
  const digits = opts?.digits ?? 6;
  const now = opts?.now ?? Date.now();
  const counter = Math.floor(now / 1000 / step);
  const remaining = step - (Math.floor(now / 1000) % step);

  const key = decodeBase32(secret);
  const hmac = await hmacSha1(key, counterBytes(counter));
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const bin =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  const code = (bin % 10 ** digits).toString().padStart(digits, "0");
  return { code, remaining, step };
}

/** Formatiert 6-stelligen Code als `123 456`. */
export function formatTotpCode(code: string): string {
  if (code.length === 6) return `${code.slice(0, 3)} ${code.slice(3)}`;
  return code;
}
