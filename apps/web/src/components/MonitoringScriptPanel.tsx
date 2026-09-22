import { useEffect, useMemo, useRef, useState } from "react";
import { HelpHint } from "./HelpHint";
import { relSeen } from "../lib/monitoringUi";
import type { MonitoringScriptJob, MonitoringScriptJobStatus, MonitoringScriptTemplate } from "../types";

const STATUS_LABEL: Record<MonitoringScriptJobStatus, string> = {
  pending: "Wartet",
  running: "Läuft",
  done: "Fertig",
  error: "Fehler",
  expired: "Abgelaufen",
};

/**
 * Remote-PowerShell: kompakte Vorlagenwahl, Ausführen, Ausgabe darunter.
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
  const [error, setError] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const [openHistory, setOpenHistory] = useState<string | null>(null);
  const latest = jobs[0];
  const waiting = latest && (latest.status === "pending" || latest.status === "running");
  const older = jobs.slice(1);
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
    setSaveOpen(false);
    try {
      await onRun(text, selected && selected.body === text ? selected.id : undefined);
    } catch (err) {
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
      setSaveOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vorlage konnte nicht gespeichert werden");
    } finally {
      setSaving(false);
    }
  }

  function pickTemplate(id: string) {
    setTemplateId(id);
    const tpl = templates.find((t) => t.id === id);
    if (tpl) setScript(tpl.body);
    setError("");
  }

  return (
    <div className="mon-block mon-script-block">
      <div className="mon-script-head">
        <h3>
          PowerShell
          <HelpHint text="Skript an den Windows-Agent. Beim nächsten Heartbeat als LocalSystem (volle Adminrechte). Die Ausgabe erscheint darunter." />
        </h3>
        {waiting && latest ? <span className="mon-script-chip is-wait">{STATUS_LABEL[latest.status]} · ca. 1 Min.</span> : null}
        {latest && !waiting ? (
          <span className={`mon-script-chip is-${latest.status === "error" || latest.status === "expired" ? "err" : "ok"}`}>
            {STATUS_LABEL[latest.status]}
            {latest.exitCode != null ? ` · ${latest.exitCode}` : ""}
          </span>
        ) : null}
      </div>

      {!windows ? (
        <p className="muted mon-script-hint">Nur auf Windows-Geräten.</p>
      ) : !capable ? (
        <p className="muted mon-script-hint">
          Agent {minAgent} nötig – Paket unter Agent einrichten hochladen und den Client aktualisieren.
        </p>
      ) : (
        <>
          <div className="mon-script-toolbar">
            <ScriptTemplateMenu
              templates={templates}
              value={templateId}
              disabled={busy || Boolean(waiting)}
              onChange={pickTemplate}
            />
            {selected ? (
              <button
                type="button"
                className="mon-script-icon"
                title="Vorlage löschen"
                aria-label="Vorlage löschen"
                disabled={busy || saving}
                onClick={() => {
                  if (!window.confirm(`Vorlage „${selected.name}“ löschen?`)) return;
                  void onDeleteTemplate(selected.id);
                  setTemplateId("");
                }}
              >
                ×
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-sm mon-script-run"
              disabled={busy || Boolean(waiting) || !script.trim()}
              onClick={() => void run()}
            >
              {busy ? "…" : "Ausführen"}
            </button>
          </div>
          <textarea
            className="mon-script-editor"
            rows={5}
            spellCheck={false}
            disabled={busy || Boolean(waiting)}
            value={script}
            onChange={(e) => {
              setScript(e.target.value);
              if (selected && e.target.value !== selected.body) setTemplateId("");
            }}
            placeholder="ipconfig /all"
          />
          <div className="mon-script-foot">
            {saveOpen ? (
              <>
                <input
                  className="mon-script-name"
                  placeholder="Name der Vorlage"
                  value={saveName}
                  disabled={busy || saving}
                  onChange={(e) => setSaveName(e.target.value)}
                  maxLength={80}
                  autoFocus
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy || saving || !saveName.trim() || !script.trim()}
                  onClick={() => void saveTemplate()}
                >
                  Speichern
                </button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={saving} onClick={() => setSaveOpen(false)}>
                  Abbrechen
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy || Boolean(waiting) || !script.trim()}
                onClick={() => {
                  setSaveName(selected?.name ?? "");
                  setSaveOpen(true);
                }}
              >
                Als Vorlage
              </button>
            )}
          </div>
          {error ? <p className="form-error">{error}</p> : null}
        </>
      )}

      {latest ? <ScriptJobCard job={latest} waiting={Boolean(waiting)} /> : null}

      {older.length ? (
        <ul className="mon-script-history">
          {older.slice(0, 7).map((job) => {
            const expanded = openHistory === job.id;
            return (
              <li key={job.id}>
                <button
                  type="button"
                  className={`mon-script-hist-row is-${job.status}${expanded ? " is-open" : ""}`}
                  onClick={() => setOpenHistory(expanded ? null : job.id)}
                >
                  <span className={`mon-script-dot is-${job.status}`} aria-hidden />
                  <strong>{STATUS_LABEL[job.status]}</strong>
                  <span className="mon-script-hist-script">{scriptPreview(job.script)}</span>
                  <span className="muted">{relSeen(job.finishedAt || job.startedAt || job.createdAt)}</span>
                </button>
                {expanded ? <ScriptJobOutput job={job} /> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function ScriptJobCard({ job, waiting }: { job: MonitoringScriptJob; waiting: boolean }) {
  if (waiting) {
    return (
      <div className="mon-script-wait">
        <p>
          <strong>{job.status === "pending" ? "Wartet auf den Agent" : "Wird ausgeführt"}</strong>
          <span className="muted"> · {scriptPreview(job.script)}</span>
        </p>
        <p className="muted">Ausgabe nach dem nächsten Heartbeat, etwa einer Minute.</p>
      </div>
    );
  }
  return (
    <div className={`mon-script-result is-${job.status}`}>
      <div className="mon-script-result-head">
        <strong>{STATUS_LABEL[job.status]}</strong>
        <span className="muted">
          {job.createdByUsername || "Admin"} · {relSeen(job.finishedAt || job.createdAt)}
          {job.exitCode != null ? ` · Exit ${job.exitCode}` : ""}
        </span>
      </div>
      {job.errorMessage && job.status !== "done" ? <p className="form-error">{job.errorMessage}</p> : null}
      <ScriptJobOutput job={job} />
    </div>
  );
}

function ScriptJobOutput({ job }: { job: MonitoringScriptJob }) {
  const text = [job.stdout, job.stderr ? `STDERR:\n${job.stderr}` : ""].filter(Boolean).join("\n\n").trim();
  if (!text) {
    return job.errorMessage ? null : <p className="muted">Keine Ausgabe</p>;
  }
  return <pre className="mon-script-out">{text}</pre>;
}

function scriptPreview(script: string): string {
  const line = script.trim().split(/\r?\n/).find((s) => s.trim()) ?? "";
  return line.length > 72 ? `${line.slice(0, 70)}…` : line;
}

function ScriptTemplateMenu({
  templates,
  value,
  onChange,
  disabled,
}: {
  templates: MonitoringScriptTemplate[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = templates.find((t) => t.id === value);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={`mon-script-menu${open ? " is-open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="mon-script-menu-btn"
        aria-label="Vorlage"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{selected?.name ?? "Freies Skript"}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <ul className="mon-script-menu-list" role="listbox">
          <li>
            <button
              type="button"
              className={!value ? "is-active" : undefined}
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              <strong>Freies Skript</strong>
              <span>selbst schreiben</span>
            </button>
          </li>
          {templates.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className={t.id === value ? "is-active" : undefined}
                onClick={() => {
                  onChange(t.id);
                  setOpen(false);
                }}
              >
                <strong>{t.name}</strong>
                <span>{scriptPreview(t.body)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
