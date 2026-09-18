import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { linuxAgentInstallScript, windowsAgentInstallScript } from "../../lib/agentInstallScripts";
import type { AgentPackageInfo, AgentPackagePlatform, MonitoringSettings } from "../../types";

/**
 * Enrollment-Key, Agent-Pakete und kopierbare Install-Skripte.
 */
export function MonitoringAgentPage() {
  const [enrollKey, setEnrollKey] = useState("");
  const [enrollMsg, setEnrollMsg] = useState("");
  const [enrollBusy, setEnrollBusy] = useState(false);
  const [platforms, setPlatforms] = useState<MonitoringSettings["platforms"]>([]);
  const [packages, setPackages] = useState<AgentPackageInfo[]>([]);
  const [pkgVersion, setPkgVersion] = useState<Record<string, string>>({});
  const [pkgBusy, setPkgBusy] = useState<string | null>(null);
  const [pkgMsg, setPkgMsg] = useState<Record<string, string>>({});
  const [copiedScript, setCopiedScript] = useState("");
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  function applySettings(s: MonitoringSettings) {
    setEnrollKey(s.enrollmentKey);
    setPlatforms(s.platforms);
    setPackages(s.packages);
    setPkgVersion((prev) => {
      const next = { ...prev };
      for (const p of s.platforms) {
        if (!next[p.id]) {
          next[p.id] = s.packages.find((row) => row.platform === p.id)?.version ?? "1.0.3";
        }
      }
      return next;
    });
  }

  useEffect(() => {
    void api
      .monitoringSettings()
      .then(applySettings)
      .catch(() => setEnrollKey(""));
  }, []);

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
    const version = (pkgVersion[platform] ?? "").trim() || "1.0.3";
    setPkgVersion((prev) => ({ ...prev, [platform]: version }));
    setPkgBusy(platform);
    setPkgMsg((prev) => ({ ...prev, [platform]: "" }));
    setEnrollMsg("");
    try {
      const row = await api.uploadAgentPackage(platform, version, file);
      setPackages((prev) => {
        const rest = prev.filter((p) => p.platform !== platform);
        return [...rest, row];
      });
      setPkgMsg((prev) => ({ ...prev, [platform]: `${row.filename} hochgeladen.` }));
    } catch (err) {
      setPkgMsg((prev) => ({
        ...prev,
        [platform]: err instanceof Error ? err.message : "Upload fehlgeschlagen",
      }));
    } finally {
      setPkgBusy(null);
    }
  }

  async function removePackage(platform: AgentPackagePlatform) {
    if (
      !window.confirm(
        `Paket für ${platform} löschen? Installierte Agenten bleiben, neue Installationen brauchen wieder ein Upload.`,
      )
    ) {
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
      <header className="dashboard-hero">
        <div>
          <p className="eyebrow">Monitoring</p>
          <h2>Agent einrichten</h2>
          <p className="muted">
            Binary hochladen, Skript kopieren, auf dem Kundenrechner als Administrator bzw. root
            ausführen. Der Dienst startet beim Hochfahren und nach einem Absturz neu. Agenten prüfen
            täglich auf eine neue Version.
          </p>
        </div>
        <Link className="btn btn-ghost" to="/monitoring">
          Zurück zur Flotte
        </Link>
      </header>

      <section className="panel settings-card">
        <header className="settings-card-head">
          <div>
            <p className="eyebrow">Zugang</p>
            <h3>Enrollment-Key</h3>
          </div>
        </header>
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
        {enrollMsg ? (
          <p
            className={
              enrollMsg.includes("Fehler") || enrollMsg.toLowerCase().includes("fehl")
                ? "form-error"
                : "form-success"
            }
          >
            {enrollMsg}
          </p>
        ) : null}
      </section>

      <section className="panel settings-card">
        <header className="settings-card-head">
          <div>
            <p className="eyebrow">Dateien</p>
            <h3>Agent-Pakete</h3>
          </div>
        </header>
        <p className="settings-card-lead muted">
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
                      value={pkgVersion[p.id] ?? "1.0.3"}
                      onChange={(e) => setPkgVersion((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      placeholder="1.0.3"
                      autoComplete="off"
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={pkgBusy === p.id}
                    onClick={() => fileInputs.current[p.id]?.click()}
                  >
                    {pkgBusy === p.id ? "Lädt…" : row ? "Ersetzen" : "Hochladen"}
                  </button>
                  <input
                    ref={(el) => {
                      fileInputs.current[p.id] = el;
                    }}
                    type="file"
                    className="sr-only"
                    accept={p.id.startsWith("windows") ? ".exe,application/octet-stream" : undefined}
                    disabled={pkgBusy === p.id}
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      e.target.value = "";
                      void uploadPackage(p.id, f);
                    }}
                  />
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
                {pkgMsg[p.id] ? (
                  <p
                    className={
                      pkgMsg[p.id].toLowerCase().includes("hochgeladen") ? "form-success" : "form-error"
                    }
                  >
                    {pkgMsg[p.id]}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="panel settings-card">
        <header className="settings-card-head">
          <div>
            <p className="eyebrow">Installation</p>
            <h3>Skripte</h3>
          </div>
        </header>
        <p className="settings-card-lead muted">
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
