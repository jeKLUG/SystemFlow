import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../auth";
import { api } from "../api";
import { PasswordField, PasswordMatchHint } from "../components/PasswordField";
import { linuxAgentInstallScript, windowsAgentInstallScript } from "../lib/agentInstallScripts";
import type { AgentPackageInfo, AgentPackagePlatform, MonitoringSettings } from "../types";

/**
 * Konto: Passwort, Monitoring-Agent und Datensicherung.
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

  const [enrollKey, setEnrollKey] = useState("");
  const [enrollMsg, setEnrollMsg] = useState("");
  const [enrollBusy, setEnrollBusy] = useState(false);
  const [platforms, setPlatforms] = useState<MonitoringSettings["platforms"]>([]);
  const [packages, setPackages] = useState<AgentPackageInfo[]>([]);
  const [pkgVersion, setPkgVersion] = useState<Record<string, string>>({});
  const [pkgBusy, setPkgBusy] = useState<string | null>(null);
  const [copiedScript, setCopiedScript] = useState("");

  function applySettings(s: MonitoringSettings) {
    setEnrollKey(s.enrollmentKey);
    setPlatforms(s.platforms);
    setPackages(s.packages);
    setPkgVersion((prev) => {
      const next = { ...prev };
      for (const p of s.platforms) {
        if (!next[p.id]) {
          next[p.id] = s.packages.find((row) => row.platform === p.id)?.version ?? "";
        }
      }
      return next;
    });
  }

  useEffect(() => {
    void api
      .backupInfo()
      .then((info) => setBackupInfo(info))
      .catch(() => setBackupInfo(null));
    void api
      .monitoringSettings()
      .then(applySettings)
      .catch(() => setEnrollKey(""));
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

  const origin = window.location.origin.replace(/\/$/, "");
  const pkgByPlatform = useMemo(() => {
    const map = new Map<string, AgentPackageInfo>();
    for (const row of packages) map.set(row.platform, row);
    return map;
  }, [packages]);
  const windowsScript = enrollKey ? windowsAgentInstallScript(origin, enrollKey) : "";
  const linuxScript = enrollKey ? linuxAgentInstallScript(origin, enrollKey) : "";

  function copyText(label: string, text: string) {
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedScript(label);
      window.setTimeout(() => setCopiedScript(""), 1600);
    });
  }

  async function uploadPackage(platform: AgentPackagePlatform, file: File | null) {
    if (!file) return;
    const version = (pkgVersion[platform] ?? "").trim();
    if (!version) {
      setEnrollMsg("Bitte eine Version angeben (wie im Agenten, z. B. 1.0.3).");
      return;
    }
    setPkgBusy(platform);
    setEnrollMsg("");
    try {
      const row = await api.uploadAgentPackage(platform, version, file);
      setPackages((prev) => {
        const rest = prev.filter((p) => p.platform !== platform);
        return [...rest, row];
      });
      setEnrollMsg(`${row.filename} für ${platform} hochgeladen.`);
    } catch (err) {
      setEnrollMsg(err instanceof Error ? err.message : "Upload fehlgeschlagen");
    } finally {
      setPkgBusy(null);
    }
  }

  async function removePackage(platform: AgentPackagePlatform) {
    if (!window.confirm(`Paket für ${platform} löschen? Installierte Agenten bleiben, neue Installationen brauchen wieder ein Upload.`)) {
      return;
    }
    setPkgBusy(platform);
    setEnrollMsg("");
    try {
      await api.deleteAgentPackage(platform);
      setPackages((prev) => prev.filter((p) => p.platform !== platform));
      setEnrollMsg("Paket gelöscht.");
    } catch (err) {
      setEnrollMsg(err instanceof Error ? err.message : "Löschen fehlgeschlagen");
    } finally {
      setPkgBusy(null);
    }
  }

  return (
    <div className="page settings-page">
      <div className="page-header">
        <div>
          <h2>Einstellungen</h2>
          <p className="muted">Konto, Monitoring-Agent und Sicherung · {user?.username}</p>
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
            <p className="eyebrow">Monitoring</p>
            <h3>Agent einrichten</h3>
          </div>
        </header>
        <p className="settings-card-lead muted">
          Binary je Plattform hochladen, Skript kopieren, auf dem Kundenrechner als Administrator bzw.
          root ausführen. Der Dienst startet automatisch beim Hochfahren und nach einem Absturz. Agenten
          prüfen täglich auf eine neue Version; in Monitoring kannst du ein Gerät auch sofort
          aktualisieren lassen.
        </p>
        {enrollKey ? (
          <p className="settings-enroll-key">
            <code>{enrollKey}</code>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => copyText("key", enrollKey)}
            >
              {copiedScript === "key" ? "Kopiert" : "Key kopieren"}
            </button>
          </p>
        ) : (
          <p className="muted">Schlüssel wird geladen…</p>
        )}
        <div className="settings-backup-actions">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={enrollBusy}
            onClick={() => {
              if (
                !window.confirm(
                  "Neuen Enrollment-Key erzeugen? Bereits installierte Agenten bleiben gültig, neue Installationen brauchen den neuen Schlüssel.",
                )
              ) {
                return;
              }
              setEnrollBusy(true);
              setEnrollMsg("");
              void api
                .rotateMonitoringKey()
                .then((s) => {
                  applySettings(s);
                  setEnrollMsg("Neuer Schlüssel erzeugt.");
                })
                .catch((err) => {
                  setEnrollMsg(err instanceof Error ? err.message : "Fehler");
                })
                .finally(() => setEnrollBusy(false));
            }}
          >
            Schlüssel neu erzeugen
          </button>
        </div>

        <h4 className="settings-subhead">Agent-Pakete</h4>
        <p className="muted settings-card-note">
          Die Versionsnummer muss zur Binary passen (steht in der Agent-Anzeige). Ein neues Upload
          ersetzt die vorherige Datei dieser Plattform.
        </p>
        <ul className="settings-agent-packages">
          {(platforms.length
            ? platforms
            : [
                { id: "windows-amd64" as const, label: "Windows 64-bit", filename: "systemhaus-agent.exe" },
                { id: "linux-amd64" as const, label: "Linux 64-bit (x86_64)", filename: "systemhaus-agent" },
                { id: "linux-arm64" as const, label: "Linux ARM64 (aarch64)", filename: "systemhaus-agent" },
              ]
          ).map((p) => {
            const row = pkgByPlatform.get(p.id);
            return (
              <li key={p.id} className="settings-agent-pkg">
                <div>
                  <strong>{p.label}</strong>
                  {row ? (
                    <p className="muted">
                      v{row.version} · {row.filename} · {(row.sizeBytes / (1024 * 1024)).toFixed(1)} MB
                      <br />
                      SHA-256 {row.sha256.slice(0, 16)}…
                    </p>
                  ) : (
                    <p className="muted">Noch kein Paket · erwartet {p.filename}</p>
                  )}
                </div>
                <div className="settings-agent-pkg-actions">
                  <label className="field settings-agent-ver">
                    <span>Version</span>
                    <input
                      value={pkgVersion[p.id] ?? ""}
                      onChange={(e) => setPkgVersion((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      placeholder="1.0.3"
                      autoComplete="off"
                    />
                  </label>
                  <label className={`btn btn-ghost btn-sm${pkgBusy === p.id ? " is-busy" : ""}`}>
                    {pkgBusy === p.id ? "…" : row ? "Ersetzen" : "Hochladen"}
                    <input
                      type="file"
                      hidden
                      disabled={pkgBusy === p.id}
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        e.target.value = "";
                        void uploadPackage(p.id, f);
                      }}
                    />
                  </label>
                  {row ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={pkgBusy === p.id}
                      onClick={() => void removePackage(p.id)}
                    >
                      Löschen
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>

        <h4 className="settings-subhead">Installationsskripte</h4>
        <p className="muted settings-card-note">
          Enthalten Server-URL ({origin}) und den aktuellen Key. Wer das Skript hat, kann Geräte
          anmelden.
        </p>
        <div className="settings-agent-scripts">
          <ScriptCopy
            title="Windows (PowerShell)"
            hint="Als Administrator in PowerShell einfügen. Paket windows-amd64 muss hochgeladen sein."
            script={windowsScript}
            copied={copiedScript === "win"}
            onCopy={() => windowsScript && copyText("win", windowsScript)}
            ready={Boolean(enrollKey && pkgByPlatform.get("windows-amd64"))}
          />
          <ScriptCopy
            title="Linux (Bash)"
            hint="Als root: Architektur wird automatisch erkannt (amd64/arm64)."
            script={linuxScript}
            copied={copiedScript === "linux"}
            onCopy={() => linuxScript && copyText("linux", linuxScript)}
            ready={Boolean(
              enrollKey && (pkgByPlatform.get("linux-amd64") || pkgByPlatform.get("linux-arm64")),
            )}
          />
        </div>
        {enrollMsg ? (
          <p className={enrollMsg.includes("Fehler") || enrollMsg.toLowerCase().includes("fehl") ? "form-error" : "form-success"}>
            {enrollMsg}
          </p>
        ) : null}
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

/**
 * Kopierbares Installationsskript mit Syntax-Highlighting-freier Vorschau.
 */
function ScriptCopy({
  title,
  hint,
  script,
  copied,
  onCopy,
  ready,
}: {
  title: string;
  hint: string;
  script: string;
  copied: boolean;
  onCopy: () => void;
  ready: boolean;
}) {
  return (
    <div className="settings-agent-script">
      <div className="settings-agent-script-head">
        <strong>{title}</strong>
        <button type="button" className="btn btn-primary btn-sm" disabled={!script} onClick={onCopy}>
          {copied ? "Kopiert" : "Skript kopieren"}
        </button>
      </div>
      <p className="muted">{hint}</p>
      {!ready ? <p className="form-error">Zuerst das passende Paket hochladen.</p> : null}
      {script ? <pre className="settings-agent-pre">{script}</pre> : <p className="muted">Key wird geladen…</p>}
    </div>
  );
}
