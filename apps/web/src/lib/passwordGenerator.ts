/** Optionen für den Passwort-Generator. */
export type GeneratorOptions = {
  length: number;
  upper: boolean;
  lower: boolean;
  digits: boolean;
  symbols: boolean;
  excludeAmbiguous: boolean;
};

export type GenHistoryItem = {
  id: string;
  password: string;
  createdAt: number;
  length: number;
};

const HISTORY_KEY = "systemflow.vault.genHistory";
const HISTORY_MAX = 25;

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const UPPER_AMB = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const LOWER_AMB = "abcdefghijklmnopqrstuvwxyz";
const DIGITS = "23456789";
const DIGITS_AMB = "0123456789";
const SYMBOLS = "!@#$%&*+-_=?;:,.";

/**
 * Erzeugt ein kryptographisch zufälliges Passwort nach den gewählten Optionen.
 */
export function generatePassword(opts: GeneratorOptions): string {
  const length = Math.min(128, Math.max(4, Math.floor(opts.length) || 16));
  const pools: string[] = [];
  if (opts.upper) pools.push(opts.excludeAmbiguous ? UPPER : UPPER_AMB);
  if (opts.lower) pools.push(opts.excludeAmbiguous ? LOWER : LOWER_AMB);
  if (opts.digits) pools.push(opts.excludeAmbiguous ? DIGITS : DIGITS_AMB);
  if (opts.symbols) pools.push(SYMBOLS);
  if (pools.length === 0) pools.push(opts.excludeAmbiguous ? LOWER : LOWER_AMB);

  const all = pools.join("");
  const bytes = new Uint8Array(length + pools.length);
  crypto.getRandomValues(bytes);

  // Mindestens ein Zeichen aus jeder gewählten Menge
  const chars: string[] = pools.map((pool, i) => pool[bytes[i] % pool.length]!);
  for (let i = pools.length; i < length; i++) {
    chars.push(all[bytes[i] % all.length]!);
  }

  // Fisher–Yates mit frischen Zufallsbytes
  const shuffle = new Uint8Array(chars.length);
  crypto.getRandomValues(shuffle);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = shuffle[i]! % (i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}

/**
 * Grobe Stärke-Einschätzung für die UI (kein Ersatz für einen Audit).
 */
export function passwordStrength(password: string): { score: number; label: string } {
  if (!password) return { score: 0, label: "Leer" };
  let score = 0;
  if (password.length >= 10) score += 1;
  if (password.length >= 14) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  score = Math.min(4, score);
  const labels = ["Sehr schwach", "Schwach", "Mittel", "Stark", "Sehr stark"];
  return { score, label: labels[score]! };
}

/** Lädt den lokalen Generator-Verlauf (nur im Browser, nicht auf dem Server). */
export function loadGenHistory(): GenHistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as GenHistoryItem[];
    return Array.isArray(parsed) ? parsed.slice(0, HISTORY_MAX) : [];
  } catch {
    return [];
  }
}

/** Speichert ein generiertes Passwort im lokalen Verlauf. */
export function pushGenHistory(password: string, length: number): GenHistoryItem[] {
  const item: GenHistoryItem = {
    id: `gen_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    password,
    createdAt: Date.now(),
    length,
  };
  const next = [item, ...loadGenHistory().filter((h) => h.password !== password)].slice(
    0,
    HISTORY_MAX,
  );
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  return next;
}

/** Löscht den lokalen Generator-Verlauf. */
export function clearGenHistory(): void {
  localStorage.removeItem(HISTORY_KEY);
}
