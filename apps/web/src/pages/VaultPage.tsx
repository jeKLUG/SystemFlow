import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { CustomerPicker } from "../components/CustomerPicker";
import { Modal } from "../components/Modal";
import { copyToClipboard } from "../lib/clipboard";
import { vaultCategoryLabel } from "../lib/labels";
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
};

const defaultGen: GeneratorOptions = {
  length: 20,
  upper: true,
  lower: true,
  digits: true,
  symbols: true,
  excludeAmbiguous: true,
};

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
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [showGenerator, setShowGenerator] = useState(false);
  const [genOpts, setGenOpts] = useState<GeneratorOptions>(defaultGen);
  const [generated, setGenerated] = useState("");
  const [genHistory, setGenHistory] = useState<GenHistoryItem[]>(() => loadGenHistory());
  const [copyHint, setCopyHint] = useState("");
  const [formError, setFormError] = useState("");
  const [copiedEntryId, setCopiedEntryId] = useState<string | null>(null);
  const [copyBusyId, setCopyBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const secretCache = useRef(new Map<string, { secret: VaultEntrySecret; at: number }>());
  const copyAnimTimer = useRef<number | null>(null);

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
      if (copyAnimTimer.current) window.clearTimeout(copyAnimTimer.current);
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
    setFormError("");
    setConfirmDelete(false);
  }

  function openCreate() {
    clearReveal();
    setEditingId(null);
    setForm({ ...emptyForm, customerId: filterCustomer });
    setFormError("");
    setShowForm(true);
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
    resetForm();
    setShowGenerator(false);
    await api.vaultLock();
    setStatus({ configured: true, unlocked: false, expiresAt: null });
  }

  async function startEdit(entry: VaultEntryMeta) {
    setError("");
    setFormError("");
    clearReveal();
    try {
      const secret = await api.vaultReveal(entry.id);
      setEditingId(entry.id);
      setForm({
        title: secret.title,
        category: (secret.category as VaultCategory) || "other",
        customerId: secret.customerId ?? "",
        username: secret.username ?? "",
        password: secret.password ?? "",
        url: secret.url ?? "",
        notes: secret.notes ?? "",
        totpSecret: secret.totpSecret ?? "",
        favorite: Boolean(secret.favorite ?? entry.favorite),
      });
      setShowForm(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Laden fehlgeschlagen");
      void refreshStatus();
    }
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    try {
      if (editingId) {
        await api.vaultUpdateEntry(editingId, {
          title: form.title,
          category: form.category,
          customerId: form.customerId || null,
          username: form.username,
          password: form.password,
          url: form.url,
          notes: form.notes,
          favorite: form.favorite,
          totpSecret: form.totpSecret.trim()
            ? normalizeTotpSecret(form.totpSecret)
            : null,
        });
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
          tags: [],
        });
      }
      resetForm();
      await loadEntries();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
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
      secretCache.current.set(id, { secret, at: Date.now() });
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

  /**
   * Holt Geheimnis (kurz gecacht) für Ein-Klick-Kopieren aus der Liste.
   */
  const getSecret = useCallback(async (id: string): Promise<VaultEntrySecret> => {
    const cached = secretCache.current.get(id);
    if (cached && Date.now() - cached.at < 45_000) return cached.secret;
    const secret = await api.vaultReveal(id);
    secretCache.current.set(id, { secret, at: Date.now() });
    return secret;
  }, []);

  async function copyText(value: string | null | undefined, label = "Kopiert") {
    if (!value) return;
    const ok = await copyToClipboard(value);
    if (!ok) {
      setError("Zwischenablage nicht verfügbar (HTTPS oder Browser-Freigabe nötig)");
      return;
    }
    setCopyHint(label);
    window.setTimeout(() => setCopyHint(""), 1600);
  }

  /**
   * Benutzername oder Passwort eines Eintrags entschlüsseln und kopieren (mit Karten-Animation).
   */
  async function copyEntryField(entry: VaultEntryMeta, field: "username" | "password") {
    if (field === "username" && !entry.hasUsername) return;
    if (field === "password" && !entry.hasPassword) return;
    setError("");
    setCopyBusyId(`${entry.id}:${field}`);
    try {
      const secret = await getSecret(entry.id);
      const value = field === "username" ? secret.username : secret.password;
      if (!value) {
        setError(field === "username" ? "Kein Benutzername hinterlegt" : "Kein Passwort hinterlegt");
        return;
      }
      const ok = await copyToClipboard(value);
      if (!ok) {
        setError("Zwischenablage nicht verfügbar (HTTPS oder Browser-Freigabe nötig)");
        return;
      }
      if (copyAnimTimer.current) window.clearTimeout(copyAnimTimer.current);
      setCopiedEntryId(entry.id);
      setCopyHint(field === "username" ? "Benutzername kopiert" : "Passwort kopiert");
      copyAnimTimer.current = window.setTimeout(() => {
        setCopiedEntryId(null);
        setCopyHint("");
      }, 1250);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kopieren fehlgeschlagen");
      void refreshStatus();
    } finally {
      setCopyBusyId(null);
    }
  }

  async function onDeleteEntry() {
    if (!editingId) return;
    setDeleteBusy(true);
    setFormError("");
    try {
      await api.vaultDeleteEntry(editingId);
      secretCache.current.delete(editingId);
      setConfirmDelete(false);
      resetForm();
      await loadEntries();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Löschen fehlgeschlagen");
    } finally {
      setDeleteBusy(false);
    }
  }

  function runGenerator() {
    const pw = generatePassword(genOpts);
    setGenerated(pw);
    setGenHistory(pushGenHistory(pw, genOpts.length));
  }

  function useGeneratedInForm(password: string) {
    setForm((f) => ({
      ...f,
      password,
      customerId: f.customerId || filterCustomer,
    }));
    setEditingId(null);
    setShowGenerator(false);
    setShowForm(true);
    setCopyHint("Passwort übernommen");
    window.setTimeout(() => setCopyHint(""), 1500);
  }

  const categoryCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) map.set(e.category, (map.get(e.category) ?? 0) + 1);
    return map;
  }, [entries]);

  const stats = useMemo(() => {
    const favorites = entries.filter((e) => e.favorite).length;
    return {
      total: entries.length,
      favorites,
      categories: categoryCounts.size,
    };
  }, [entries, categoryCounts]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    const list = entries.filter((e) => {
      if (favoritesOnly && !e.favorite) return false;
      if (categoryFilter !== "all" && e.category !== categoryFilter) return false;
      if (!query) return true;
      const hay = [
        e.title,
        e.category,
        vaultCategoryLabel[e.category as VaultCategory] ?? e.category,
        customerLabel(e),
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
  }, [entries, q, categoryFilter, favoritesOnly, sortKey]);

  const groups = useMemo(() => {
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
  }, [filtered]);

  const strength = passwordStrength(generated || form.password);

  if (!status) return <div className="boot">Lade Tresor…</div>;

  const lockedView = !status.configured || !status.unlocked;

  return (
    <div className={`page vault-page${lockedView ? " is-locked" : ""}`}>
      <div className="page-header vault-page-header">
        <div>
          <h2>Passworttresor</h2>
          {status.unlocked ? (
            <p className="muted">
              {stats.total} Zugang{stats.total === 1 ? "" : "e"}
              {stats.favorites > 0 ? ` · ${stats.favorites} Favoriten` : ""}
              {stats.categories > 0 ? ` · ${stats.categories} Kategorien` : ""}
            </p>
          ) : (
            <p className="muted">Freischaltung nur mit Vault-Passphrase</p>
          )}
        </div>
        {status.unlocked ? (
          <div className="page-actions">
            <button type="button" className="btn btn-danger" onClick={() => void onLock()}>
              Sperren
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
          <div className="panel vault-safe-toolbar">
            <div className="vault-safe-row">
              <input
                className="vault-safe-search"
                type="search"
                placeholder="Suche Bezeichnung, Kategorie, Kunde…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Zugänge durchsuchen"
              />
              <label className="field vault-safe-field">
                <span className="sr-only">Kunde</span>
                <CustomerPicker
                  value={filterCustomer}
                  onChange={setFilterCustomer}
                  allowEmpty
                  emptyLabel="Alle Kunden"
                  placeholder="Kunde…"
                  activeOnly={false}
                  compact
                />
              </label>
              <label className="field vault-safe-field vault-safe-sort">
                <span className="sr-only">Sortierung</span>
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
                onClick={() => setShowGenerator(true)}
              >
                Generator
              </button>
              <button type="button" className="btn btn-primary" onClick={openCreate}>
                + Zugang
              </button>
            </div>

            <div className="vault-safe-filters" role="group" aria-label="Filter">
              <button
                type="button"
                className={`vault-safe-chip${favoritesOnly ? " is-active" : ""}`}
                onClick={() => setFavoritesOnly((v) => !v)}
              >
                Favoriten
              </button>
              <label className="field vault-safe-field vault-safe-category">
                <span className="sr-only">Kategorie</span>
                <select
                  value={categoryFilter}
                  onChange={(e) =>
                    setCategoryFilter(
                      e.target.value === "all" ? "all" : (e.target.value as VaultCategory),
                    )
                  }
                >
                  <option value="all">Alle Kategorien</option>
                  {(Object.keys(vaultCategoryLabel) as VaultCategory[]).map((k) => (
                    <option key={k} value={k}>
                      {vaultCategoryLabel[k]}
                      {categoryCounts.get(k) ? ` (${categoryCounts.get(k)})` : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {error ? <p className="form-error">{error}</p> : null}
          {copyHint ? <p className="form-success">{copyHint}</p> : null}

          {entries.length === 0 ? (
            <div className="vault-safe-empty panel">
              <div className="vault-safe-empty-icon" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <rect x="5" y="10" width="14" height="10" rx="2" />
                  <path d="M8 10V7a4 4 0 018 0v3" strokeLinecap="round" />
                </svg>
              </div>
              <div>
                <strong>Noch keine Zugänge</strong>
                <p className="muted">VPN, Admin, Hosting oder andere Zugänge verschlüsselt ablegen.</p>
              </div>
              <div className="vault-safe-empty-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setShowGenerator(true)}>
                  Generator
                </button>
                <button type="button" className="btn btn-primary" onClick={openCreate}>
                  Ersten Zugang
                </button>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <p className="empty panel">Keine Zugänge für diese Filter.</p>
          ) : (
            <div className="vault-safe-groups">
              {groups.map((group) => (
                <section key={group.key} className="vault-safe-group">
                  {group.label ? (
                    <h3 className="vault-safe-group-title">
                      {group.label}
                      <span>{group.items.length}</span>
                    </h3>
                  ) : null}
                  <ul className="vault-safe-list">
                    {group.items.map((entry) => (
                      <VaultEntryCard
                        key={entry.id}
                        entry={entry}
                        showCategory={false}
                        copying={copiedEntryId === entry.id}
                        copyBusyField={
                          copyBusyId === `${entry.id}:username`
                            ? "username"
                            : copyBusyId === `${entry.id}:password`
                              ? "password"
                              : null
                        }
                        getSecret={getSecret}
                        onCopyField={copyEntryField}
                        onToggleFavorite={toggleFavorite}
                        onEdit={startEdit}
                        onReveal={onReveal}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}

          <Modal
            open={showForm}
            title={editingId ? "Zugang bearbeiten" : "Neuer Zugang"}
            onClose={resetForm}
            className="modal-wide modal-vault-access"
          >
            <form className="form-grid vault-access-form" onSubmit={onSave} autoComplete="off">
              <div className="vault-access-hero full">
                <label className="field vault-access-title-field">
                  <span>Bezeichnung *</span>
                  <input
                    required
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="z. B. Firewall admin / VPN"
                  />
                </label>
                <button
                  type="button"
                  className={`vault-fav-toggle${form.favorite ? " is-on" : ""}`}
                  aria-pressed={form.favorite}
                  aria-label={form.favorite ? "Favorit entfernen" : "Als Favorit markieren"}
                  title={form.favorite ? "Favorit entfernen" : "Als Favorit markieren"}
                  onClick={() => setForm({ ...form, favorite: !form.favorite })}
                >
                  <span className="vault-fav-toggle-icon" aria-hidden>
                    {form.favorite ? (
                      <svg viewBox="0 0 24 24" fill="none">
                        <path
                          d="M9 10.5L11 12.5L15.5 8M19 21V7.8C19 6.11984 19 5.27976 18.673 4.63803C18.3854 4.07354 17.9265 3.6146 17.362 3.32698C16.7202 3 15.8802 3 14.2 3H9.8C8.11984 3 7.27976 3 6.63803 3.32698C6.07354 3.6146 5.6146 4.07354 5.32698 4.63803C5 5.27976 5 6.11984 5 7.8V21L12 17L19 21Z"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none">
                        <path
                          d="M12 13V7M9 10H15M19 21V7.8C19 6.11984 19 5.27976 18.673 4.63803C18.3854 4.07354 17.9265 3.6146 17.362 3.32698C16.7202 3 15.8802 3 14.2 3H9.8C8.11984 3 7.27976 3 6.63803 3.32698C6.07354 3.6146 5.6146 4.07354 5.32698 4.63803C5 5.27976 5 6.11984 5 7.8V21L12 17L19 21Z"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </span>
                </button>
              </div>

              <p className="vault-access-section full">Zuordnung</p>
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

              <p className="vault-access-section full">Zugangsdaten</p>
              <label className="field">
                <span>Benutzername</span>
                <input
                  autoComplete="off"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  placeholder="optional"
                />
              </label>
              <label className="field">
                <span>Passwort / Secret</span>
                <div className="vault-password-field">
                  <input
                    type="text"
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder={editingId ? "" : "Geheimnis eingeben"}
                    required={!editingId}
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
                  <span
                    className={`vault-strength vault-strength-${passwordStrength(form.password).score}`}
                  >
                    {passwordStrength(form.password).label}
                  </span>
                ) : (
                  <span className="vault-access-hint">
                    {editingId
                      ? "Leer lassen entfernt das Passwort"
                      : "Oder mit „Würfeln“ ein sicheres Passwort erzeugen"}
                  </span>
                )}
              </label>

              <p className="vault-access-section full">Weitere Angaben</p>
              <label className="field full">
                <span>URL</span>
                <input
                  autoComplete="off"
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  placeholder="https://…"
                />
              </label>
              <label className="field full">
                <span>2FA / TOTP-Secret</span>
                <input
                  autoComplete="off"
                  spellCheck={false}
                  value={form.totpSecret}
                  onChange={(e) => setForm({ ...form, totpSecret: e.target.value })}
                  placeholder="Base32-Secret oder otpauth://…"
                />
                {editingId ? (
                  <span className="vault-access-hint">Leer lassen entfernt die 2FA</span>
                ) : null}
              </label>
              <label className="field full">
                <span>Notizen (verschlüsselt)</span>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Optional – nur im entsperrten Tresor lesbar"
                />
              </label>
              {formError ? <p className="form-error full">{formError}</p> : null}
              <div className="full form-actions modal-actions vault-form-actions">
                {editingId ? (
                  <button
                    className="btn btn-danger"
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                  >
                    Löschen
                  </button>
                ) : null}
                <div className="vault-form-actions-end">
                  <button className="btn btn-ghost" type="button" onClick={resetForm}>
                    Abbrechen
                  </button>
                  <button className="btn btn-primary" type="submit">
                    {editingId ? "Speichern" : "Verschlüsselt speichern"}
                  </button>
                </div>
              </div>
            </form>
          </Modal>

          <Modal
            open={confirmDelete}
            title="Zugang löschen?"
            onClose={() => !deleteBusy && setConfirmDelete(false)}
          >
            <p className="muted">
              „{form.title || "Dieser Zugang"}“ wird unwiderruflich gelöscht. Fortfahren?
            </p>
            <div className="form-actions modal-actions">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={deleteBusy}
                onClick={() => setConfirmDelete(false)}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={deleteBusy}
                onClick={() => void onDeleteEntry()}
              >
                {deleteBusy ? "Löscht…" : "Endgültig löschen"}
              </button>
            </div>
          </Modal>

          <Modal
            open={showGenerator}
            title="Passwort-Generator"
            onClose={() => setShowGenerator(false)}
            className="modal-wide modal-vault-generator"
          >
            <div className="vault-generator is-modal">
              <div className="vault-gen-stage">
                <div className="vault-gen-stage-top">
                  <p className="vault-gen-lede muted">
                    Lokal im Browser erzeugen – nichts wird an den Server gesendet.
                  </p>
                  <div
                    className={`vault-gen-strength vault-gen-strength-${generated ? strength.score : "idle"}`}
                    aria-live="polite"
                  >
                    <span className="vault-gen-strength-bars" aria-hidden>
                      {[0, 1, 2, 3].map((i) => (
                        <i key={i} className={generated && strength.score > i ? "is-on" : undefined} />
                      ))}
                    </span>
                    <span>{generated ? strength.label : "Bereit"}</span>
                  </div>
                </div>

                <div className="vault-gen-output">
                  <code className={`vault-mono vault-gen-password${!generated ? " is-empty" : ""}`}>
                    {generated || "Noch kein Passwort erzeugt"}
                  </code>
                  <div className="vault-gen-actions">
                    <button type="button" className="btn btn-primary" onClick={runGenerator}>
                      Generieren
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={!generated}
                      onClick={() => void copyText(generated, "Passwort kopiert")}
                    >
                      Kopieren
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={!generated}
                      onClick={() => useGeneratedInForm(generated)}
                    >
                      In neuen Zugang
                    </button>
                  </div>
                </div>
              </div>

              <div className="vault-gen-panel">
                <div className="vault-gen-length">
                  <div className="vault-gen-length-head">
                    <span>Länge</span>
                    <strong>{genOpts.length}</strong>
                  </div>
                  <input
                    className="vault-gen-range"
                    type="range"
                    min={8}
                    max={64}
                    value={genOpts.length}
                    onChange={(e) =>
                      setGenOpts({ ...genOpts, length: Number(e.target.value) })
                    }
                    aria-label="Passwortlänge"
                  />
                  <div className="vault-gen-length-scale" aria-hidden>
                    <span>8</span>
                    <span>64</span>
                  </div>
                </div>

                <div className="vault-gen-chips" role="group" aria-label="Zeichenarten">
                  {(
                    [
                      ["lower", "Kleinbuchstaben", genOpts.lower],
                      ["upper", "Großbuchstaben", genOpts.upper],
                      ["digits", "Ziffern", genOpts.digits],
                      ["symbols", "Sonderzeichen", genOpts.symbols],
                      ["excludeAmbiguous", "Ohne 0/O, 1/l/I", genOpts.excludeAmbiguous],
                    ] as const
                  ).map(([key, label, on]) => (
                    <button
                      key={key}
                      type="button"
                      className={`vault-gen-chip${on ? " is-on" : ""}`}
                      aria-pressed={on}
                      onClick={() =>
                        setGenOpts({
                          ...genOpts,
                          [key]: !on,
                        })
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {genHistory.length > 0 ? (
                <div className="vault-gen-history">
                  <div className="vault-gen-history-head">
                    <strong>Verlauf</strong>
                    <span className="muted">nur lokal</span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        clearGenHistory();
                        setGenHistory([]);
                      }}
                    >
                      Löschen
                    </button>
                  </div>
                  <ul className="vault-history-list">
                    {genHistory.map((item) => (
                      <li key={item.id}>
                        <div className="vault-history-main">
                          <code className="vault-mono">{item.password}</code>
                          <span className="muted">
                            {item.length} Zeichen ·{" "}
                            {new Date(item.createdAt).toLocaleString("de-DE")}
                          </span>
                        </div>
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
            </div>
          </Modal>

          <Modal
            open={Boolean(revealed)}
            title={revealed?.title ?? "Zugang"}
            onClose={clearReveal}
            className="modal-wide"
          >
            {revealed ? (
              <div className="vault-reveal is-modal">
                <p className="muted vault-reveal-hint">
                  Wird nach 60 Sekunden automatisch ausgeblendet.
                </p>
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
                <div className="form-actions modal-actions">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      const id = revealed.id;
                      const entry = entries.find((e) => e.id === id);
                      clearReveal();
                      if (entry) void startEdit(entry);
                    }}
                  >
                    Bearbeiten
                  </button>
                  <button type="button" className="btn btn-primary" onClick={clearReveal}>
                    Schließen
                  </button>
                </div>
              </div>
            ) : null}
          </Modal>
        </>
      )}
    </div>
  );
}

/**
 * Zugangskarte im Passwordmanager-Stil: Benutzer/Passwort mit Kopieren und Rahmen-Animation.
 */
function VaultEntryCard({
  entry,
  showCategory,
  copying,
  copyBusyField,
  getSecret,
  onCopyField,
  onToggleFavorite,
  onEdit,
  onReveal,
}: {
  entry: VaultEntryMeta;
  showCategory: boolean;
  copying: boolean;
  copyBusyField: "username" | "password" | null;
  getSecret: (id: string) => Promise<VaultEntrySecret>;
  onCopyField: (entry: VaultEntryMeta, field: "username" | "password") => void | Promise<void>;
  onToggleFavorite: (entry: VaultEntryMeta) => void | Promise<void>;
  onEdit: (entry: VaultEntryMeta) => void | Promise<void>;
  onReveal: (id: string) => void | Promise<void>;
}) {
  const rootRef = useRef<HTMLLIElement>(null);
  const [secret, setSecret] = useState<VaultEntrySecret | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getSecret(entry.id)
      .then((s) => {
        if (!cancelled) setSecret(s);
      })
      .catch(() => {
        if (!cancelled) setSecret(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entry.id, getSecret]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const username = secret?.username ?? "";
  const password = secret?.password ?? "";
  const strength = password
    ? passwordStrength(password)
    : { score: 0, label: "–" };
  const strengthShort =
    strength.label === "–"
      ? "–"
      : strength.score >= 3
        ? "STARK"
        : strength.score === 2
          ? "MITTEL"
          : "SCHWACH";

  return (
    <li
      ref={rootRef}
      className={`vault-entry-card${copying ? " is-copying" : ""}${entry.favorite ? " is-favorite" : ""}${menuOpen ? " is-menu-open" : ""}`}
    >
      <svg className="vault-entry-trace" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {/* Start oben Mitte → einmal im Uhrzeigersinn umlaufen */}
        <path
          pathLength="1"
          d="M50 1.35
             H94.6
             A4.05 4.05 0 0 1 98.65 5.4
             V94.6
             A4.05 4.05 0 0 1 94.6 98.65
             H5.4
             A4.05 4.05 0 0 1 1.35 94.6
             V5.4
             A4.05 4.05 0 0 1 5.4 1.35
             Z"
        />
      </svg>

      <div className="vault-entry-head">
        <button
          type="button"
          className={`vault-entry-icon-btn vault-entry-fav${entry.favorite ? " is-on" : ""}`}
          title={entry.favorite ? "Favorit entfernen" : "Als Favorit"}
          onClick={() => void onToggleFavorite(entry)}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden>
            {entry.favorite ? (
              <path
                d="M9 10.5L11 12.5L15.5 8M19 21V7.8C19 6.11984 19 5.27976 18.673 4.63803C18.3854 4.07354 17.9265 3.6146 17.362 3.32698C16.7202 3 15.8802 3 14.2 3H9.8C8.11984 3 7.27976 3 6.63803 3.32698C6.07354 3.6146 5.6146 4.07354 5.32698 4.63803C5 5.27976 5 6.11984 5 7.8V21L12 17L19 21Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : (
              <path
                d="M12 13V7M9 10H15M19 21V7.8C19 6.11984 19 5.27976 18.673 4.63803C18.3854 4.07354 17.9265 3.6146 17.362 3.32698C16.7202 3 15.8802 3 14.2 3H9.8C8.11984 3 7.27976 3 6.63803 3.32698C6.07354 3.6146 5.6146 4.07354 5.32698 4.63803C5 5.27976 5 6.11984 5 7.8V21L12 17L19 21Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </svg>
        </button>
        <div className="vault-entry-heading">
          <strong className="vault-entry-title">{entry.title}</strong>
          {showCategory ? (
            <span className="vault-entry-sub">
              {vaultCategoryLabel[entry.category as VaultCategory] ?? entry.category}
              {entry.customerId ? ` · ${customerLabel(entry)}` : ""}
            </span>
          ) : entry.customerId ? (
            <span className="vault-entry-sub">{customerLabel(entry)}</span>
          ) : null}
        </div>
        <div className="vault-entry-menu">
          <button
            type="button"
            className="vault-entry-icon-btn"
            aria-label="Aktionen"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <circle cx="12" cy="6" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="12" cy="18" r="1.6" />
            </svg>
          </button>
          {menuOpen ? (
            <div className="vault-entry-menu-pop" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  void onEdit(entry);
                }}
              >
                Bearbeiten
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  void onReveal(entry.id);
                }}
              >
                Details anzeigen
              </button>
              {entry.customerId ? (
                <Link
                  role="menuitem"
                  to={`/customers/${entry.customerId}`}
                  onClick={() => setMenuOpen(false)}
                >
                  Kunde öffnen
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className={`vault-entry-strength is-score-${strength.score}`} aria-label={`Stärke: ${strength.label}`}>
        <span className="vault-entry-strength-dashes" aria-hidden>
          {Array.from({ length: 5 }, (_, i) => (
            <i key={i} className={i < Math.max(strength.score, password ? 1 : 0) ? "is-on" : ""} />
          ))}
        </span>
        <span className="vault-entry-strength-label">{loading ? "…" : strengthShort}</span>
      </div>

      <div className="vault-entry-creds">
        <div className="vault-entry-cred-row">
          <span className="vault-entry-cred-icon" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <circle cx="12" cy="9" r="3.2" />
              <path d="M6.5 18.5c1.4-2.4 3.3-3.5 5.5-3.5s4.1 1.1 5.5 3.5" strokeLinecap="round" />
            </svg>
          </span>
          <span className="vault-entry-cred-value">
            {loading ? "…" : username || (entry.hasUsername ? "–" : "Kein Benutzer")}
          </span>
          <button
            type="button"
            className="vault-entry-icon-btn"
            title="Benutzername kopieren"
            disabled={!entry.hasUsername || copyBusyField === "username" || loading}
            onClick={() => void onCopyField(entry, "username")}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <rect x="8.5" y="8.5" width="10" height="10" rx="2" />
              <path d="M6.5 15.5V7A1.5 1.5 0 0 1 8 5.5h8.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="vault-entry-cred-row">
          <span className="vault-entry-cred-icon" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <circle cx="8.5" cy="12" r="3" />
              <path d="M11.5 12h8.5M16.5 12v3.5M19.5 12v2.2" strokeLinecap="round" />
            </svg>
          </span>
          <span className={`vault-entry-cred-value${showPassword ? " is-mono" : ""}`}>
            {loading
              ? "…"
              : password
                ? showPassword
                  ? password
                  : "••••••••••••"
                : entry.hasPassword
                  ? "••••••••••••"
                  : "Kein Passwort"}
          </span>
          <button
            type="button"
            className="vault-entry-icon-btn"
            title={showPassword ? "Passwort verbergen" : "Passwort zeigen"}
            disabled={!entry.hasPassword || loading || !password}
            onClick={() => setShowPassword((v) => !v)}
          >
            {showPassword ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M4 4l16 16M10.5 10.7A3 3 0 0 0 13.3 13.5" strokeLinecap="round" />
                <path
                  d="M9.2 5.6A10.5 10.5 0 0 1 12 5c5.2 0 8.8 3.8 10 7-0.5 1.3-1.4 2.8-2.8 4.1M6.2 6.8C4.5 8.1 3.4 9.8 2.9 12c1.2 3.2 4.8 7 9.1 7 1.3 0 2.5-.3 3.6-.7"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M2.9 12C4.1 8.8 7.7 5 12 5s7.9 3.8 9.1 7c-1.2 3.2-4.8 7-9.1 7s-7.9-3.8-9.1-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
          <button
            type="button"
            className="vault-entry-icon-btn"
            title="Passwort kopieren"
            disabled={!entry.hasPassword || copyBusyField === "password" || loading}
            onClick={() => void onCopyField(entry, "password")}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <rect x="8.5" y="8.5" width="10" height="10" rx="2" />
              <path d="M6.5 15.5V7A1.5 1.5 0 0 1 8 5.5h8.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
    </li>
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
