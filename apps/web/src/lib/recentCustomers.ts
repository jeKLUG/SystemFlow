const KEY = "systemhaus-recent-customers";
const MAX = 8;

/** Zuletzt genutzte Kunden-IDs (lokal, für schnelle Auswahl). */
export function getRecentCustomerIds(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string").slice(0, MAX);
  } catch {
    return [];
  }
}

/** Merkt einen Kunden als kürzlich verwendet. */
export function pushRecentCustomer(id: string) {
  if (!id) return;
  const next = [id, ...getRecentCustomerIds().filter((x) => x !== id)].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
}
