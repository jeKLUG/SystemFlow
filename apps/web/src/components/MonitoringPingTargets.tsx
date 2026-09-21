import { useEffect, useState } from "react";
import { HelpHint } from "./HelpHint";
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

function pingStatus(result: MonitoringPingResult | undefined): {
  label: string;
  tone: "ok" | "warn" | "wait";
  ms?: string;
} {
  if (!result) return { label: "wartet", tone: "wait" };
  if (result.ok) {
    return {
      label: "erreichbar",
      tone: "ok",
      ms: result.ms != null ? `${result.ms} ms` : undefined,
    };
  }
  return { label: "keine Antwort", tone: "warn" };
}

/**
 * Ping-Ziele als Netz-Kacheln: Status wie Gateway/DNS, neues Ziel in derselben Reihe.
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
      setError(`Höchstens ${MAX_PING_TARGETS} Ziele`);
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
      <div className="mon-pings-head">
        <h5>
          Pings
          <HelpHint text="NAS, Drucker oder Firewall anpingen. Der Agent prüft die IPs jede Minute. Tickets unter Ticket-Typen." />
        </h5>
        {targets.length ? (
          <span className="muted mon-pings-count">
            {targets.length} / {MAX_PING_TARGETS}
          </span>
        ) : null}
        {!agentReady ? <span className="mon-ping-badge">Ergebnis nach Agent-Update</span> : null}
      </div>
      <div className="mon-hw-net-addrs">
        {targets.map((t) => {
          const result = t.id ? byId.get(t.id) : undefined;
          const status = pingStatus(result);
          const name = t.label || "Ping";
          return (
            <article
              key={t.id || t.host}
              className={`mon-hw-net-addr mon-ping-card${status.tone === "warn" ? " is-warn" : ""}`}
            >
              <span className="mon-hw-card-label">{name}</span>
              <strong className="mon-hw-net-ip" title={t.host}>
                {t.host}
              </strong>
              <ul className="mon-hw-net-chips">
                <li className={`is-${status.tone}`}>{status.label}</li>
                {status.ms ? <li>{status.ms}</li> : null}
              </ul>
              <button
                type="button"
                className="mon-ping-remove"
                disabled={busy}
                aria-label={`${name} ${t.host} entfernen`}
                onClick={() => onChange(targets.filter((x) => x !== t))}
              >
                <span aria-hidden>×</span>
              </button>
            </article>
          );
        })}
        {!atMax ? (
          <form
            className="mon-hw-net-addr mon-ping-add"
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <span className="mon-hw-card-label">Neues Ziel</span>
            <input
              className="mon-ping-host"
              value={host}
              onChange={(e) => {
                setHost(e.target.value);
                if (error) setError("");
              }}
              placeholder="192.168.1.10"
              autoComplete="off"
              disabled={busy}
              maxLength={253}
              aria-label="IP oder Hostname"
            />
            <div className="mon-ping-add-row">
              <input
                className="mon-ping-name"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Name, z. B. NAS"
                autoComplete="off"
                disabled={busy}
                maxLength={80}
                aria-label="Name (optional)"
              />
              <button type="submit" className="btn btn-ghost btn-sm" disabled={busy || !host.trim()}>
                Hinzufügen
              </button>
            </div>
            {error ? <p className="mon-ping-error">{error}</p> : null}
          </form>
        ) : null}
      </div>
    </div>
  );
}
