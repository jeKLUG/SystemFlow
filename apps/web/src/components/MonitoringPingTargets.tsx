import { useEffect, useState } from "react";
import { agentVersionAtLeast } from "../lib/monitoringUi";
import type { MonitoringPingResult, MonitoringPingTarget } from "../types";

const MAX_PING_TARGETS = 8;
const PING_HOSTNAME_RE =
  /^(?=.{1,253}$)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

function validPingHost(raw: string): boolean {
  let host = raw.trim();
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  if (!host || host.length > 253) return false;
  if (/[\s;|&$<>`"'\\/%]/.test(host)) return false;
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host)) {
    return host.split(".").every((p) => {
      const n = Number(p);
      return n >= 0 && n <= 255;
    });
  }
  if (host.includes(":")) return /^[0-9a-fA-F:]+$/.test(host) && host !== "::";
  return PING_HOSTNAME_RE.test(host);
}

function normalizeHost(raw: string): string {
  let host = raw.trim();
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  return host;
}

/**
 * Ping-Ziele am Monitoring-Gerät: anlegen, entfernen, Status vom letzten Heartbeat.
 */
export function MonitoringPingTargets({
  targets,
  results,
  agentVersion,
  busy,
  onChange,
}: {
  targets: MonitoringPingTarget[];
  results?: MonitoringPingResult[];
  agentVersion?: string | null;
  busy?: boolean;
  onChange: (next: MonitoringPingTarget[]) => void;
}) {
  const [host, setHost] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const byId = new Map((results ?? []).map((r) => [r.id, r]));
  const agentReady = agentVersionAtLeast(agentVersion, "1.0.8");
  const atMax = targets.length >= MAX_PING_TARGETS;

  useEffect(() => {
    setError("");
  }, [targets]);

  function add() {
    const nextHost = normalizeHost(host);
    if (!validPingHost(nextHost)) {
      setError("IP-Adresse oder Hostname eingeben");
      return;
    }
    if (targets.some((t) => t.host.toLowerCase() === nextHost.toLowerCase())) {
      setError("Dieses Ziel ist schon eingerichtet");
      return;
    }
    if (atMax) {
      setError(`Höchstens ${MAX_PING_TARGETS} Pings`);
      return;
    }
    const nextLabel = label.trim().slice(0, 80);
    onChange([...targets, nextLabel ? { id: "", host: nextHost, label: nextLabel } : { id: "", host: nextHost }]);
    setHost("");
    setLabel("");
    setError("");
  }

  return (
    <div className="mon-pings">
      <div className="section-head row-between">
        <div>
          <h3>Pings</h3>
          <p className="muted">
            Der Agent prüft die Ziele im LAN beim nächsten Heartbeat
            {agentReady ? " (ca. 1 Minute)" : ""}.
          </p>
        </div>
      </div>
      {!agentReady ? (
        <p className="muted mon-pings-hint">Agent 1.0.8 nötig — bitte aktualisieren, sonst bleiben die Pings leer.</p>
      ) : null}
      {targets.length ? (
        <ul className="mon-ping-list">
          {targets.map((t) => {
            const result = t.id ? byId.get(t.id) : undefined;
            const status =
              result == null
                ? "wartet"
                : result.ok
                  ? result.ms != null
                    ? `erreichbar · ${result.ms} ms`
                    : "erreichbar"
                  : "keine Antwort";
            return (
              <li key={t.id || t.host} className={`mon-ping-row${result?.ok === false ? " is-warn" : ""}`}>
                <div className="mon-ping-copy">
                  <strong>{t.label || t.host}</strong>
                  {t.label ? <span className="muted">{t.host}</span> : null}
                </div>
                <span className={`mon-ping-status${result?.ok === false ? " is-warn" : result?.ok ? " is-ok" : ""}`}>
                  {status}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy}
                  onClick={() => onChange(targets.filter((x) => x !== t))}
                >
                  Entfernen
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted mon-pings-empty">Noch kein Ping. z. B. die IP eines NAS oder einer Firewall.</p>
      )}
      <form
        className="mon-ping-form"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          className="input"
          value={host}
          onChange={(e) => setHost(e.target.value)}
          placeholder="IP oder Hostname"
          autoComplete="off"
          disabled={busy || atMax}
          maxLength={253}
          aria-label="Ping-Ziel"
        />
        <input
          className="input"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Name (optional)"
          autoComplete="off"
          disabled={busy || atMax}
          maxLength={80}
          aria-label="Bezeichnung"
        />
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy || atMax || !host.trim()}>
          Hinzufügen
        </button>
      </form>
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
