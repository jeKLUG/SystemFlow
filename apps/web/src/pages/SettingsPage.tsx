import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../auth";
import { api } from "../api";
import { MailSettingsCard } from "../components/MailSettingsCard";
import { PasswordField, PasswordMatchHint } from "../components/PasswordField";
import type { OrgSettings } from "../types";

const emptyOrgAddress = {
  orgName: "",
  orgTagline: "",
  orgAddress: "",
  orgZip: "",
  orgCity: "",
  orgCountry: "DE",
  orgEmail: "",
  orgPhone: "",
};

function orgAddressFromSettings(s: OrgSettings) {
  return {
    orgName: s.orgName ?? "",
    orgTagline: s.orgTagline ?? "",
    orgAddress: s.orgAddress ?? "",
    orgZip: s.orgZip ?? "",
    orgCity: s.orgCity ?? "",
    orgCountry: s.orgCountry ?? "DE",
    orgEmail: s.orgEmail ?? "",
    orgPhone: s.orgPhone ?? "",
  };
}

/**
 * Konto: Anschrift, Passwort, E-Mail und Datensicherung.
 */
export function SettingsPage() {
  const { user, changePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMsg, setBackupMsg] = useState("");
  const [backupInfo, setBackupInfo] = useState<{
    databaseBytes: number;
    uploadFiles: number;
    hint: string;
  } | null>(null);

  const [orgForm, setOrgForm] = useState(emptyOrgAddress);
  const [orgBusy, setOrgBusy] = useState(false);
  const [orgMsg, setOrgMsg] = useState("");
  const [orgErr, setOrgErr] = useState("");

  useEffect(() => {
    void api
      .backupInfo()
      .then((info) => setBackupInfo(info))
      .catch(() => setBackupInfo(null));
    void api
      .orgSettings()
      .then((s) => setOrgForm(orgAddressFromSettings(s)))
      .catch(() => undefined);
  }, []);

  async function saveOrgAddress(e: FormEvent) {
    e.preventDefault();
    setOrgMsg("");
    setOrgErr("");
    setOrgBusy(true);
    try {
      const updated = await api.updateOrgSettings({
        orgName: orgForm.orgName,
        orgTagline: orgForm.orgTagline,
        orgAddress: orgForm.orgAddress,
        orgZip: orgForm.orgZip,
        orgCity: orgForm.orgCity,
        orgCountry: orgForm.orgCountry,
        orgEmail: orgForm.orgEmail,
        orgPhone: orgForm.orgPhone,
      });
      setOrgForm(orgAddressFromSettings(updated));
      setOrgMsg("Anschrift gespeichert");
    } catch (err) {
      setOrgErr(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    } finally {
      setOrgBusy(false);
    }
  }

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
        result.message || "Sicherung eingespielt. Bitte die Seite in wenigen Sekunden neu laden.",
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
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }

    setBusy(true);
    try {
      await changePassword(currentPassword, newPassword);
      setSuccess("Passwort gespeichert");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setShowCurrent(false);
      setShowNew(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ändern fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page settings-page">
      <div className="page-header">
        <div>
          <h2>Einstellungen</h2>
          <p className="muted">Konto, E-Mail und Sicherung · {user?.username}</p>
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
          Nach dem Ändern bleibst du angemeldet. Neues Passwort zur Kontrolle zweimal eingeben.
        </p>
        <form className="settings-password-form" onSubmit={onSubmit}>
          <PasswordField
            label="Aktuelles Passwort"
            value={currentPassword}
            onChange={setCurrentPassword}
            revealed={showCurrent}
            onToggleReveal={() => setShowCurrent((v) => !v)}
            autoComplete="current-password"
            required
          />
          <PasswordField
            label="Neues Passwort"
            value={newPassword}
            onChange={setNewPassword}
            revealed={showNew}
            onToggleReveal={() => setShowNew((v) => !v)}
            autoComplete="new-password"
            required
            minLength={8}
          />
          <PasswordField
            label="Neues Passwort wiederholen"
            value={confirmPassword}
            onChange={setConfirmPassword}
            revealed={showNew}
            onToggleReveal={() => setShowNew((v) => !v)}
            autoComplete="new-password"
            required
            minLength={8}
          />
          <PasswordMatchHint value={newPassword} confirm={confirmPassword} />
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
            <p className="eyebrow">Firma</p>
            <h3>Anschrift</h3>
          </div>
        </header>
        <p className="settings-card-lead muted">
          Erscheint als Auftragnehmer auf Verträgen und im PDF-Export.
        </p>
        <form className="settings-address-form" onSubmit={(e) => void saveOrgAddress(e)}>
          <label className="field">
            <span>Name</span>
            <input
              value={orgForm.orgName}
              onChange={(e) => setOrgForm({ ...orgForm, orgName: e.target.value })}
              placeholder="Systemhaus-Ess"
              maxLength={200}
            />
          </label>
          <label className="field">
            <span>Zusatz</span>
            <input
              value={orgForm.orgTagline}
              onChange={(e) => setOrgForm({ ...orgForm, orgTagline: e.target.value })}
              placeholder="IT-Dienstleistungen & Support"
              maxLength={200}
            />
          </label>
          <label className="field settings-span-all">
            <span>Straße</span>
            <input
              value={orgForm.orgAddress}
              onChange={(e) => setOrgForm({ ...orgForm, orgAddress: e.target.value })}
              maxLength={300}
            />
          </label>
          <label className="field">
            <span>PLZ</span>
            <input
              value={orgForm.orgZip}
              onChange={(e) => setOrgForm({ ...orgForm, orgZip: e.target.value })}
              maxLength={20}
            />
          </label>
          <label className="field">
            <span>Ort</span>
            <input
              value={orgForm.orgCity}
              onChange={(e) => setOrgForm({ ...orgForm, orgCity: e.target.value })}
              maxLength={120}
            />
          </label>
          <label className="field">
            <span>Land</span>
            <input
              value={orgForm.orgCountry}
              onChange={(e) => setOrgForm({ ...orgForm, orgCountry: e.target.value })}
              placeholder="DE"
              maxLength={80}
            />
          </label>
          <label className="field">
            <span>E-Mail</span>
            <input
              type="email"
              value={orgForm.orgEmail}
              onChange={(e) => setOrgForm({ ...orgForm, orgEmail: e.target.value })}
              maxLength={200}
            />
          </label>
          <label className="field">
            <span>Telefon</span>
            <input
              value={orgForm.orgPhone}
              onChange={(e) => setOrgForm({ ...orgForm, orgPhone: e.target.value })}
              maxLength={80}
            />
          </label>
          {orgErr ? <p className="form-error settings-span-all">{orgErr}</p> : null}
          {orgMsg ? <p className="form-success settings-span-all">{orgMsg}</p> : null}
          <div className="settings-span-all">
            <button className="btn btn-primary" type="submit" disabled={orgBusy}>
              {orgBusy ? "Speichert…" : "Anschrift speichern"}
            </button>
          </div>
        </form>
      </section>

      <MailSettingsCard />

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

