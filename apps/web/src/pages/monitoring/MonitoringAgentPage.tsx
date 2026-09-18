import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { HelpHint } from "../../components/HelpHint";
import { copyToClipboard } from "../../lib/clipboard";
import { linuxAgentInstallScript, windowsAgentInstallScript } from "../../lib/agentInstallScripts";
import type { AgentPackageInfo, AgentPackagePlatform, MonitoringSettings } from "../../types";

const FALLBACK_PLATFORMS: MonitoringSettings["platforms"] = [
  { id: "windows-amd64", label: "Windows 64-bit", filename: "systemhaus-agent.exe" },
  { id: "linux-amd64", label: "Linux 64-bit", filename: "systemhaus-agent" },
  { id: "linux-arm64", label: "Linux ARM64", filename: "systemhaus-agent" },
];

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Liest eine Semver wie 1.0.5 aus dem Dateinamen (GitHub-Artefakt). */
function versionFromFilename(name: string): string | null {
  const match = name.match(/(?:^|[^0-9])(\d+\.\d+\.\d+)(?:[^0-9]|$)/);
  return match?.[1] ?? null;
}

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
  const [copyError, setCopyError] = useState("");
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  function applySettings(s: MonitoringSettings) {
    setEnrollKey(s.enrollmentKey);
    setPlatforms(s.platforms);
    setPackages(s.packages);
    setPkgVersion((prev) => {
      const next = { ...prev };
      for (const p of s.platforms) {
        if (!next[p.id]) {
          next[p.id] = s.packages.find((row) => row.platform === p.id)?.version ?? "1.0.5";
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
  const list = platforms.length ? platforms : FALLBACK_PLATFORMS;

  async function copyText(label: string, text: string) {
    if (!text) return;
    setCopyError("");
    const ok = await copyToClipboard(text);
    if (!ok) {
      setCopiedScript("");
      setCopyError("Kopieren nicht möglich. Text markieren und Strg+C.");
      return;
    }
    setCopiedScript(label);
    window.setTimeout(() => setCopiedScript(""), 1800);
  }

  async function uploadPackage(platform: AgentPackagePlatform, file: File | null) {
    if (!file) return;
    const version =
      versionFromFilename(file.name) || (pkgVersion[platform] ?? "").trim() || "1.0.5";
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
      setPkgMsg((prev) => ({ ...prev, [platform]: "Paket gelöscht." }));
    } catch (err) {
      setPkgMsg((prev) => ({
        ...prev,
        [platform]: err instanceof Error ? err.message : "Löschen fehlgeschlagen",
      }));
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
          <p className="muted">Paket hochladen, Skript kopieren, auf dem Gerät als Admin bzw. root ausführen.</p>
        </div>
        <Link className="btn btn-ghost" to="/monitoring">
          Zurück zur Flotte
        </Link>
      </header>

      <section className="panel settings-card">
        <header className="settings-card-head">
          <div>
            <p className="eyebrow">Zugang</p>
            <div className="page-head-title">
              <h3>Enrollment-Key</h3>
              <HelpHint text="Steckt in den Install-Skripten. Bereits laufende Agenten bleiben gültig, wenn du den Key neu erzeugst." />
            </div>
          </div>
        </header>
        {enrollKey ? (
          <div className="agent-enroll">
            <div className={`agent-enroll-secret${copiedScript === "key" ? " is-copied" : ""}`}>
              <code>{enrollKey}</code>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => void copyText("key", enrollKey)}
              >
                {copiedScript === "key" ? "Kopiert" : "Kopieren"}
              </button>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
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
                    setEnrollMsg("Neuer Schlüssel erzeugt. Skripte neu kopieren.");
                  })
                  .catch((err) => {
                    setEnrollMsg(err instanceof Error ? err.message : "Fehler");
                  })
                  .finally(() => setEnrollBusy(false));
              }}
            >
              {enrollBusy ? "Erzeugt…" : "Schlüssel neu erzeugen"}
            </button>
          </div>
        ) : (
          <p className="muted">Schlüssel wird geladen…</p>
        )}
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
        {copyError ? <p className="form-error">{copyError}</p> : null}
      </section>

      <section className="panel settings-card">
        <header className="settings-card-head">
          <div>
            <p className="eyebrow">Schritt 1</p>
            <div className="page-head-title">
              <h3>Paket hochladen</h3>
              <HelpHint text="GitHub-Artefakt mit Versionsnummer im Dateinamen hochladen (z. B. systemhaus-agent-windows-amd64-1.0.5.exe). Die Geräte-Version kommt aus der Binary, nicht aus diesem Feld." />
            </div>
          </div>
        </header>
        <ul className="agent-pkg-grid">
          {list.map((p) => {
            const row = pkgByPlatform.get(p.id);
            const busy = pkgBusy === p.id;
            return (
              <li key={p.id} className={`agent-pkg-card${row ? " is-ready" : ""}`}>
                <div className="agent-pkg-card-head">
                  <strong>{p.label}</strong>
                  <span className={`badge${row ? " badge-active" : " badge-inactive"}`}>
                    {row ? "Bereit" : "Fehlt"}
                  </span>
                </div>
                {row ? (
                  <p className="muted agent-pkg-meta">
                    {row.filename}
                    <br />
                    v{row.version} · {formatMb(row.sizeBytes)}
                  </p>
                ) : (
                  <p className="muted agent-pkg-meta">Erwartet {p.filename}</p>
                )}
                <label className="field settings-agent-ver">
                  <span>Version</span>
                  <input
                    value={pkgVersion[p.id] ?? "1.0.5"}
                    onChange={(e) => setPkgVersion((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    placeholder="1.0.5"
                    autoComplete="off"
                  />
                </label>
                <div className="agent-pkg-actions">
                  <button
                    type="button"
                    className={row ? "btn btn-ghost btn-sm" : "btn btn-primary btn-sm"}
                    disabled={busy}
                    onClick={() => fileInputs.current[p.id]?.click()}
                  >
                    {busy ? "Lädt…" : row ? "Ersetzen" : "Datei wählen"}
                  </button>
                  <input
                    ref={(el) => {
                      fileInputs.current[p.id] = el;
                    }}
                    type="file"
                    className="sr-only"
                    accept={p.id.startsWith("windows") ? ".exe,application/octet-stream" : undefined}
                    disabled={busy}
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
                      disabled={busy}
                      onClick={() => void removePackage(p.id)}
                    >
                      Löschen
                    </button>
                  ) : null}
                </div>
                {pkgMsg[p.id] ? (
                  <p
                    className={
                      pkgMsg[p.id].toLowerCase().includes("hochgeladen") &&
                      !pkgMsg[p.id].toLowerCase().includes("fehl")
                        ? "form-success"
                        : pkgMsg[p.id].toLowerCase().includes("gelöscht")
                          ? "form-success"
                          : "form-error"
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
            <p className="eyebrow">Schritt 2</p>
            <div className="page-head-title">
              <h3>Skript auf dem Gerät ausführen</h3>
              <HelpHint
                text={`Kopieren und als Administrator (Windows) bzw. root (Linux) einfügen. Enthält Server ${origin} und den aktuellen Key.`}
              />
            </div>
          </div>
        </header>
        <div className="agent-script-grid">
          <ScriptCopy
            title="Windows"
            hint="PowerShell als Administrator öffnen, Skript einfügen, Enter."
            missingHint="Zuerst das Windows-Paket hochladen."
            script={windowsScript}
            copied={copiedScript === "win"}
            ready={Boolean(enrollKey && pkgByPlatform.get("windows-amd64"))}
            onCopy={() => void copyText("win", windowsScript)}
          />
          <ScriptCopy
            title="Linux"
            hint="Als root: sudo bash, Skript einfügen. Erkennt amd64 und ARM64 selbst."
            missingHint="Zuerst ein Linux-Paket (64-bit oder ARM64) hochladen."
            script={linuxScript}
            copied={copiedScript === "linux"}
            ready={Boolean(
              enrollKey && (pkgByPlatform.get("linux-amd64") || pkgByPlatform.get("linux-arm64")),
            )}
            onCopy={() => void copyText("linux", linuxScript)}
          />
        </div>
      </section>
    </div>
  );
}

/**
 * Install-Skript mit Kopieren und einklappbarer Vorschau.
 */
function ScriptCopy({
  title,
  hint,
  missingHint,
  script,
  copied,
  onCopy,
  ready,
}: {
  title: string;
  hint: string;
  missingHint: string;
  script: string;
  copied: boolean;
  onCopy: () => void;
  ready: boolean;
}) {
  return (
    <div className={`agent-script-card${ready ? " is-ready" : ""}`}>
      <div className="agent-script-card-head">
        <strong>{title}</strong>
        <span className={`badge${ready ? " badge-active" : " badge-inactive"}`}>
          {ready ? "Bereit" : "Paket fehlt"}
        </span>
      </div>
      <p className="muted">{hint}</p>
      <button
        type="button"
        className="btn btn-primary"
        disabled={!script}
        onClick={onCopy}
      >
        {copied ? "Kopiert" : "Skript kopieren"}
      </button>
      {!ready ? <p className="form-error">{missingHint}</p> : null}
      {script ? (
        <details className="agent-script-details">
          <summary>Skript anzeigen</summary>
          <pre className="settings-agent-pre">{script}</pre>
        </details>
      ) : (
        <p className="muted">Key wird geladen…</p>
      )}
    </div>
  );
}
