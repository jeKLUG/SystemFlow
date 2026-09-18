import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../auth";
import { api } from "../api";
import { Checkbox } from "../components/Checkbox";
import { HelpHint } from "../components/HelpHint";
import { PasswordField, PasswordMatchHint } from "../components/PasswordField";
import {
  mailCustomerKinds,
  mailKindLabel,
  mailStaffKinds,
  type MailNotifyConfig,
  type MailSettings,
  type SmtpSecure,
} from "../types";

/**
 * Konto: Passwort und Datensicherung.
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

  useEffect(() => {
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

function emptyNotify(): MailNotifyConfig {
  return {
    staff: Object.fromEntries(mailStaffKinds.map((k) => [k, true])) as MailNotifyConfig["staff"],
    customer: Object.fromEntries(mailCustomerKinds.map((k) => [k, true])) as MailNotifyConfig["customer"],
    reminders: { hours24: true, hours1: true, morning: false },
  };
}

/**
 * SMTP und welche Ereignisse Mails auslösen.
 */
function MailSettingsCard() {
  const [form, setForm] = useState({
    smtpHost: "",
    smtpPort: "587",
    smtpSecure: "starttls" as SmtpSecure,
    smtpUser: "",
    smtpPassword: "",
    mailFromEmail: "",
    mailFromName: "",
    mailReplyTo: "",
    mailPublicUrl: "",
    mailStaffInbox: "",
  });
  const [notify, setNotify] = useState<MailNotifyConfig>(emptyNotify);
  const [passwordSet, setPasswordSet] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    void api
      .mailSettings()
      .then((s: MailSettings) => {
        setForm({
          smtpHost: s.smtpHost,
          smtpPort: String(s.smtpPort || 587),
          smtpSecure: s.smtpSecure,
          smtpUser: s.smtpUser,
          smtpPassword: "",
          mailFromEmail: s.mailFromEmail,
          mailFromName: s.mailFromName,
          mailReplyTo: s.mailReplyTo,
          mailPublicUrl: s.mailPublicUrl,
          mailStaffInbox: s.mailStaffInbox,
        });
        setNotify(s.notify);
        setPasswordSet(s.smtpPasswordSet);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Laden fehlgeschlagen"))
      .finally(() => setLoaded(true));
  }, []);

  function patch<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setMsg("");
    setBusy("save");
    try {
      const updated = await api.updateMailSettings({
        smtpHost: form.smtpHost,
        smtpPort: Number(form.smtpPort) || 587,
        smtpSecure: form.smtpSecure,
        smtpUser: form.smtpUser,
        smtpPassword: form.smtpPassword || undefined,
        mailFromEmail: form.mailFromEmail,
        mailFromName: form.mailFromName,
        mailReplyTo: form.mailReplyTo,
        mailPublicUrl: form.mailPublicUrl,
        mailStaffInbox: form.mailStaffInbox,
        notify,
      });
      setPasswordSet(updated.smtpPasswordSet);
      setForm((f) => ({ ...f, smtpPassword: "" }));
      setMsg("E-Mail-Einstellungen gespeichert.");
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Speichern fehlgeschlagen");
    } finally {
      setBusy("");
    }
  }

  async function test() {
    setErr("");
    setMsg("");
    setBusy("test");
    try {
      await api.testMailSettings();
      setMsg("Testmail gesendet.");
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Test fehlgeschlagen");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="panel settings-card">
      <header className="settings-card-head">
        <div>
          <p className="eyebrow">Benachrichtigungen</p>
          <div className="page-head-title">
            <h3>E-Mail</h3>
            <HelpHint text="SMTP in der Datenbank (Passwort verschlüsselt). Staff bekommt Mails an die Sammeladresse, Kunden an die Adresse am Portal-Zugang." />
          </div>
        </div>
      </header>
      {!loaded ? (
        <p className="muted">Lade…</p>
      ) : (
        <form className="mail-settings-form" onSubmit={(e) => void save(e)}>
          <label className="field">
            <span>SMTP-Host</span>
            <input value={form.smtpHost} onChange={(e) => patch("smtpHost", e.target.value)} autoComplete="off" />
          </label>
          <label className="field">
            <span>Port</span>
            <input
              type="number"
              min={1}
              max={65535}
              value={form.smtpPort}
              onChange={(e) => patch("smtpPort", e.target.value)}
            />
          </label>
          <label className="field">
            <span>Verschlüsselung</span>
            <select
              value={form.smtpSecure}
              onChange={(e) => patch("smtpSecure", e.target.value as SmtpSecure)}
            >
              <option value="starttls">STARTTLS (587)</option>
              <option value="ssl">SSL/TLS (465)</option>
              <option value="none">Unverschlüsselt</option>
            </select>
          </label>
          <label className="field">
            <span>SMTP-Benutzer</span>
            <input value={form.smtpUser} onChange={(e) => patch("smtpUser", e.target.value)} autoComplete="off" />
          </label>
          <PasswordField
            label={passwordSet ? "SMTP-Passwort (leer = unverändert)" : "SMTP-Passwort"}
            value={form.smtpPassword}
            onChange={(v) => patch("smtpPassword", v)}
            revealed={showPass}
            onToggleReveal={() => setShowPass((v) => !v)}
            autoComplete="new-password"
          />
          <label className="field">
            <span>Absender-Adresse</span>
            <input
              type="email"
              value={form.mailFromEmail}
              onChange={(e) => patch("mailFromEmail", e.target.value)}
            />
          </label>
          <label className="field">
            <span>Absendername</span>
            <input value={form.mailFromName} onChange={(e) => patch("mailFromName", e.target.value)} />
          </label>
          <label className="field">
            <span>Reply-To</span>
            <input
              type="email"
              value={form.mailReplyTo}
              onChange={(e) => patch("mailReplyTo", e.target.value)}
            />
          </label>
          <label className="field">
            <span>Staff-Sammeladresse</span>
            <input
              type="email"
              value={form.mailStaffInbox}
              onChange={(e) => patch("mailStaffInbox", e.target.value)}
            />
          </label>
          <label className="field mail-settings-span">
            <span>Öffentliche App-URL</span>
            <input
              placeholder="https://app.example.de"
              value={form.mailPublicUrl}
              onChange={(e) => patch("mailPublicUrl", e.target.value)}
            />
          </label>

          <h4 className="mail-settings-sub">Ereignisse</h4>
          <table className="mail-notify-table">
            <thead>
              <tr>
                <th>Typ</th>
                <th>Staff</th>
                <th>Kunden</th>
              </tr>
            </thead>
            <tbody>
              {mailStaffKinds.map((kind) => (
                <tr key={kind}>
                  <td>{mailKindLabel[kind]}</td>
                  <td>
                    <Checkbox
                      checked={notify.staff[kind]}
                      onChange={(checked) =>
                        setNotify((n) => ({ ...n, staff: { ...n.staff, [kind]: checked } }))
                      }
                      label="an"
                    />
                  </td>
                  <td>
                    {mailCustomerKinds.includes(kind as (typeof mailCustomerKinds)[number]) ? (
                      <Checkbox
                        checked={notify.customer[kind as (typeof mailCustomerKinds)[number]]}
                        onChange={(checked) =>
                          setNotify((n) => ({
                            ...n,
                            customer: { ...n.customer, [kind]: checked },
                          }))
                        }
                        label="an"
                      />
                    ) : (
                      <span className="muted">–</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h4 className="mail-settings-sub">Termin-Erinnerung</h4>
          <div className="mail-reminder-row">
            <Checkbox
              checked={notify.reminders.hours24}
              onChange={(checked) =>
                setNotify((n) => ({ ...n, reminders: { ...n.reminders, hours24: checked } }))
              }
              label="24 Stunden vorher"
            />
            <Checkbox
              checked={notify.reminders.hours1}
              onChange={(checked) =>
                setNotify((n) => ({ ...n, reminders: { ...n.reminders, hours1: checked } }))
              }
              label="1 Stunde vorher"
            />
            <Checkbox
              checked={notify.reminders.morning}
              onChange={(checked) =>
                setNotify((n) => ({ ...n, reminders: { ...n.reminders, morning: checked } }))
              }
              label="Am Termin-Tag 08:00"
            />
          </div>

          {err ? <p className="form-error">{err}</p> : null}
          {msg ? <p className="form-success">{msg}</p> : null}
          <div className="mail-settings-actions">
            <button className="btn btn-primary" type="submit" disabled={Boolean(busy)}>
              {busy === "save" ? "Speichert…" : "Speichern"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={Boolean(busy)}
              onClick={() => void test()}
            >
              {busy === "test" ? "Sendet…" : "Testmail senden"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
