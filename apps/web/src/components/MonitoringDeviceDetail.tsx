import { useState } from "react";
import { Link } from "react-router-dom";
import { LineChart } from "./DashCharts";
import { Modal } from "./Modal";
import {
  MonitoringAlertConfigFields,
  monitoringAlertEnabledCount,
} from "./MonitoringAlertConfigFields";
import { MonitoringHardwarePanel } from "./MonitoringHardware";
import { MonitoringPingTargets } from "./MonitoringPingTargets";
import { MonitoringProcessList, type ProcessSort } from "./MonitoringProcessList";
import { MonitoringServiceWatches } from "./MonitoringServiceWatches";
import { MonitoringScriptPanel } from "./MonitoringScriptPanel";
import {
  agentVersionAtLeast,
  deviceIssueChips,
  formatBytes,
  formatUptime,
  pct,
  relSeen,
  seriesFrom,
  ticketIssueHint,
} from "../lib/monitoringUi";
import type { MonitoringAlertConfig, MonitoringDeviceDetail, MonitoringPingTarget, MonitoringServiceWatch } from "../types";
import { emptyMonitoringAlertConfig, monitoringDiskId } from "../types";

/**
 * Gerätedetail: Warnungen, CPU/RAM-Prozesse, Pings, Dienst-Wächter, PowerShell, Verlauf, Hardware.
 */
export function MonitoringDeviceDetail({
  detail,
  rangeDays,
  onRange,
  onSaveAlerts,
  onSavePings,
  onSaveWatches,
  onRequestUpdate,
  onRequestUninstall,
  onRunScript,
  onSaveScriptTemplate,
  onDeleteScriptTemplate,
  updateBusy,
  uninstallBusy,
  scriptBusy,
  backTo,
}: {
  detail: MonitoringDeviceDetail;
  rangeDays: number;
  onRange: (days: number) => void;
  onSaveAlerts: (cfg: MonitoringAlertConfig) => void;
  onSavePings?: (targets: MonitoringPingTarget[]) => void;
  onSaveWatches?: (targets: MonitoringServiceWatch[]) => void;
  onRequestUpdate: () => void;
  onRequestUninstall?: () => void;
  onRunScript?: (script: string, templateId?: string) => Promise<void> | void;
  onSaveScriptTemplate?: (name: string, body: string) => Promise<void> | void;
  onDeleteScriptTemplate?: (id: string) => Promise<void> | void;
  updateBusy: boolean;
  uninstallBusy?: boolean;
  scriptBusy?: boolean;
  backTo?: string;
}) {
  const { device, snapshot, samples } = detail;
  const pointsCpu = seriesFrom(samples, "cpuPct");
  const pointsRam = seriesFrom(samples, "ramPct");
  const pointsDisk = seriesFrom(samples, "diskUsedPct");
  const [alertConfig, setAlertConfig] = useState(
    device.alertConfig ?? emptyMonitoringAlertConfig(device.alertEnabled),
  );
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [procSort, setProcSort] = useState<ProcessSort | null>(null);
  const [updateMsg, setUpdateMsg] = useState("");
  const [uninstallMsg, setUninstallMsg] = useState("");
  const alertCount = monitoringAlertEnabledCount(alertConfig);
  const liveIssues = device.warning ? deviceIssueChips(device) : [];

  return (
    <section className="panel mon-detail" id="mon-device-detail">
      <div className="section-head row-between">
        <div>
          <h2>{device.assetName}</h2>
          <p>
            {device.customerName} · {device.hostname || "–"} · {device.ipAddress || "–"} · zuletzt{" "}
            {relSeen(device.lastSeenAt)}
          </p>
        </div>
        <div className="mon-detail-actions">
          {backTo ? (
            <Link className="btn btn-ghost btn-sm" to={backTo}>
              Alle Geräte
            </Link>
          ) : null}
          {device.assetId ? (
            <Link className="btn btn-ghost btn-sm" to={`/customers/${device.customerId}/assets`}>
              Inventar
            </Link>
          ) : null}
          {(device.tickets ?? []).map((t) => (
            <Link key={t.ticketId} className="btn btn-ghost btn-sm" to={`/tickets/${t.ticketId}`}>
              {t.ticketNumber} · {ticketIssueHint(t)}
            </Link>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAlertsOpen(true)}>
            Ticket-Typen
            {alertCount ? <span className="mon-alert-btn-count">{alertCount}</span> : null}
          </button>
        </div>
      </div>

      <div className="mon-detail-toggles">
        {liveIssues.length ? (
          <div className="mon-live-issues" aria-label="Aktuelle Warnungen">
            {liveIssues.map((label) => (
              <span key={label} className="mon-issue-chip">
                {label}
              </span>
            ))}
          </div>
        ) : (
          <p className="muted mon-alert-summary">Keine aktuelle Warnung</p>
        )}
        <div className="mon-range">
          {[1, 7, 30].map((d) => (
            <button
              key={d}
              type="button"
              className={`btn btn-sm${rangeDays === d ? " btn-primary" : " btn-ghost"}`}
              onClick={() => onRange(d)}
            >
              {d === 1 ? "24 Std." : `${d} Tage`}
            </button>
          ))}
        </div>
      </div>

      <Modal
        open={alertsOpen}
        title="Welche Probleme ein Ticket erzeugen"
        onClose={() => setAlertsOpen(false)}
        className="modal-wide mon-alert-modal"
      >
        <MonitoringAlertConfigFields
          value={alertConfig}
          disks={snapshot?.disks}
          onChange={(cfg) => {
            setAlertConfig(cfg);
            onSaveAlerts(cfg);
          }}
        />
      </Modal>

      <div className="mon-kpis-mini">
        <button type="button" className="mon-kpi-action" onClick={() => setProcSort("cpu")} title="Prozesse anzeigen" aria-label="CPU – Prozesse anzeigen">
          <span className="mon-kpi-top">
            <span className="mon-kpi-label">CPU</span>
            <span className="mon-kpi-go">
              Prozesse
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M6 3.5 11 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </span>
          <strong>{pct(device.cpuPercent)}</strong>
          <span className="mon-meter" aria-hidden>
            <span style={{ width: `${Math.min(100, Math.max(0, device.cpuPercent ?? 0))}%` }} />
          </span>
        </button>
        <button type="button" className="mon-kpi-action" onClick={() => setProcSort("ram")} title="Prozesse anzeigen" aria-label="RAM – Prozesse anzeigen">
          <span className="mon-kpi-top">
            <span className="mon-kpi-label">RAM</span>
            <span className="mon-kpi-go">
              Prozesse
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M6 3.5 11 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </span>
          <strong>{pct(device.ramPercent)}</strong>
          <span className="mon-meter" aria-hidden>
            <span style={{ width: `${Math.min(100, Math.max(0, device.ramPercent ?? 0))}%` }} />
          </span>
        </button>
        <div className={device.issues.includes("disk") ? "is-warn" : undefined}>
          <span>Datenträger</span>
          <strong>{pct(device.diskUsedPct)}</strong>
          <span className={`mon-meter${device.issues.includes("disk") ? " is-over" : ""}`} aria-hidden>
            <span style={{ width: `${Math.min(100, Math.max(0, device.diskUsedPct ?? 0))}%` }} />
          </span>
        </div>
        <div>
          <span>Uptime</span>
          <strong>{formatUptime(device.uptimeSec)}</strong>
        </div>
      </div>

      <Modal
        open={procSort != null}
        title="Prozesse"
        onClose={() => setProcSort(null)}
        className="modal-wide mon-proc-modal"
      >
        <MonitoringProcessList
          processes={snapshot?.processes ?? []}
          sort={procSort ?? "cpu"}
          onSort={setProcSort}
        />
      </Modal>

      {samples.length < 2 ? (
        <p className="empty">Noch nicht genug Verlauf für ein Diagramm.</p>
      ) : (
        <LineChart
          yMax={100}
          ySuffix="%"
          series={[
            { label: "CPU", color: "#60a5fa", points: pointsCpu },
            { label: "RAM", color: "#a78bfa", points: pointsRam },
            { label: "Datenträger", color: "#34d399", points: pointsDisk },
          ]}
        />
      )}

      <MonitoringHardwarePanel
        hardware={snapshot?.hardware}
        disks={
          snapshot?.disks?.length
            ? snapshot.disks.map((d) => {
                const id = monitoringDiskId(d);
                const used = d.totalBytes > 0 ? (d.usedBytes / d.totalBytes) * 100 : 0;
                const vol = alertConfig.disk.volumes[id];
                const thresh = vol?.warnUsedPct ?? alertConfig.disk.warnUsedPct ?? 90;
                const over = Boolean(alertConfig.disk.enabled && (vol?.enabled ?? true) && used >= thresh);
                return {
                  id,
                  name: d.name || id,
                  usedPct: used,
                  freeLabel: formatBytes(d.freeBytes),
                  totalLabel: formatBytes(d.totalBytes),
                  over,
                  thresh,
                };
              })
            : undefined
        }
        updates={snapshot?.updates}
        session={snapshot?.session}
        network={snapshot?.network}
        ip={snapshot?.ip}
        ips={snapshot?.ips}
        services={snapshot?.services}
        software={snapshot?.software}
        customerId={device.customerId ?? undefined}
        defender={snapshot?.defender}
        firewall={snapshot?.firewall}
        crash={snapshot?.crash}
        pings={
          onSavePings ? (
            <MonitoringPingTargets
              targets={device.pingTargets ?? []}
              results={snapshot?.pings}
              agentVersion={device.agentVersion}
              busy={updateBusy || uninstallBusy}
              onChange={onSavePings}
            />
          ) : null
        }
        watches={
          onSaveWatches ? (
            <MonitoringServiceWatches
              targets={device.serviceWatches ?? []}
              results={snapshot?.watchedServices}
              agentVersion={device.agentVersion}
              busy={updateBusy || uninstallBusy}
              onChange={onSaveWatches}
            />
          ) : null
        }
        clock={snapshot?.clock}
      />

      {snapshot?.events?.length ? (
        <div className="mon-block">
          <h3>Ereignisse</h3>
          <ul className="mon-event-list">
            {snapshot.events.map((ev, i) => (
              <li key={i}>
                <span className="muted">
                  {ev.time || ""} {ev.source || ""} {ev.level || ""}
                </span>
                <p>{ev.message}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {onRunScript && onSaveScriptTemplate && onDeleteScriptTemplate ? (
        <MonitoringScriptPanel
          jobs={detail.scriptJobs ?? []}
          templates={detail.scriptTemplates ?? []}
          capable={Boolean(detail.scriptCapable)}
          windows={Boolean(detail.scriptWindows)}
          minAgent={detail.scriptMinAgent || "1.0.11"}
          busy={scriptBusy}
          onRun={onRunScript}
          onSaveTemplate={onSaveScriptTemplate}
          onDeleteTemplate={onDeleteScriptTemplate}
        />
      ) : null}

      <div className="mon-agent-update">
        <p className="muted mon-os-line">
          {[
            snapshot?.os,
            snapshot?.osVersion,
            snapshot?.arch,
            device.agentVersion && `Agent ${device.agentVersion}`,
            device.latestAgentVersion &&
              (device.agentOutdated
                ? `aktuell ${device.latestAgentVersion}`
                : `Paket ${device.latestAgentVersion}`),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <div className="mon-agent-update-actions">
          {device.latestAgentVersion ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={updateBusy || uninstallBusy || (!device.agentOutdated && !device.updateRequested)}
              onClick={() => {
                setUpdateMsg("Update wird beim nächsten Heartbeat geladen (ca. 1 Minute).");
                onRequestUpdate();
              }}
            >
              {updateBusy
                ? "…"
                : device.updateRequested
                  ? "Update angefordert"
                  : device.agentOutdated
                    ? "Jetzt aktualisieren"
                    : "Aktuell"}
            </button>
          ) : (
            <p className="muted">
              Kein Agent-Paket für {device.agentPlatform || "diese Plattform"} in den Einstellungen.
            </p>
          )}
          {onRequestUninstall ? (
            <button
              type="button"
              className="btn btn-danger btn-sm"
              disabled={updateBusy || uninstallBusy || device.uninstallRequested}
              onClick={() => {
                const oldAgent = !agentVersionAtLeast(device.agentVersion, "1.0.4");
                if (
                  !window.confirm(
                    oldAgent
                      ? `Agent auf „${device.assetName}“ deinstallieren?\n\nDieser Agent (${device.agentVersion || "unbekannt"}) braucht 1.0.4. Zuerst das Paket hochladen – dann Update und Deinstallation nacheinander. Der Inventar-Eintrag bleibt.`
                      : `Agent auf „${device.assetName}“ deinstallieren?\n\nDer Dienst wird beim nächsten Heartbeat entfernt. Der Inventar-Eintrag bleibt.`,
                  )
                ) {
                  return;
                }
                setUninstallMsg("Deinstallation beim nächsten Heartbeat. Danach verschwindet das Gerät aus dem Monitoring.");
                onRequestUninstall();
              }}
            >
              {uninstallBusy ? "…" : device.uninstallRequested ? "Wird entfernt…" : "Client löschen"}
            </button>
          ) : null}
        </div>
      </div>
      {updateMsg ? <p className="form-success">{updateMsg}</p> : null}
      {uninstallMsg || device.uninstallRequested ? (
        <p className="form-success">
          {uninstallMsg || "Deinstallation angefordert. Der Agent entfernt den Dienst beim nächsten Heartbeat."}
        </p>
      ) : null}
    </section>
  );
}
