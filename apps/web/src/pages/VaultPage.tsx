import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { Checkbox } from "../components/Checkbox";
import { CustomerPicker } from "../components/CustomerPicker";
import { formatDate, vaultCategoryLabel } from "../lib/labels";
import {
  clearGenHistory,
  generatePassword,
  loadGenHistory,
  passwordStrength,
  pushGenHistory,
  type GenHistoryItem,
  type GeneratorOptions,
} from "../lib/passwordGenerator";
import { formatTotpCode, generateTotp, normalizeTotpSecret } from "../lib/totp";
import type { VaultCategory, VaultEntryMeta, VaultEntrySecret, VaultStatus } from "../types";

type SortKey = "updated" | "title" | "category" | "customer";

type EntryForm = {
  title: string;
  category: VaultCategory;
  customerId: string;
  username: string;
  password: string;
  url: string;
  notes: string;
  totpSecret: string;
  favorite: boolean;
  tagsText: string;
};

const emptyForm: EntryForm = {
  title: "",
  category: "admin",
  customerId: "",
  username: "",
  password: "",
  url: "",
  notes: "",
  totpSecret: "",
  favorite: false,
  tagsText: "",
};

const defaultGen: GeneratorOptions = {
  length: 20,
  upper: true,
  lower: true,
  digits: true,
  symbols: true,
  excludeAmbiguous: true,
};

function parseTagsText(value: string): string[] {
  return value
    .split(/[,;\s]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 12);
}

function customerLabel(entry: VaultEntryMeta) {
  return entry.customerCompany || entry.customerName || "Kunde";
}

/**
 * Passworttresor: Organisation, Generator mit Verlauf, Sortierung und Kategorien.
 */
export function VaultPage() {
  const [params] = useSearchParams();
  const presetCustomer = params.get("customerId") ?? "";
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [entries, setEntries] = useState<VaultEntryMeta[]>([]);
  const [filterCustomer, setFilterCustomer] = useState(presetCustomer);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EntryForm>({ ...emptyForm, customerId: presetCustomer });
  const [passphrase, setPassphrase] = useState("");
  const [passConfirm, setPassConfirm] = useState("");
  const [revealed, setRevealed] = useState<VaultEntrySecret | null>(null);
  const [revealVisible, setRevealVisible] = useState(false);
  const revealTimer = useRef<number | null>(null);

  const [q, setQ] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | VaultCategory>("all");
  const [tagFilter, setTagFilter] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [groupByCategory, setGroupByCategory] = useState(true);
  const [showGenerator, setShowGenerator] = useState(false);
  const [genOpts, setGenOpts] = useState<GeneratorOptions>(defaultGen);
  const [generated, setGenerated] = useState("");
  const [genHistory, setGenHistory] = useState<GenHistoryItem[]>(() => loadGenHistory());
  const [copyHint, setCopyHint] = useState("");

  async function refreshStatus() {
    setStatus(await api.vaultStatus());
  }

  async function loadEntries() {
    const list = await api.vaultEntries(filterCustomer || undefined);
    setEntries(list);
  }

  useEffect(() => {
    void refreshStatus();
  }, []);

  useEffect(() => {
    if (status?.unlocked) {
      void loadEntries().catch((err) => {
        setError(err instanceof Error ? err.message : "Laden fehlgeschlagen");
      });
    } else {
      setEntries([]);
    }
  }, [status?.unlocked, filterCustomer]);

  useEffect(() => {
    return () => {
      if (revealTimer.current) window.clearTimeout(revealTimer.current);
    };
  }, []);

  function clearReveal() {
    setRevealed(null);
    setRevealVisible(false);
    if (revealTimer.current) window.clearTimeout(revealTimer.current);
  }

  function resetForm() {
    setForm({ ...emptyForm, customerId: filterCustomer });
    setEditingId(null);
    setShowForm(false);
  }

  async function onSetup(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const s = await api.vaultSetup(passphrase, passConfirm);
      setStatus(s);
      setPassphrase("");
      setPassConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Einrichtung fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  async function onUnlock(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const s = await api.vaultUnlock(passphrase);
      setStatus({ configured: true, unlocked: s.unlocked, expiresAt: s.expiresAt });
      setPassphrase("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Freischalten fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  async function onLock() {
    clearReveal();
    await api.vaultLock();
    setStatus({ configured: true, unlocked: false, expiresAt: null });
  }

  async function startEdit(entry: VaultEntryMeta) {
    setError("");
    clearReveal();
    try {
      const secret = await api.vaultReveal(entry.id);
      setEditingId(entry.id);
      setShowForm(true);
      setForm({
        title: secret.title,
        category: (secret.category as VaultCategory) || "other",
        customerId: secret.customerId ?? "",
        username: secret.username ?? "",
        password: "",
        url: secret.url ?? "",
        notes: secret.notes ?? "",
        totpSecret: "",
        favorite: Boolean(secret.favorite ?? entry.favorite),
        tagsText: (secret.tags ?? entry.tags ?? []).join(", "),
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Laden fehlgeschlagen");
      void refreshStatus();
    }
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setError("");
    const tags = parseTagsText(form.tagsText);
    try {
      if (editingId) {
        const body: Record<string, unknown> = {
          title: form.title,
          category: form.category,
          customerId: form.customerId || null,
          username: form.username,
          url: form.url,
          notes: form.notes,
          favorite: form.favorite,
          tags,
        };
        if (form.password.trim()) body.password = form.password;
        if (form.totpSecret.trim() === "-") body.totpSecret = null;
        else if (form.totpSecret.trim()) body.totpSecret = normalizeTotpSecret(form.totpSecret);
        await api.vaultUpdateEntry(editingId, body);
      } else {
        await api.vaultCreateEntry({
          title: form.title,
          category: form.category,
          customerId: form.customerId || null,
          username: form.username,
          password: form.password,
          url: form.url,
          notes: form.notes,
          totpSecret: form.totpSecret.trim()
            ? normalizeTotpSecret(form.totpSecret)
            : undefined,
          favorite: form.favorite,
          tags,
        });
      }
      resetForm();
      await loadEntries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    }
  }

  async function toggleFavorite(entry: VaultEntryMeta) {
    try {
      await api.vaultUpdateEntry(entry.id, { favorite: !entry.favorite });
      await loadEntries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Aktualisieren fehlgeschlagen");
    }
  }

  async function onReveal(id: string) {
    setError("");
    clearReveal();
    try {
      const secret = await api.vaultReveal(id);
      setRevealed(secret);
      setRevealVisible(false);
      revealTimer.current = window.setTimeout(() => {
        clearReveal();
      }, 60_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Anzeigen fehlgeschlagen");
      void refreshStatus();
    }
  }

  async function copyText(value: string | null | undefined, label = "Kopiert") {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopyHint(label);
      window.setTimeout(() => setCopyHint(""), 1500);
    } catch {
      setError("Zwischenablage nicht verfügbar");
    }
  }

  function runGenerator() {
    const pw = generatePassword(genOpts);
    setGenerated(pw);
    setGenHistory(pushGenHistory(pw, genOpts.length));
  }

  function useGeneratedInForm(password: string) {
    setForm((f) => ({ ...f, password }));
    setShowForm(true);
    setCopyHint("In Formular übernommen");
    window.setTimeout(() => setCopyHint(""), 1500);
  }

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) for (const t of e.tags ?? []) set.add(t);
    return [...set].sort();
  }, [entries]);

  const categoryCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) map.set(e.category, (map.get(e.category) ?? 0) + 1);
    return map;
  }, [entries]);

  const stats = useMemo(() => {
    const favorites = entries.filter((e) => e.favorite).length;
    const withCustomer = entries.filter((e) => e.customerId).length;
    return {
      total: entries.length,
      favorites,
      withCustomer,
      categories: categoryCounts.size,
    };
  }, [entries, categoryCounts]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    let list = entries.filter((e) => {
      if (favoritesOnly && !e.favorite) return false;
      if (categoryFilter !== "all" && e.category !== categoryFilter) return false;
      if (tagFilter && !(e.tags ?? []).includes(tagFilter)) return false;
      if (!query) return true;
      const hay = [
        e.title,
        e.category,
        vaultCategoryLabel[e.category as VaultCategory] ?? e.category,
        customerLabel(e),
        ...(e.tags ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(query);
    });

    const cmp = (a: VaultEntryMeta, b: VaultEntryMeta) => {
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      switch (sortKey) {
        case "title":
          return a.title.localeCompare(b.title, "de");
        case "category":
          return (vaultCategoryLabel[a.category as VaultCategory] ?? a.category).localeCompare(
            vaultCategoryLabel[b.category as VaultCategory] ?? b.category,
            "de",
          );
        case "customer":
          return customerLabel(a).localeCompare(customerLabel(b), "de");
        default:
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }
    };
    return [...list].sort(cmp);
  }, [entries, q, categoryFilter, tagFilter, favoritesOnly, sortKey]);

  const groups = useMemo(() => {
    if (!groupByCategory) return [{ key: "all", label: null as string | null, items: filtered }];
    const order = Object.keys(vaultCategoryLabel) as VaultCategory[];
    const byCat = new Map<string, VaultEntryMeta[]>();
    for (const e of filtered) {
      const list = byCat.get(e.category) ?? [];
      list.push(e);
      byCat.set(e.category, list);
    }
    const known = order
      .filter((k) => byCat.has(k))
      .map((k) => ({
        key: k,
        label: vaultCategoryLabel[k],
        items: byCat.get(k)!,
      }));
    const unknown = [...byCat.keys()]
      .filter((k) => !(k in vaultCategoryLabel))
      .map((k) => ({ key: k, label: k, items: byCat.get(k)! }));
    return [...known, ...unknown];
  }, [filtered, groupByCategory]);

  const strength = passwordStrength(generated || form.password);

  if (!status) return <div className="boot">Lade Tresor…</div>;

  return (
    <div className="page vault-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Sicherheit</p>
          <h2>Passworttresor</h2>
          <p>
            Zugänge organisieren, kategorisieren und mit Generator erzeugen. Freischaltung nur mit
            Vault-Passphrase.
          </p>
        </div>
        {status.unlocked ? (
          <div className="page-actions">
            <button type="button" className="btn btn-danger" onClick={() => void onLock()}>
              Tresor sperren
            </button>
          </div>
        ) : null}
      </div>

      {!status.configured ? (
        <section className="panel vault-lock-card">
          <h3>Tresor einrichten</h3>
          <p className="muted">
            Einmalig eine starke Vault-Passphrase festlegen. Ohne sie sind gespeicherte Zugänge nicht
            wiederherstellbar.
          </p>
          <form className="form-stack" onSubmit={onSetup} autoComplete="off">
            <label className="field">
              <span>Vault-Passphrase *</span>
              <input
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Wiederholen *</span>
              <input
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
                value={passConfirm}
                onChange={(e) => setPassConfirm(e.target.value)}
              />
            </label>
            {error ? <p className="form-error">{error}</p> : null}
            <button className="btn btn-primary" type="submit" disabled={busy}>
              Tresor erstellen
            </button>
          </form>
        </section>
      ) : !status.unlocked ? (
        <section className="panel vault-lock-card">
          <h3>Tresor gesperrt</h3>
          <p className="muted">Zum Anzeigen oder Speichern von Zugängen freischalten.</p>
          <form className="form-stack" onSubmit={onUnlock} autoComplete="off">
            <label className="field">
              <span>Vault-Passphrase</span>
              <input
                type="password"
                autoComplete="off"
                required
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
              />
            </label>
            {error ? <p className="form-error">{error}</p> : null}
            <button className="btn btn-primary" type="submit" disabled={busy}>
              Freischalten
            </button>
          </form>
        </section>
      ) : (
        <>
          {stats.total > 0 ? (
            <div className="stat-strip asset-stat-strip">
              <div className="stat-chip">
                <strong>{stats.total}</strong>
                <span>Zugänge</span>
              </div>
              <div className="stat-chip">
                <strong>{stats.favorites}</strong>
                <span>Favoriten</span>
              </div>
              <div className="stat-chip">
                <strong>{stats.categories}</strong>
                <span>Kategorien</span>
              </div>
              <div className="stat-chip">
                <strong>{stats.withCustomer}</strong>
                <span>Mit Kunde</span>
              </div>
            </div>
          ) : null}

          <div className="vault-toolbar">
            <label className="field" style={{ margin: 0, minWidth: 220, flex: 1 }}>
              <span>Kunde filtern</span>
              <CustomerPicker
                value={filterCustomer}
                onChange={setFilterCustomer}
                allowEmpty
                emptyLabel="Alle Kunden"
                placeholder="Kunde suchen…"
                activeOnly={false}
              />
            </label>
            <label className="field" style={{ margin: 0, minWidth: 140 }}>
              <span>Sortierung</span>
              <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
                <option value="updated">Zuletzt geändert</option>
                <option value="title">Name A–Z</option>
                <option value="category">Kategorie</option>
                <option value="customer">Kunde</option>
              </select>
            </label>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setShowGenerator((v) => !v)}
            >
              {showGenerator ? "Generator aus" : "Generator"}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                if (showForm && !editingId) resetForm();
                else {
                  setEditingId(null);
                  setForm({ ...emptyForm, customerId: filterCustomer });
                  setShowForm(true);
                }
              }}
            >
              {showForm && !editingId ? "Abbrechen" : "+ Zugang"}
            </button>
          </div>

          <div className="wiki-toolbar asset-toolbar">
            <input
              className="wiki-search"
              type="search"
              placeholder="Suche Bezeichnung, Kategorie, Tag, Kunde…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="filter-chips">
              <button
                type="button"
                className={`chip ${favoritesOnly ? "chip-active" : ""}`}
                onClick={() => setFavoritesOnly((v) => !v)}
              >
                Nur Favoriten
              </button>
              <button
                type="button"
                className={`chip ${groupByCategory ? "chip-active" : ""}`}
                onClick={() => setGroupByCategory((v) => !v)}
              >
                Nach Kategorie
              </button>
              <button
                type="button"
                className={`chip ${categoryFilter === "all" ? "chip-active" : ""}`}
                onClick={() => setCategoryFilter("all")}
              >
                Alle Kategorien
              </button>
              {(Object.keys(vaultCategoryLabel) as VaultCategory[])
                .filter((k) => (categoryCounts.get(k) ?? 0) > 0 || categoryFilter === k)
                .map((k) => (
                  <button
                    key={k}
                    type="button"
                    className={`chip ${categoryFilter === k ? "chip-active" : ""}`}
                    onClick={() => setCategoryFilter(k)}
                  >
                    {vaultCategoryLabel[k]}
                    {categoryCounts.get(k) ? ` (${categoryCounts.get(k)})` : ""}
                  </button>
                ))}
            </div>
            {allTags.length > 0 ? (
              <div className="filter-chips">
                <button
                  type="button"
                  className={`chip ${!tagFilter ? "chip-active" : ""}`}
                  onClick={() => setTagFilter("")}
                >
                  Alle Tags
                </button>
                {allTags.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`chip ${tagFilter === t ? "chip-active" : ""}`}
                    onClick={() => setTagFilter(t)}
                  >
                    #{t}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {showGenerator ? (
            <section className="panel vault-generator">
              <div className="row-between">
                <h3>Passwort-Generator</h3>
                <span className={`vault-strength vault-strength-${strength.score}`}>
                  {generated ? strength.label : "Bereit"}
                </span>
              </div>
              <div className="vault-gen-result">
                <code className="vault-mono">{generated || "Noch kein Passwort erzeugt"}</code>
                <div className="form-actions">
                  <button type="button" className="btn btn-primary" onClick={runGenerator}>
                    Generieren
                  </button>
                  {generated ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => void copyText(generated, "Passwort kopiert")}
                      >
                        Kopieren
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => useGeneratedInForm(generated)}
                      >
                        In Formular
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
              <div className="vault-gen-opts form-grid">
                <label className="field">
                  <span>Länge: {genOpts.length}</span>
                  <input
                    type="range"
                    min={8}
                    max={64}
                    value={genOpts.length}
                    onChange={(e) =>
                      setGenOpts({ ...genOpts, length: Number(e.target.value) })
                    }
                  />
                </label>
                <Checkbox
                  className="vault-check"
                  label="Großbuchstaben"
                  checked={genOpts.upper}
                  onChange={(upper) => setGenOpts({ ...genOpts, upper })}
                />
                <Checkbox
                  className="vault-check"
                  label="Kleinbuchstaben"
                  checked={genOpts.lower}
                  onChange={(lower) => setGenOpts({ ...genOpts, lower })}
                />
                <Checkbox
                  className="vault-check"
                  label="Ziffern"
                  checked={genOpts.digits}
                  onChange={(digits) => setGenOpts({ ...genOpts, digits })}
                />
                <Checkbox
                  className="vault-check"
                  label="Sonderzeichen"
                  checked={genOpts.symbols}
                  onChange={(symbols) => setGenOpts({ ...genOpts, symbols })}
                />
                <Checkbox
                  className="vault-check"
                  label="Mehrdeutige meiden (0/O, 1/l/I)"
                  checked={genOpts.excludeAmbiguous}
                  onChange={(excludeAmbiguous) => setGenOpts({ ...genOpts, excludeAmbiguous })}
                />
              </div>
              {genHistory.length > 0 ? (
                <div className="vault-gen-history">
                  <div className="row-between">
                    <strong>Verlauf (lokal)</strong>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        clearGenHistory();
                        setGenHistory([]);
                      }}
                    >
                      Verlauf löschen
                    </button>
                  </div>
                  <ul className="vault-history-list">
                    {genHistory.map((item) => (
                      <li key={item.id}>
                        <code className="vault-mono">{item.password}</code>
                        <span className="muted">
                          {item.length} Z. · {new Date(item.createdAt).toLocaleString("de-DE")}
                        </span>
                        <div className="list-actions">
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => void copyText(item.password, "Aus Verlauf kopiert")}
                          >
                            Kopieren
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => useGeneratedInForm(item.password)}
                          >
                            Verwenden
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}

          {showForm ? (
            <form className="panel form-grid" onSubmit={onSave} autoComplete="off">
              <div className="full asset-form-title">
                <strong>{editingId ? "Zugang bearbeiten" : "Neuer Zugang"}</strong>
              </div>
              <label className="field">
                <span>Bezeichnung *</span>
                <input
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="z. B. Firewall admin / VPN"
                />
              </label>
              <label className="field">
                <span>Kategorie</span>
                <select
                  value={form.category}
                  onChange={(e) =>
                    setForm({ ...form, category: e.target.value as VaultCategory })
                  }
                >
                  {(Object.keys(vaultCategoryLabel) as VaultCategory[]).map((k) => (
                    <option key={k} value={k}>
                      {vaultCategoryLabel[k]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Kunde</span>
                <CustomerPicker
                  value={form.customerId}
                  onChange={(customerId) => setForm({ ...form, customerId })}
                  allowEmpty
                  emptyLabel="Kein Kunde / allgemein"
                  placeholder="Kunde suchen…"
                />
              </label>
              <div style={{ alignSelf: "end" }}>
                <Checkbox
                  label="Als Favorit markieren"
                  checked={form.favorite}
                  onChange={(favorite) => setForm({ ...form, favorite })}
                />
              </div>
              <label className="field">
                <span>Benutzername</span>
                <input
                  autoComplete="off"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                />
              </label>
              <label className="field">
                <span>
                  Passwort / Secret
                  {editingId ? " (leer = behalten)" : ""}
                </span>
                <div className="vault-password-field">
                  <input
                    type="text"
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder={editingId ? "Unverändert lassen…" : ""}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      const pw = generatePassword(genOpts);
                      setGenerated(pw);
                      setGenHistory(pushGenHistory(pw, genOpts.length));
                      setForm((f) => ({ ...f, password: pw }));
                    }}
                  >
                    Würfeln
                  </button>
                </div>
                {form.password ? (
                  <span className={`vault-strength vault-strength-${passwordStrength(form.password).score}`}>
                    {passwordStrength(form.password).label}
                  </span>
                ) : null}
              </label>
              <label className="field">
                <span>URL</span>
                <input
                  autoComplete="off"
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  placeholder="https://…"
                />
              </label>
              <label className="field full">
                <span>
                  2FA / TOTP-Secret
                  {editingId ? " (leer = behalten, „-“ zum Entfernen)" : ""}
                </span>
                <input
                  autoComplete="off"
                  spellCheck={false}
                  value={form.totpSecret}
                  onChange={(e) => setForm({ ...form, totpSecret: e.target.value })}
                  placeholder="Base32-Secret oder otpauth://…"
                />
                <span className="muted field-hint">
                  Secret aus dem Authenticator oder otpauth-URI einfügen – Codes werden lokal
                  erzeugt.
                </span>
              </label>
              <label className="field">
                <span>Tags</span>
                <input
                  value={form.tagsText}
                  onChange={(e) => setForm({ ...form, tagsText: e.target.value })}
                  placeholder="z. B. produktiv, backup, standby"
                />
              </label>
              <label className="field full">
                <span>Notizen (verschlüsselt)</span>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </label>
              <div className="full form-actions">
                <button className="btn btn-primary" type="submit">
                  {editingId ? "Änderungen speichern" : "Verschlüsselt speichern"}
                </button>
                <button className="btn btn-ghost" type="button" onClick={resetForm}>
                  Abbrechen
                </button>
              </div>
            </form>
          ) : null}

          {error ? <p className="form-error">{error}</p> : null}
          {copyHint ? <p className="form-success">{copyHint}</p> : null}

          {revealed ? (
            <section className="panel vault-reveal">
              <div className="row-between">
                <h3>{revealed.title}</h3>
                <button type="button" className="btn btn-ghost btn-sm" onClick={clearReveal}>
                  Schließen
                </button>
              </div>
              <p className="muted">Wird nach 60 Sekunden automatisch ausgeblendet.</p>
              <div className="vault-reveal-grid">
                <div>
                  <span className="label">Benutzer</span>
                  <p className="vault-secret-line">
                    <span>{revealed.username || "–"}</span>
                    {revealed.username ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => void copyText(revealed.username)}
                      >
                        Kopieren
                      </button>
                    ) : null}
                  </p>
                </div>
                <div>
                  <span className="label">Passwort</span>
                  <p className="vault-secret-line">
                    <span className="vault-mono">
                      {revealVisible ? revealed.password || "–" : "••••••••••••"}
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setRevealVisible((v) => !v)}
                    >
                      {revealVisible ? "Verbergen" : "Zeigen"}
                    </button>
                    {revealed.password ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => void copyText(revealed.password)}
                      >
                        Kopieren
                      </button>
                    ) : null}
                  </p>
                </div>
                <div className="full">
                  <span className="label">URL</span>
                  <p className="vault-secret-line">
                    <span>{revealed.url || "–"}</span>
                    {revealed.url ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => void copyText(revealed.url)}
                      >
                        Kopieren
                      </button>
                    ) : null}
                  </p>
                </div>
                {revealed.totpSecret ? (
                  <div className="full">
                    <span className="label">2FA-Code</span>
                    <TotpLiveCode
                      secret={revealed.totpSecret}
                      onCopy={(code) => void copyText(code, "2FA-Code kopiert")}
                    />
                  </div>
                ) : null}
                {revealed.notes ? (
                  <div className="full">
                    <span className="label">Notizen</span>
                    <pre className="vault-notes">{revealed.notes}</pre>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {entries.length === 0 ? (
            <p className="empty">
              Noch keine Zugänge. Lege VPN-, Admin- oder Hosting-Zugänge an – optional mit Generator.
            </p>
          ) : filtered.length === 0 ? (
            <p className="empty">Keine Zugänge für diese Filter.</p>
          ) : (
            <div className="asset-groups">
              {groups.map((group) => (
                <div key={group.key} className="asset-group">
                  {group.label ? (
                    <h3 className="asset-group-title">
                      {group.label}
                      <span className="muted"> · {group.items.length}</span>
                    </h3>
                  ) : null}
                  <ul className="list">
                    {group.items.map((entry) => (
                      <li key={entry.id} className="list-row vault-entry-row">
                        <div className="asset-main">
                          <div className="asset-title-row">
                            <button
                              type="button"
                              className={`vault-fav ${entry.favorite ? "is-on" : ""}`}
                              title={entry.favorite ? "Favorit entfernen" : "Als Favorit"}
                              onClick={() => void toggleFavorite(entry)}
                            >
                              ★
                            </button>
                            <strong>{entry.title}</strong>
                            {!groupByCategory ? (
                              <span className="badge badge-kind">
                                {vaultCategoryLabel[entry.category as VaultCategory] ??
                                  entry.category}
                              </span>
                            ) : null}
                          </div>
                          <span className="muted">
                            {entry.customerId
                              ? customerLabel(entry)
                              : "Allgemein"}
                            {" · "}
                            {formatDate(entry.updatedAt)}
                          </span>
                          {(entry.tags ?? []).length > 0 ? (
                            <div className="vault-tags">
                              {entry.tags.map((t) => (
                                <button
                                  key={t}
                                  type="button"
                                  className="vault-tag"
                                  onClick={() => setTagFilter(t)}
                                >
                                  #{t}
                                </button>
                              ))}
                            </div>
                          ) : null}
                          <span className="muted vault-flags">
                            {[
                              entry.hasUsername && "Benutzer",
                              entry.hasPassword && "Passwort",
                              entry.hasTotp && "2FA",
                              entry.hasUrl && "URL",
                              entry.hasNotes && "Notizen",
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </div>
                        <div className="list-actions">
                          {entry.customerId ? (
                            <Link
                              className="btn btn-ghost btn-sm"
                              to={`/customers/${entry.customerId}`}
                            >
                              Kunde
                            </Link>
                          ) : null}
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => void startEdit(entry)}
                          >
                            Bearbeiten
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => void onReveal(entry.id)}
                          >
                            Anzeigen
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => {
                              if (!confirm("Eintrag unwiderruflich löschen?")) return;
                              void api.vaultDeleteEntry(entry.id).then(() => loadEntries());
                            }}
                          >
                            Löschen
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Live-TOTP mit Countdown und Kopieren.
 */
function TotpLiveCode({
  secret,
  onCopy,
}: {
  secret: string;
  onCopy: (code: string) => void;
}) {
  const [code, setCode] = useState("------");
  const [remaining, setRemaining] = useState(30);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const result = await generateTotp(secret);
        if (cancelled) return;
        setCode(result.code);
        setRemaining(result.remaining);
        setError("");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Ungültiges TOTP-Secret");
          setCode("------");
        }
      }
    }
    void tick();
    const id = window.setInterval(() => void tick(), 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [secret]);

  return (
    <div className="vault-totp">
      {error ? (
        <p className="form-error">{error}</p>
      ) : (
        <>
          <p className="vault-secret-line vault-totp-line">
            <span className="vault-mono vault-totp-code">{formatTotpCode(code)}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onCopy(code)}>
              Kopieren
            </button>
          </p>
          <div className="vault-totp-meter" aria-hidden>
            <i style={{ width: `${(remaining / 30) * 100}%` }} />
          </div>
          <span className="muted vault-totp-remaining">{remaining}s</span>
        </>
      )}
    </div>
  );
}
