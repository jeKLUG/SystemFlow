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
  disk: { title: "Datenträger voll", hint: "Je Laufwerk eigener Schwellwert (Belegt-%)" },
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

/**
 * Pro Warnungstyp: aktivieren und Ticket-Priorität für dieses Gerät wählen.
 * Datenträger: Schwellwert je Laufwerk, sobald der Agent Platten gemeldet hat.
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
        Nur aktivierte Typen erzeugen eine Warnung und ein eigenes Ticket. Datenträger: ein Ticket
        pro Laufwerk über dem Schwellwert.
      </p>
      <ul className="mon-alert-list">
        {monitoringIssueKinds.map((kind) => {
          const meta = kindMeta[kind];
          if (kind === "disk") {
            const row = value.disk;
            return (
              <li key={kind} className={`mon-alert-row mon-alert-row-disk${row.enabled ? "" : " is-off"}`}>
                <Checkbox
                  checked={row.enabled}
                  disabled={disabled}
                  onChange={(enabled) => patchDisk({ enabled })}
                  aria-label={meta.title}
                />
                <div className="mon-alert-meta">
                  <strong>{meta.title}</strong>
                  <span className="muted">{meta.hint}</span>
                </div>
                <div className="mon-alert-prios" role="group" aria-label={`Priorität ${meta.title}`}>
                  {priorities.map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={`mon-alert-prio is-${p}${row.priority === p ? " is-active" : ""}`}
                      disabled={disabled || !row.enabled}
                      onClick={() => patchDisk({ priority: p })}
                    >
                      {ticketPriorityLabel[p]}
                    </button>
                  ))}
                </div>
                {row.enabled ? (
                  <div className="mon-disk-alerts">
                    <label className="mon-disk-default">
                      <span>Standard, falls kein eigener Wert</span>
                      <span className="mon-disk-thresh">
                        <input
                          type="number"
                          min={1}
                          max={99}
                          disabled={disabled}
                          value={row.warnUsedPct ?? 90}
                          onChange={(e) => patchDisk({ warnUsedPct: Number(e.target.value) || 90 })}
                        />
                        % belegt
                      </span>
                    </label>
                    {live.length === 0 ? (
                      <p className="muted mon-disk-empty">
                        Laufwerke erscheinen nach dem nächsten Heartbeat. Dann kannst du je Platte
                        den Schwellwert setzen.
                      </p>
                    ) : (
                      <ul className="mon-disk-volume-list">
                        {live.map((d) => {
                          const id = monitoringDiskId(d);
                          const vol = volumeFor(row, id);
                          const pct = usedPct(d);
                          const over = pct != null && vol.enabled && pct >= vol.warnUsedPct;
                          return (
                            <li key={id} className={`mon-disk-volume${over ? " is-over" : ""}${vol.enabled ? "" : " is-off"}`}>
                              <Checkbox
                                checked={vol.enabled}
                                disabled={disabled}
                                onChange={(enabled) => patchVolume(id, { enabled })}
                                aria-label={`Warnung ${d.name || id}`}
                              />
                              <div className="mon-disk-volume-meta">
                                <strong>{d.name || id}</strong>
                                <span className="muted">
                                  {d.totalBytes
                                    ? `${formatBytes(d.freeBytes)} frei von ${formatBytes(d.totalBytes)}${pct != null ? ` · ${Math.round(pct)} % belegt` : ""}`
                                    : "aktuell nicht gemeldet"}
                                </span>
                                {pct != null ? (
                                  <span className="mon-disk-bar" aria-hidden>
                                    <span style={{ width: `${Math.round(pct)}%` }} />
                                  </span>
                                ) : null}
                              </div>
                              <label className="mon-disk-thresh">
                                ab
                                <input
                                  type="number"
                                  min={1}
                                  max={99}
                                  disabled={disabled || !vol.enabled}
                                  value={vol.warnUsedPct}
                                  onChange={(e) =>
                                    patchVolume(id, { warnUsedPct: Number(e.target.value) || row.warnUsedPct })
                                  }
                                />
                                %
                              </label>
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
              <Checkbox
                checked={row.enabled}
                disabled={disabled}
                onChange={(enabled) => patch(kind, { enabled })}
                aria-label={meta.title}
              />
              <div className="mon-alert-meta">
                <strong>{meta.title}</strong>
                <span className="muted">{meta.hint}</span>
              </div>
              <div className="mon-alert-prios" role="group" aria-label={`Priorität ${meta.title}`}>
                {priorities.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`mon-alert-prio is-${p}${row.priority === p ? " is-active" : ""}`}
                    disabled={disabled || !row.enabled}
                    onClick={() => patch(kind, { priority: p })}
                  >
                    {ticketPriorityLabel[p]}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
