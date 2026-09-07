import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../auth";
import { api } from "../api";
import type { OrgSettings, PriceItem, PriceItemKind } from "../types";

const kindLabel: Record<PriceItemKind, string> = {
  hourly: "Stundensatz",
  fixed: "Pauschale",
  unit: "Stückpreis",
};

const emptyPrice = {
  name: "",
  description: "",
  kind: "hourly" as PriceItemKind,
  unitLabel: "",
  unitPrice: "",
  sku: "",
};

/**
 * Konto: Passwort sowie Stundensätze / Preiskatalog für Rechnungsvorbereitung.
 */
export function SettingsPage() {
  const { user, changePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  const [org, setOrg] = useState<OrgSettings | null>(null);
  const [orgForm, setOrgForm] = useState({
    defaultHourlyRate: "",
    currency: "EUR",
    defaultVatPercent: "19",
    invoiceNote: "",
  });
  const [orgMsg, setOrgMsg] = useState("");
  const [prices, setPrices] = useState<PriceItem[]>([]);
  const [priceForm, setPriceForm] = useState(emptyPrice);
  const [showPriceForm, setShowPriceForm] = useState(false);
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [priceError, setPriceError] = useState("");

  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMsg, setBackupMsg] = useState("");
  const [backupInfo, setBackupInfo] = useState<{
    databaseBytes: number;
    uploadFiles: number;
    hint: string;
  } | null>(null);

  async function loadPricing() {
    const [settings, items] = await Promise.all([api.orgSettings(), api.priceItems()]);
    setOrg(settings);
    setOrgForm({
      defaultHourlyRate:
        settings.defaultHourlyRate != null ? String(settings.defaultHourlyRate) : "",
      currency: settings.currency || "EUR",
      defaultVatPercent:
        settings.defaultVatPercent != null ? String(settings.defaultVatPercent) : "",
      invoiceNote: settings.invoiceNote ?? "",
    });
    setPrices(items);
  }

  useEffect(() => {
    void loadPricing();
    void api
      .backupInfo()
      .then((info) => setBackupInfo(info))
      .catch(() => setBackupInfo(null));
  }, []);

  async function downloadBackup() {
    setBackupMsg("");
    setBackupBusy(true);
    try {
      await api.downloadBackup();
      setBackupMsg("Backup heruntergeladen. Bewahre die ZIP sicher auf.");
    } catch (err) {
      setBackupMsg(err instanceof Error ? err.message : "Download fehlgeschlagen");
    } finally {
      setBackupBusy(false);
    }
  }

  async function onRestoreFile(file: File | null) {
    if (!file) return;
    const ok = confirm(
      "Achtung: Die aktuelle Datenbank und alle Uploads werden durch das Backup ersetzt.\n\nDer Dienst startet danach neu. Fortfahren?",
    );
    if (!ok) return;
    setBackupMsg("");
    setBackupBusy(true);
    try {
      const result = await api.restoreBackup(file);
      setBackupMsg(
        result.message ||
          "Sicherung eingespielt. Bitte die Seite in wenigen Sekunden neu laden.",
      );
      setTimeout(() => {
        window.location.reload();
      }, 2500);
    } catch (err) {
      setBackupMsg(err instanceof Error ? err.message : "Import fehlgeschlagen");
      setBackupBusy(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (newPassword.length < 8) {
      setError("Neues Passwort mindestens 8 Zeichen");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwörter stimmen nicht überein");
      return;
    }

    setBusy(true);
    try {
      await changePassword(currentPassword, newPassword);
      setSuccess("Passwort gespeichert");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ändern fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  async function saveOrg(e: FormEvent) {
    e.preventDefault();
    setOrgMsg("");
    try {
      const updated = await api.updateOrgSettings({
        defaultHourlyRate: orgForm.defaultHourlyRate
          ? Number(orgForm.defaultHourlyRate)
          : null,
        currency: orgForm.currency.trim() || "EUR",
        defaultVatPercent: orgForm.defaultVatPercent
          ? Number(orgForm.defaultVatPercent)
          : null,
        invoiceNote: orgForm.invoiceNote,
      });
      setOrg(updated);
      setOrgMsg("Gespeichert");
      window.setTimeout(() => setOrgMsg(""), 2000);
    } catch (err) {
      setOrgMsg(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    }
  }

  function startEditPrice(item: PriceItem) {
    setEditingPriceId(item.id);
    setShowPriceForm(true);
    setPriceForm({
      name: item.name,
      description: item.description ?? "",
      kind: item.kind,
      unitLabel: item.unitLabel ?? "",
      unitPrice: String(item.unitPrice),
      sku: item.sku ?? "",
    });
  }

  function resetPriceForm() {
    setPriceForm(emptyPrice);
    setEditingPriceId(null);
    setShowPriceForm(false);
    setPriceError("");
  }

  async function savePrice(e: FormEvent) {
    e.preventDefault();
    setPriceError("");
    const body = {
      name: priceForm.name,
      description: priceForm.description,
      kind: priceForm.kind,
      unitLabel: priceForm.unitLabel,
      unitPrice: Number(priceForm.unitPrice),
      sku: priceForm.sku,
      active: true,
    };
    try {
      if (editingPriceId) {
        await api.updatePriceItem(editingPriceId, body);
      } else {
        await api.createPriceItem(body);
      }
      resetPriceForm();
      await loadPricing();
    } catch (err) {
      setPriceError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    }
  }

  return (
    <div className="page settings-page">
      <div className="page-header">
        <div>
          <h2>Einstellungen</h2>
          <p className="muted">Konto und Abrechnung · {user?.username}</p>
        </div>
      </div>

      <section className="panel settings-card">
        <header className="settings-card-head">
          <div>
            <p className="eyebrow">Profil</p>
            <h3>Passwort ändern</h3>
          </div>
        </header>
        <p className="settings-card-lead muted">
          Nach dem Ändern bleibst du angemeldet. Das Passwort wird nicht durch Deployments
          zurückgesetzt.
        </p>
        <form className="settings-password-form" onSubmit={onSubmit}>
          <label className="field">
            <span>Aktuelles Passwort</span>
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>Neues Passwort</span>
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
          <label className="field">
            <span>Bestätigen</span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
          {error ? <p className="form-error settings-span-all">{error}</p> : null}
          {success ? <p className="form-success settings-span-all">{success}</p> : null}
          <div className="settings-span-all">
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? "Speichert…" : "Passwort speichern"}
            </button>
          </div>
        </form>
      </section>

      <section className="panel settings-card">
        <header className="settings-card-head">
          <div>
            <p className="eyebrow">Abrechnung</p>
            <h3>Standardpreise</h3>
          </div>
        </header>
        <p className="settings-card-lead muted">
          Satz für neue Zeitbuchungen (Snapshot). Rechnungen schreibst du weiter in Lexware – hier
          sammelst du die Beträge aus der Kundenhistorie.
        </p>
        <form className="settings-org-form" onSubmit={saveOrg}>
          <label className="field">
            <span>Stundensatz</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={orgForm.defaultHourlyRate}
              onChange={(e) => setOrgForm({ ...orgForm, defaultHourlyRate: e.target.value })}
              placeholder="z. B. 95"
            />
          </label>
          <label className="field">
            <span>Währung</span>
            <input
              value={orgForm.currency}
              onChange={(e) => setOrgForm({ ...orgForm, currency: e.target.value.toUpperCase() })}
              maxLength={8}
            />
          </label>
          <label className="field">
            <span>MwSt. %</span>
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={orgForm.defaultVatPercent}
              onChange={(e) => setOrgForm({ ...orgForm, defaultVatPercent: e.target.value })}
            />
          </label>
          <label className="field settings-span-all">
            <span>Hinweistext für Abrechnung</span>
            <textarea
              rows={2}
              value={orgForm.invoiceNote}
              onChange={(e) => setOrgForm({ ...orgForm, invoiceNote: e.target.value })}
              placeholder="z. B. Zahlung innerhalb 14 Tagen …"
            />
          </label>
          {orgMsg ? <p className="form-success settings-span-all">{orgMsg}</p> : null}
          <div className="settings-span-all">
            <button className="btn btn-primary" type="submit">
              Speichern
            </button>
          </div>
        </form>
      </section>

      <section className="panel settings-card">
        <header className="settings-card-head">
          <div>
            <p className="eyebrow">Katalog</p>
            <h3>Preispositionen</h3>
            <p className="muted">Stundensätze, Pauschalen und Stückpreise</p>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              if (showPriceForm && !editingPriceId) resetPriceForm();
              else {
                setEditingPriceId(null);
                setPriceForm(emptyPrice);
                setShowPriceForm(true);
              }
            }}
          >
            {showPriceForm && !editingPriceId ? "Abbrechen" : "+ Position"}
          </button>
        </header>

        {showPriceForm ? (
          <form className="settings-price-form form-grid" onSubmit={savePrice}>
            <label className="field">
              <span>Bezeichnung *</span>
              <input
                required
                value={priceForm.name}
                onChange={(e) => setPriceForm({ ...priceForm, name: e.target.value })}
                placeholder="z. B. Remote Support"
              />
            </label>
            <label className="field">
              <span>Art</span>
              <select
                value={priceForm.kind}
                onChange={(e) =>
                  setPriceForm({ ...priceForm, kind: e.target.value as PriceItemKind })
                }
              >
                {(Object.keys(kindLabel) as PriceItemKind[]).map((k) => (
                  <option key={k} value={k}>
                    {kindLabel[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Preis ({org?.currency ?? "EUR"})</span>
              <input
                type="number"
                required
                min={0}
                step={0.01}
                value={priceForm.unitPrice}
                onChange={(e) => setPriceForm({ ...priceForm, unitPrice: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Einheit</span>
              <input
                value={priceForm.unitLabel}
                onChange={(e) => setPriceForm({ ...priceForm, unitLabel: e.target.value })}
                placeholder="Stunde / Stück / Pauschale"
              />
            </label>
            <label className="field">
              <span>Artikel-Nr.</span>
              <input
                value={priceForm.sku}
                onChange={(e) => setPriceForm({ ...priceForm, sku: e.target.value })}
                placeholder="optional"
              />
            </label>
            <label className="field full">
              <span>Beschreibung</span>
              <textarea
                rows={2}
                value={priceForm.description}
                onChange={(e) => setPriceForm({ ...priceForm, description: e.target.value })}
              />
            </label>
            {priceError ? <p className="form-error full">{priceError}</p> : null}
            <div className="full form-actions">
              <button className="btn btn-primary" type="submit">
                {editingPriceId ? "Aktualisieren" : "Anlegen"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={resetPriceForm}>
                Abbrechen
              </button>
            </div>
          </form>
        ) : null}

        {prices.length === 0 ? (
          <div className="settings-empty">
            <strong>Noch keine Positionen</strong>
            <p className="muted">Lege z. B. „Remote Support“ oder „Vor-Ort-Einsatz“ an.</p>
          </div>
        ) : (
          <ul className="settings-price-list">
            {prices.map((item) => (
              <li key={item.id} className={`settings-price-row${!item.active ? " is-inactive" : ""}`}>
                <div className="settings-price-main">
                  <strong>{item.name}</strong>
                  <span className="muted">
                    {kindLabel[item.kind]} · {item.unitPrice.toLocaleString("de-DE")}{" "}
                    {org?.currency ?? "EUR"}
                    {item.unitLabel ? ` / ${item.unitLabel}` : ""}
                    {item.sku ? ` · ${item.sku}` : ""}
                    {!item.active ? " · inaktiv" : ""}
                  </span>
                  {item.description ? <span className="muted">{item.description}</span> : null}
                </div>
                <div className="settings-price-actions">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => startEditPrice(item)}
                  >
                    Bearbeiten
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() =>
                      void api
                        .updatePriceItem(item.id, {
                          active: !item.active,
                          name: item.name,
                          unitPrice: item.unitPrice,
                        })
                        .then(() => loadPricing())
                    }
                  >
                    {item.active ? "Deaktivieren" : "Aktivieren"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => {
                      if (!confirm("Preisposition löschen?")) return;
                      void api.deletePriceItem(item.id).then(() => loadPricing());
                    }}
                  >
                    Löschen
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel settings-card">
        <header className="settings-card-head">
          <div>
            <p className="eyebrow">Daten</p>
            <h3>Sicherung</h3>
          </div>
        </header>
        <p className="settings-card-lead muted">
          Vollbackup (Datenbank + Uploads) als ZIP. Beim Import werden bestehende Daten ersetzt und
          der Dienst startet neu.
        </p>
        {backupInfo ? (
          <div className="settings-backup-stats">
            <span>
              <strong>{(backupInfo.databaseBytes / (1024 * 1024)).toFixed(2)} MB</strong>
              <em>Datenbank</em>
            </span>
            <span>
              <strong>{backupInfo.uploadFiles}</strong>
              <em>Uploads</em>
            </span>
          </div>
        ) : null}
        <div className="settings-backup-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={backupBusy}
            onClick={() => void downloadBackup()}
          >
            {backupBusy ? "Bitte warten…" : "Backup herunterladen"}
          </button>
          <label className={`btn btn-ghost${backupBusy ? " is-busy" : ""}`}>
            Backup importieren…
            <input
              type="file"
              accept=".zip,application/zip"
              hidden
              disabled={backupBusy}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                e.target.value = "";
                void onRestoreFile(f);
              }}
            />
          </label>
        </div>
        {backupMsg ? (
          <p className={backupMsg.includes("fehl") ? "form-error" : "form-success"}>{backupMsg}</p>
        ) : null}
        <p className="settings-card-note muted">
          Tresor-Einträge liegen in der Datenbank – die Tresor-Passphrase musst du weiterhin kennen.
          Manuell: RESTORE.md in der ZIP bzw. docs/BACKUP.md.
        </p>
      </section>
    </div>
  );
}
