import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { customerDisplayName } from "../lib/customer";
import { formatDate, vaultCategoryLabel } from "../lib/labels";
import type { Customer, VaultCategory, VaultEntryMeta, VaultEntrySecret, VaultStatus } from "../types";

const emptyForm = {
  title: "",
  category: "admin" as VaultCategory,
  customerId: "",
  username: "",
  password: "",
  url: "",
  notes: "",
};

/**
 * Passworttresor: nur nach Freischaltung nutzbar, Secrets zeitlich begrenzt sichtbar.
 */
export function VaultPage() {
  const [params] = useSearchParams();
  const presetCustomer = params.get("customerId") ?? "";
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [entries, setEntries] = useState<VaultEntryMeta[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filterCustomer, setFilterCustomer] = useState(presetCustomer);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm, customerId: presetCustomer });
  const [passphrase, setPassphrase] = useState("");
  const [passConfirm, setPassConfirm] = useState("");
  const [revealed, setRevealed] = useState<VaultEntrySecret | null>(null);
  const [revealVisible, setRevealVisible] = useState(false);
  const revealTimer = useRef<number | null>(null);

  async function refreshStatus() {
    setStatus(await api.vaultStatus());
  }

  async function loadEntries() {
    const list = await api.vaultEntries(filterCustomer || undefined);
    setEntries(list);
  }

  useEffect(() => {
    void Promise.all([refreshStatus(), api.customers()]).then(([, c]) => setCustomers(c));
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

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api.vaultCreateEntry({
        title: form.title,
        category: form.category,
        customerId: form.customerId || null,
        username: form.username,
        password: form.password,
        url: form.url,
        notes: form.notes,
      });
      setForm({ ...emptyForm, customerId: filterCustomer });
      setShowForm(false);
      await loadEntries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
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

  async function copyText(value: string | null | undefined) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      setError("Zwischenablage nicht verfügbar");
    }
  }

  if (!status) return <div className="boot">Lade Tresor…</div>;

  return (
    <div className="page vault-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Sicherheit</p>
          <h2>Passworttresor</h2>
          <p>
            Zugangsdaten verschlüsselt mit AES-256-GCM. Freischaltung nur mit eigener Vault-Passphrase
            (nicht dein Login).
          </p>
        </div>
        {status.unlocked ? (
          <button type="button" className="btn btn-danger" onClick={() => void onLock()}>
            Tresor sperren
          </button>
        ) : null}
      </div>

      <div className="vault-security-note panel">
        <strong>Wichtig</strong>
        <ul>
          <li>Vault-Passphrase mindestens 12 Zeichen – getrennt vom Login speichern.</li>
          <li>Schlüssel liegt nur während der Freischaltung im Server-RAM (ca. 15 Min.).</li>
          <li>Bei DB-Diebstahl ohne Passphrase sind Einträge nicht lesbar.</li>
          <li>Vault-Inhalte werden nicht im Kunden-ZIP-Export mitgeliefert.</li>
        </ul>
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
          <div className="vault-toolbar">
            <label className="field" style={{ margin: 0, minWidth: 200 }}>
              <span>Kunde</span>
              <select
                value={filterCustomer}
                onChange={(e) => setFilterCustomer(e.target.value)}
              >
                <option value="">Alle Kunden</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {customerDisplayName(c)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setShowForm((v) => !v);
                setForm({ ...emptyForm, customerId: filterCustomer });
              }}
            >
              {showForm ? "Abbrechen" : "+ Zugang"}
            </button>
          </div>

          {showForm ? (
            <form className="panel form-grid" onSubmit={onCreate} autoComplete="off">
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
                <select
                  value={form.customerId}
                  onChange={(e) => setForm({ ...form, customerId: e.target.value })}
                >
                  <option value="">Kein Kunde / allgemein</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {customerDisplayName(c)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Benutzername</span>
                <input
                  autoComplete="off"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Passwort / Secret</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
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
                <span>Notizen (verschlüsselt)</span>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </label>
              <div className="full">
                <button className="btn btn-primary" type="submit">
                  Verschlüsselt speichern
                </button>
              </div>
            </form>
          ) : null}

          {error ? <p className="form-error">{error}</p> : null}

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
            <p className="empty">Noch keine Zugänge. Lege VPN-, Admin- oder Hosting-Zugänge an.</p>
          ) : (
            <ul className="list">
              {entries.map((entry) => (
                <li key={entry.id} className="list-row vault-entry-row">
                  <div>
                    <strong>{entry.title}</strong>
                    <span className="muted">
                      {vaultCategoryLabel[entry.category as VaultCategory] ?? entry.category}
                      {entry.customerId
                        ? ` · ${entry.customerCompany || entry.customerName || "Kunde"}`
                        : " · Allgemein"}
                      {" · "}
                      {formatDate(entry.updatedAt)}
                    </span>
                    <span className="muted vault-flags">
                      {[
                        entry.hasUsername && "Benutzer",
                        entry.hasPassword && "Passwort",
                        entry.hasUrl && "URL",
                        entry.hasNotes && "Notizen",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                  <div className="cta-row">
                    {entry.customerId ? (
                      <Link className="btn btn-ghost btn-sm" to={`/customers/${entry.customerId}`}>
                        Kunde
                      </Link>
                    ) : null}
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
          )}
        </>
      )}
    </div>
  );
}
