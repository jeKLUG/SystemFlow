import { useMemo, useState } from "react";
import { HelpHint } from "./HelpHint";
import type { MonitoringScriptJob, MonitoringScriptJobStatus, MonitoringScriptTemplate } from "../types";

const STATUS_LABEL: Record<MonitoringScriptJobStatus, string> = {
  pending: "Wartet auf Heartbeat",
  running: "Läuft",
  done: "Fertig",
  error: "Fehler",
  expired: "Abgelaufen",
};

/**
 * Remote-PowerShell am Gerät: Vorlage wählen, Skript senden, Ausgabe ansehen.
 */
export function MonitoringScriptPanel({
  jobs,
  templates,
  capable,
  windows,
  minAgent,
  busy,
  onRun,
  onSaveTemplate,
  onDeleteTemplate,
}: {
  jobs: MonitoringScriptJob[];
  templates: MonitoringScriptTemplate[];
  capable: boolean;
  windows: boolean;
  minAgent: string;
  busy?: boolean;
  onRun: (script: string, templateId?: string) => Promise<void> | void;
  onSaveTemplate: (name: string, body: string) => Promise<void> | void;
  onDeleteTemplate: (id: string) => Promise<void> | void;
}) {
  const [script, setScript] = useState(templates[0]?.body ?? "ipconfig /all");
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const latest = jobs[0];
  const open = latest && (latest.status === "pending" || latest.status === "running");

  const selected = useMemo(
    () => templates.find((t) => t.id === templateId) ?? null,
    [templates, templateId],
  );

  async function run() {
    const text = script.trim();
    if (!text) {
      setError("Skript eingeben");
      return;
    }
    if (
      !window.confirm(
        "Skript jetzt an den Agent senden?\n\nEs läuft beim nächsten Heartbeat (ca. 1 Minute) als LocalSystem mit vollen Administratorrechten. Die Ausgabe sehen alle Admins.",
      )
    ) {
      return;
    }
    setError("");
    setMsg("Auftrag gesendet. Der Agent holt ihn beim nächsten Heartbeat.");
    try {
      await onRun(text, selected && selected.body === text ? selected.id : undefined);
    } catch (err) {
      setMsg("");
      setError(err instanceof Error ? err.message : "Senden fehlgeschlagen");
    }
  }

  async function saveTemplate() {
    const name = saveName.trim();
    const body = script.trim();
    if (!name || !body) {
      setError("Name und Skript für die Vorlage eingeben");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSaveTemplate(name, body);
      setSaveName("");
      setMsg("Vorlage gespeichert");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vorlage konnte nicht gespeichert werden");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mon-block mon-script-block">
      <div className="mon-script-head">
        <h3>
          PowerShell
          <HelpHint text="Skript an den Windows-Agent senden. Ausführung als LocalSystem (volle Adminrechte) beim nächsten Heartbeat. Ausgabe erscheint danach hier." />
        </h3>
      </div>
      {!windows ? (
        <p className="muted">Remote-Skripte gibt es nur auf Windows-Geräten.</p>
      ) : !capable ? (
        <p className="muted">
          Agent {minAgent} oder neuer nötig. Paket unter Monitoring → Agent einrichten hochladen und den Client
          aktualisieren.
        </p>
      ) : (
        <>
          <div className="mon-script-toolbar">
            <label className="mon-script-select">
              <span className="muted">Vorlage</span>
              <select
                value={templateId}
                disabled={busy || Boolean(open)}
                onChange={(e) => {
                  const id = e.target.value;
                  setTemplateId(id);
                  const tpl = templates.find((t) => t.id === id);
                  if (tpl) setScript(tpl.body);
                }}
              >
                <option value="">Freies Skript</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            {selected ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy || saving}
                onClick={() => {
                  if (!window.confirm(`Vorlage „${selected.name}“ löschen?`)) return;
                  void onDeleteTemplate(selected.id);
                  setTemplateId("");
                }}
              >
                Vorlage löschen
              </button>
            ) : null}
          </div>
          <textarea
            className="mon-script-editor"
            rows={8}
            spellCheck={false}
            disabled={busy || Boolean(open)}
            value={script}
            onChange={(e) => setScript(e.target.value)}
            placeholder="ipconfig /all"
          />
          <div className="mon-script-actions">
            <button type="button" className="btn btn-sm" disabled={busy || Boolean(open)} onClick={() => void run()}>
              {busy ? "…" : open ? STATUS_LABEL[latest.status] : "Ausführen"}
            </button>
            <input
              className="mon-script-name"
              placeholder="Als Vorlage speichern…"
              value={saveName}
              disabled={busy || saving}
              onChange={(e) => setSaveName(e.target.value)}
              maxLength={80}
            />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy || saving || !saveName.trim() || !script.trim()}
              onClick={() => void saveTemplate()}
            >
              Speichern
            </button>
          </div>
          {msg ? <p className="form-success">{msg}</p> : null}
          {error ? <p className="form-error">{error}</p> : null}
        </>
      )}
      {jobs.length ? (
        <ul className="mon-script-jobs">
          {jobs.slice(0, 8).map((job) => (
            <li key={job.id} className={`mon-script-job is-${job.status}`}>
              <div className="mon-script-job-head">
                <strong>{STATUS_LABEL[job.status]}</strong>
                <span className="muted">
                  {job.createdByUsername || "Admin"} · {formatJobTime(job.finishedAt || job.startedAt || job.createdAt)}
                  {job.exitCode != null ? ` · Exit ${job.exitCode}` : ""}
                </span>
              </div>
              {job.errorMessage ? <p className="form-error">{job.errorMessage}</p> : null}
              {job.stdout || job.stderr ? (
                <pre className="mon-script-out">
                  {[job.stdout, job.stderr ? `STDERR:\n${job.stderr}` : ""]
                    .filter(Boolean)
                    .join("\n\n")
                    .trim() || "Keine Ausgabe"}
                </pre>
              ) : job.status === "pending" || job.status === "running" ? (
                <p className="muted">Noch keine Ausgabe. Nächster Heartbeat in etwa einer Minute.</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function formatJobTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("de-DE");
}
