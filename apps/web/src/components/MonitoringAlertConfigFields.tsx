import { Checkbox } from "./Checkbox";
import { ticketPriorityLabel } from "../lib/labels";
import type {
  MonitoringAlertConfig,
  MonitoringDiskAlert,
  MonitoringIssueKind,
  MonitoringVolumeAlert,
  TicketPriority,
} from "../types";
import { monitoringDiskId, monitoringIssueKinds } from "../types";

type LiveDisk = {
  id?: string;
  name: string;
  mount?: string;
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
};

const kindMeta: Record<MonitoringIssueKind, { title: string; hint: string }> = {
  offline: { title: "Offline", hint: "Kein Heartbeat seit 2 Minuten" },
  disk: { title: "Datenträger voll", hint: "Warnung je Laufwerk über dem Belegt-Wert" },
  cpu: { title: "CPU hoch", hint: "Über 90 % für 5 Minuten" },
  ram: { title: "RAM hoch", hint: "Über 90 % für 5 Minuten" },
  eventlog: { title: "Ereignisprotokoll", hint: "Fehler im Event-Log / Journal" },
  updates: { title: "Updates ausstehend", hint: "Mindestens ein ausstehendes Update" },
};

const priorities: TicketPriority[] = ["low", "normal", "high", "critical"];

function usedPct(disk: LiveDisk): number | null {
  if (!disk.totalBytes) return null;
  return Math.max(0, Math.min(100, (disk.usedBytes / disk.totalBytes) * 100));
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n)) return "–";
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(0)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}

function volumeFor(disk: MonitoringDiskAlert, id: string): MonitoringVolumeAlert {
  const volumes = disk.volumes ?? {};
  const vol = volumes[id];
  return {
    enabled: vol?.enabled ?? true,
    warnUsedPct: vol?.warnUsedPct ?? disk.warnUsedPct ?? 90,
  };
}

/** Anzahl eingeschalteter Warnungstypen. */
export function monitoringAlertEnabledCount(cfg: MonitoringAlertConfig): number {
  return monitoringIssueKinds.filter((kind) => cfg[kind].enabled).length;
}

/** Kurzlabels der aktiven Warnungen für die Geräteliste. */
export function monitoringAlertSummary(cfg: MonitoringAlertConfig): string[] {
  return monitoringIssueKinds.filter((kind) => cfg[kind].enabled).map((kind) => kindMeta[kind].title);
}

function PrioPicker({
  value,
  disabled,
  label,
  onChange,
}: {
  value: TicketPriority;
  disabled?: boolean;
  label: string;
  onChange: (p: TicketPriority) => void;
}) {
  return (
    <div className="mon-alert-prios" role="group" aria-label={`Ticket-Priorität ${label}`}>
      <span className="mon-alert-prios-label">Ticket</span>
      {priorities.map((p) => (
        <button
          key={p}
          type="button"
          className={`mon-alert-prio is-${p}${value === p ? " is-active" : ""}`}
          disabled={disabled}
          onClick={() => onChange(p)}
        >
          {ticketPriorityLabel[p]}
        </button>
      ))}
    </div>
  );
}

function ThreshField({
  value,
  disabled,
  label,
  onChange,
}: {
  value: number;
  disabled?: boolean;
  label: string;
  onChange: (n: number) => void;
}) {
  const n = Math.min(99, Math.max(1, value || 90));
  return (
    <label className="mon-alert-thresh">
      <span>{label}</span>
      <input
        type="range"
        min={1}
        max={99}
        disabled={disabled}
        value={n}
        onChange={(e) => onChange(Number(e.target.value) || 90)}
      />
      <span className="mon-alert-thresh-val">
        <input
          type="number"
          min={1}
          max={99}
          disabled={disabled}
          value={n}
          onChange={(e) => onChange(Number(e.target.value) || 90)}
        />
        %
      </span>
    </label>
  );
}

/**
 * Warnungen je Typ ein/aus und Ticket-Priorität; Datenträger mit Schwellwert je Laufwerk.
 */
export function MonitoringAlertConfigFields({
  value,
  onChange,
  disks,
  disabled,
}: {
  value: MonitoringAlertConfig;
  onChange: (next: MonitoringAlertConfig) => void;
  disks?: LiveDisk[];
  disabled?: boolean;
}) {
  function patch(kind: Exclude<MonitoringIssueKind, "disk">, next: Partial<{ enabled: boolean; priority: TicketPriority }>) {
    onChange({ ...value, [kind]: { ...value[kind], ...next } });
  }

  function patchDisk(next: Partial<MonitoringDiskAlert>) {
    onChange({ ...value, disk: { ...value.disk, ...next } });
  }

  function patchVolume(id: string, next: Partial<MonitoringVolumeAlert>) {
    const current = volumeFor(value.disk, id);
    onChange({
      ...value,
      disk: {
        ...value.disk,
        volumes: { ...(value.disk.volumes ?? {}), [id]: { ...current, ...next } },
      },
    });
  }

  const live: LiveDisk[] = [...(disks ?? [])];
  const knownIds = new Set(live.map((d) => monitoringDiskId(d)));
  for (const id of Object.keys(value.disk.volumes ?? {})) {
    if (!knownIds.has(id)) {
      live.push({ id, name: id, totalBytes: 0, usedBytes: 0, freeBytes: 0 });
      knownIds.add(id);
    }
  }

  return (
    <div className="mon-alert-config">
      <p className="mon-alert-config-lead muted">
        Eingeschaltete Typen erzeugen eine Warnung und ein eigenes Ticket.
      </p>
      <ul className="mon-alert-list">
        {monitoringIssueKinds.map((kind) => {
          const meta = kindMeta[kind];
          if (kind === "disk") {
            const row = value.disk;
            return (
              <li key={kind} className={`mon-alert-row${row.enabled ? "" : " is-off"}`}>
                <div className="mon-alert-row-top">
                  <Checkbox
                    checked={row.enabled}
                    disabled={disabled}
                    onChange={(enabled) => patchDisk({ enabled })}
                    label={
                      <span className="mon-alert-meta">
                        <strong>{meta.title}</strong>
                        <span className="muted">{meta.hint}</span>
                      </span>
                    }
                  />
                  {row.enabled ? (
                    <PrioPicker
                      value={row.priority}
                      disabled={disabled}
                      label={meta.title}
                      onChange={(priority) => patchDisk({ priority })}
                    />
                  ) : null}
                </div>
                {row.enabled ? (
                  <div className="mon-disk-alerts">
                    <ThreshField
                      label="Neue Laufwerke ab"
                      value={row.warnUsedPct ?? 90}
                      disabled={disabled}
                      onChange={(warnUsedPct) => patchDisk({ warnUsedPct })}
                    />
                    {live.length === 0 ? (
                      <p className="muted mon-disk-empty">
                        Laufwerke erscheinen nach dem nächsten Heartbeat.
                      </p>
                    ) : (
                      <ul className="mon-disk-volume-list">
                        {live.map((d) => {
                          const id = monitoringDiskId(d);
                          const vol = volumeFor(row, id);
                          const pct = usedPct(d);
                          const over = pct != null && vol.enabled && pct >= vol.warnUsedPct;
                          return (
                            <li
                              key={id}
                              className={`mon-disk-volume${over ? " is-over" : ""}${vol.enabled ? "" : " is-off"}`}
                            >
                              <Checkbox
                                checked={vol.enabled}
                                disabled={disabled}
                                onChange={(enabled) => patchVolume(id, { enabled })}
                                label={
                                  <span className="mon-disk-volume-meta">
                                    <strong>{d.name || id}</strong>
                                    <span className="muted">
                                      {d.totalBytes
                                        ? `${formatBytes(d.freeBytes)} frei · ${pct != null ? `${Math.round(pct)} % belegt` : ""}`
                                        : "aktuell nicht gemeldet"}
                                    </span>
                                    {pct != null ? (
                                      <span className="mon-disk-bar" aria-hidden>
                                        <span style={{ width: `${Math.round(pct)}%` }} />
                                      </span>
                                    ) : null}
                                  </span>
                                }
                              />
                              {vol.enabled ? (
                                <ThreshField
                                  label="Warnen ab"
                                  value={vol.warnUsedPct}
                                  disabled={disabled}
                                  onChange={(warnUsedPct) => patchVolume(id, { warnUsedPct })}
                                />
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                ) : null}
              </li>
            );
          }

          const row = value[kind];
          return (
            <li key={kind} className={`mon-alert-row${row.enabled ? "" : " is-off"}`}>
              <div className="mon-alert-row-top">
                <Checkbox
                  checked={row.enabled}
                  disabled={disabled}
                  onChange={(enabled) => patch(kind, { enabled })}
                  label={
                    <span className="mon-alert-meta">
                      <strong>{meta.title}</strong>
                      <span className="muted">{meta.hint}</span>
                    </span>
                  }
                />
                {row.enabled ? (
                  <PrioPicker
                    value={row.priority}
                    disabled={disabled}
                    label={meta.title}
                    onChange={(priority) => patch(kind, { priority })}
                  />
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
