import { wipe } from "./vaultCrypto.js";

const DEFAULT_TTL_MS = 15 * 60 * 1000; // 15 Minuten
const MAX_UNLOCK_FAILURES = 8;
const LOCKOUT_MS = 5 * 60 * 1000;

type SessionEntry = {
  dek: Buffer;
  expiresAt: number;
};

const sessions = new Map<string, SessionEntry>();
const failures = new Map<string, { count: number; lockedUntil: number }>();

/**
 * Speichert den entschlüsselten DEK nur im Server-RAM (nie im Cookie).
 */
export function putVaultDek(userId: string, dek: Buffer, ttlMs = DEFAULT_TTL_MS) {
  const existing = sessions.get(userId);
  if (existing) wipe(existing.dek);
  sessions.set(userId, { dek: Buffer.from(dek), expiresAt: Date.now() + ttlMs });
  failures.delete(userId);
}

/**
 * Liefert DEK oder null. Verlängert TTL bei Zugriff (Sliding).
 */
export function getVaultDek(userId: string, ttlMs = DEFAULT_TTL_MS): Buffer | null {
  const entry = sessions.get(userId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    wipe(entry.dek);
    sessions.delete(userId);
    return null;
  }
  entry.expiresAt = Date.now() + ttlMs;
  return entry.dek;
}

export function clearVaultDek(userId: string) {
  const entry = sessions.get(userId);
  if (entry) {
    wipe(entry.dek);
    sessions.delete(userId);
  }
}

export function vaultExpiresAt(userId: string): number | null {
  const entry = sessions.get(userId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    clearVaultDek(userId);
    return null;
  }
  return entry.expiresAt;
}

export function isVaultUnlocked(userId: string): boolean {
  return getVaultDek(userId) != null;
}

/**
 * Rate-Limit für Fehlversuche beim Unlock.
 */
export function registerUnlockFailure(userId: string): { locked: boolean; retryAfterSec: number } {
  const now = Date.now();
  const cur = failures.get(userId) ?? { count: 0, lockedUntil: 0 };
  if (cur.lockedUntil > now) {
    return { locked: true, retryAfterSec: Math.ceil((cur.lockedUntil - now) / 1000) };
  }
  cur.count += 1;
  if (cur.count >= MAX_UNLOCK_FAILURES) {
    cur.lockedUntil = now + LOCKOUT_MS;
    cur.count = 0;
    failures.set(userId, cur);
    return { locked: true, retryAfterSec: Math.ceil(LOCKOUT_MS / 1000) };
  }
  failures.set(userId, cur);
  return { locked: false, retryAfterSec: 0 };
}

export function clearUnlockFailures(userId: string) {
  failures.delete(userId);
}

export function checkUnlockAllowed(userId: string): { locked: boolean; retryAfterSec: number } {
  const cur = failures.get(userId);
  if (!cur || cur.lockedUntil <= Date.now()) return { locked: false, retryAfterSec: 0 };
  return { locked: true, retryAfterSec: Math.ceil((cur.lockedUntil - Date.now()) / 1000) };
}
