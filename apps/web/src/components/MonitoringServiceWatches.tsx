import { useEffect, useState } from "react";
import { HelpHint } from "./HelpHint";
import { agentVersionAtLeast } from "../lib/monitoringUi";
import type { MonitoringServiceWatch, MonitoringWatchResult } from "../types";

const MAX_SERVICE_WATCHES = 8;
const SERVICE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._@$-]{0,127}$/;

function validServiceName(raw: string): boolean {
  const name = raw.trim();
  if (!name || name.length > 128) return false;
  if (/[\s;|&<>`"'\\/%]/.test(name)) return false;
  return SERVICE_NAME_RE.test(name);
}

function watchStatus(result: MonitoringWatchResult | undefined): {
  label: string;
  tone: "ok" | "warn" | "wait";
} {
  if (!result) return { label: "wartet", tone: "wait" };
  if (result.ok) return { label: "läuft", tone: "ok" };
  if (result.state === "missing") return { label: "fehlt", tone: "warn" };
  return { label: result.state || "gestoppt", tone: "warn" };
}

/**
 * Dienst-Wächter als Kacheln: Status je Dienst, neues Ziel in derselben Reihe.
 */
export function MonitoringServiceWatches({
  targets,
  results,
  agentVersion,
  busy,
  onChange,
}: {
  targets: MonitoringServiceWatch[];
  results?: MonitoringWatchResult[];
  agentVersion?: string | null;
  busy?: boolean;
  onChange: (next: MonitoringServiceWatch[]) => void;
}) {
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const byId = new Map((results ?? []).map((r) => [r.id, r]));
  const agentReady = agentVersionAtLeast(agentVersion, "1.0.10");
  const atMax = targets.length >= MAX_SERVICE_WATCHES;

  useEffect(() => {
    setError("");
  }, [targets]);

  function add() {
    const nextName = name.trim();
    if (!validServiceName(nextName)) {
      setError("Dienstname eingeben, z. B. Spooler oder sshd");
      return;
    }
    if (targets.some((t) => t.name.toLowerCase() === nextName.toLowerCase())) {
      setError("Dieser Dienst ist schon eingerichtet");
      return;
    }
    if (atMax) {
      setError(`Höchstens ${MAX_SERVICE_WATCHES} Dienste`);
      return;
    }
    const nextLabel = label.trim().slice(0, 80);
    onChange([...targets, nextLabel ? { id: "", name: nextName, label: nextLabel } : { id: "", name: nextName }]);
    setName("");
    setLabel("");
    setError("");
  }

  return (
    <div className="mon-pings mon-svcs">
      <div className="mon-pings-head">
        <h5>
          Dienst-Wächter
          <HelpHint text="Dienste, die laufen müssen (Windows-Kurzname oder systemd-Unit). Der Agent prüft sie jede Minute. Tickets unter Ticket-Typen." />
        </h5>
        {targets.length ? (
          <span className="muted mon-pings-count">
            {targets.length} / {MAX_SERVICE_WATCHES}
          </span>
        ) : null}
        {!agentReady ? <span className="mon-ping-badge">Ergebnis nach Agent-Update</span> : null}
      </div>
      <div className="mon-hw-net-addrs">
        {targets.map((t) => {
          const result = t.id ? byId.get(t.id) : undefined;
          const status = watchStatus(result);
          const title = t.label || t.name;
          return (
            <article
              key={t.id || t.name}
              className={`mon-hw-net-addr mon-ping-card${status.tone === "warn" ? " is-warn" : ""}`}
            >
              <span className="mon-hw-card-label">{title}</span>
              <strong className="mon-hw-net-ip" title={t.name}>
                {t.name}
              </strong>
              <ul className="mon-hw-net-chips">
                <li className={`is-${status.tone}`}>{status.label}</li>
                {result?.display && result.display !== t.name && result.display !== t.label ? (
                  <li>{result.display}</li>
                ) : null}
              </ul>
              <button
                type="button"
                className="mon-ping-remove"
                disabled={busy}
                aria-label={`${title} entfernen`}
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
            <span className="mon-hw-card-label">Neuer Dienst</span>
            <input
              className="mon-ping-host"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError("");
              }}
              placeholder="Spooler"
              autoComplete="off"
              disabled={busy}
              maxLength={128}
              aria-label="Dienstname"
            />
            <div className="mon-ping-add-row">
              <input
                className="mon-ping-name"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Name, z. B. Druckspooler"
                autoComplete="off"
                disabled={busy}
                maxLength={80}
                aria-label="Name (optional)"
              />
              <button type="submit" className="btn btn-ghost btn-sm" disabled={busy || !name.trim()}>
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
