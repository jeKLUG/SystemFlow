/**
 * Offline-Snapshots für Lesemodus (Dashboard, Kontakte, Kalender).
 * Speichert erfolgreiche API-Antworten lokal und liefert sie bei Netzwerkfehlern.
 */

const PREFIX = "systemhaus-offline:";

type Envelope<T> = { at: number; data: T };

function storageKey(key: string): string {
  return `${PREFIX}${key}`;
}

/** Speichert einen Snapshot. */
export function saveOfflineSnapshot<T>(key: string, data: T): void {
  try {
    const envelope: Envelope<T> = { at: Date.now(), data };
    localStorage.setItem(storageKey(key), JSON.stringify(envelope));
  } catch {
    /* Quota / private mode */
  }
}

/** Liest einen Snapshot, falls vorhanden. */
export function readOfflineSnapshot<T>(key: string): Envelope<T> | null {
  try {
    const raw = localStorage.getItem(storageKey(key));
    if (!raw) return null;
    return JSON.parse(raw) as Envelope<T>;
  } catch {
    return null;
  }
}

/**
 * Ruft fetcher auf; bei Erfolg cachen. Bei Fehler und vorhandenem Cache → Cache.
 */
export async function withOfflineFallback<T>(
  key: string,
  fetcher: () => Promise<T>,
): Promise<{ data: T; fromCache: boolean; cachedAt: number | null }> {
  try {
    const data = await fetcher();
    saveOfflineSnapshot(key, data);
    return { data, fromCache: false, cachedAt: Date.now() };
  } catch (err) {
    const cached = readOfflineSnapshot<T>(key);
    if (cached) {
      return { data: cached.data, fromCache: true, cachedAt: cached.at };
    }
    throw err;
  }
}

/** Ob der Browser offline ist. */
export function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}
