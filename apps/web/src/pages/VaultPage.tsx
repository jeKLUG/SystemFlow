import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { Checkbox } from "../components/Checkbox";
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
        password: "",
        url: secret.url ?? "",
        notes: secret.notes ?? "",
        totpSecret: "",
        favorite: Boolean(secret.favorite ?? entry.favorite),
        tagsText: (secret.tags ?? entry.tags ?? []).join(", "),
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
      }, 1300);
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
                placeholder="Suche Bezeichnung, Kategorie, Tag, Kunde…"
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
              <button
                type="button"
                className={`vault-safe-chip${groupByCategory ? " is-active" : ""}`}
                onClick={() => setGroupByCategory((v) => !v)}
              >
                Nach Kategorie
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
              {allTags.length > 0 ? (
                <label className="field vault-safe-field vault-safe-tag">
                  <span className="sr-only">Tag</span>
                  <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
                    <option value="">Alle Tags</option>
                    {allTags.map((t) => (
                      <option key={t} value={t}>
                        #{t}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
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
                        showCategory={!groupByCategory}
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
            className="modal-wide"
          >
            <form className="form-grid" onSubmit={onSave} autoComplete="off">
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
              <div className="field vault-form-fav">
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
              <label className="field">
                <span>Tags</span>
                <input
                  value={form.tagsText}
                  onChange={(e) => setForm({ ...form, tagsText: e.target.value })}
                  placeholder="z. B. produktiv, backup"
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
              </label>
              <label className="field full">
                <span>Notizen (verschlüsselt)</span>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
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
            className="modal-wide"
          >
            <div className="vault-generator is-modal">
              <div className="row-between vault-gen-head">
                <p className="muted">
                  Lokal erzeugen und kopieren oder direkt in einen neuen Zugang übernehmen.
                </p>
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
                        In neuen Zugang
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
      className={`vault-entry-card${copying ? " is-copying" : ""}${entry.favorite ? " is-favorite" : ""}`}
    >
      <svg className="vault-entry-trace" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <rect x="1.2" y="1.2" width="97.6" height="97.6" rx="5" ry="5" pathLength="100" />
      </svg>

      <div className="vault-entry-head">
        <button
          type="button"
          className={`vault-entry-icon-btn vault-entry-fav${entry.favorite ? " is-on" : ""}`}
          title={entry.favorite ? "Favorit entfernen" : "Als Favorit"}
          onClick={() => void onToggleFavorite(entry)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M7 4.5h10v15l-5-3.2L7 19.5v-15Z" strokeLinejoin="round" />
            {!entry.favorite ? <path d="M12 8v5M9.5 10.5h5" strokeLinecap="round" /> : null}
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
