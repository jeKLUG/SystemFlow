import { useState } from "react";
import { Link } from "react-router-dom";
import { LineChart } from "./DashCharts";
import { Modal } from "./Modal";
import {
  MonitoringAlertConfigFields,
  monitoringAlertEnabledCount,
  monitoringAlertSummary,
} from "./MonitoringAlertConfigFields";
import { MonitoringHardwarePanel } from "./MonitoringHardware";
import {
  agentVersionAtLeast,
  deviceIssueText,
  formatBytes,
  formatUptime,
  monitoringIssueLabel,
  pct,
  relSeen,
  seriesFrom,
} from "../lib/monitoringUi";
import type { MonitoringAlertConfig, MonitoringDeviceDetail } from "../types";
import { emptyMonitoringAlertConfig, monitoringDiskId } from "../types";

/**
 * Gerätedetail: Warnungen, Verlauf, Hardware, Agent-Update und Remote-Deinstallation.
 */
export function MonitoringDeviceDetail({
  detail,
  rangeDays,
  onRange,
  onSaveAlerts,
  onRequestUpdate,
  onRequestUninstall,
  updateBusy,
  uninstallBusy,
  backTo,
}: {
  detail: MonitoringDeviceDetail;
  rangeDays: number;
  onRange: (days: number) => void;
  onSaveAlerts: (cfg: MonitoringAlertConfig) => void;
  onRequestUpdate: () => void;
  onRequestUninstall?: () => void;
  updateBusy: boolean;
  uninstallBusy?: boolean;
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
  const [updateMsg, setUpdateMsg] = useState("");
  const [uninstallMsg, setUninstallMsg] = useState("");
  const alertCount = monitoringAlertEnabledCount(alertConfig);
  const alertLabels = monitoringAlertSummary(alertConfig);

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
              {t.ticketNumber} · {t.diskId ?? monitoringIssueLabel[t.kind]}
            </Link>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAlertsOpen(true)}>
            Warnungen konfigurieren
            {alertCount ? <span className="mon-alert-btn-count">{alertCount}</span> : null}
          </button>
        </div>
      </div>

      <div className="mon-detail-toggles">
        <p className="mon-alert-summary muted">
          {alertCount
            ? `${alertCount} ${alertCount === 1 ? "Warnung aktiv" : "Warnungen aktiv"}: ${alertLabels.join(" · ")}`
            : "Keine Warnungen aktiv – das Gerät erzeugt keine Tickets."}
        </p>
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
        title="Warnungen konfigurieren"
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

      {device.warning ? <p className="mon-warn-banner">{deviceIssueText(device)}</p> : null}

      <div className="mon-kpis-mini">
        <div>
          <span>CPU</span>
          <strong>{pct(device.cpuPercent)}</strong>
          <span className="mon-meter" aria-hidden>
            <span style={{ width: `${Math.min(100, Math.max(0, device.cpuPercent ?? 0))}%` }} />
          </span>
        </div>
        <div>
          <span>RAM</span>
          <strong>{pct(device.ramPercent)}</strong>
          <span className="mon-meter" aria-hidden>
            <span style={{ width: `${Math.min(100, Math.max(0, device.ramPercent ?? 0))}%` }} />
          </span>
        </div>
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
        processes={snapshot?.processes}
        updates={snapshot?.updates}
        session={snapshot?.session}
        network={snapshot?.network}
        ip={snapshot?.ip}
        ips={snapshot?.ips}
        services={snapshot?.services}
        software={snapshot?.software}
        customerId={device.customerId}
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
