import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { ChartLegend, DonutChart, HBarChart, LineChart } from "../../components/DashCharts";
import { Checkbox } from "../../components/Checkbox";
import type {
  MonitoringAssignableAsset,
  MonitoringDeviceDetail,
  MonitoringDeviceSummary,
  MonitoringIssueKind,
  MonitoringOverview,
  MonitoringPendingAgent,
  MonitoringSample,
} from "../../types";

const issueLabel: Record<MonitoringIssueKind, string> = {
  offline: "Offline",
  disk: "Datenträger",
  cpu: "CPU",
  ram: "RAM",
  eventlog: "Ereignisse",
  updates: "Updates",
};

function sampleTime(ts: string | number | Date): number {
  if (typeof ts === "number") return ts;
  if (ts instanceof Date) return ts.getTime();
  const n = Date.parse(ts);
  return Number.isFinite(n) ? n : 0;
}

function formatBytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "–";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}

function formatUptime(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return "–";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

function relSeen(iso: string | null | undefined): string {
  if (!iso) return "nie";
  const t = sampleTime(iso);
  if (!t) return "nie";
  const delta = Date.now() - t;
  if (delta < 90_000) return "gerade eben";
  if (delta < 3600_000) return `vor ${Math.round(delta / 60_000)} Min.`;
  if (delta < 86400_000) return `vor ${Math.round(delta / 3600_000)} Std.`;
  return new Date(t).toLocaleString("de-DE");
}

function pct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "–";
  return `${Math.round(n)} %`;
}

function seriesFrom(samples: MonitoringSample[], key: keyof MonitoringSample) {
  return samples.map((s) => ({
    t: sampleTime(s.ts),
    v: typeof s[key] === "number" ? (s[key] as number) : null,
  }));
}

/**
 * Staff-Monitoring: Flotte, Zuordnung und Gerätedetails.
 */
export function MonitoringPage() {
  const [overview, setOverview] = useState<MonitoringOverview | null>(null);
  const [pending, setPending] = useState<MonitoringPendingAgent[]>([]);
  const [assignable, setAssignable] = useState<MonitoringAssignableAsset[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [devices, setDevices] = useState<MonitoringDeviceSummary[]>([]);
  const [waitingAssets, setWaitingAssets] = useState<{ id: string; name: string; hostname: string | null }[]>(
    [],
  );
  const [detailAssetId, setDetailAssetId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MonitoringDeviceDetail | null>(null);
  const [rangeDays, setRangeDays] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [assignPick, setAssignPick] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  async function reloadFleet() {
    const [ov, pend] = await Promise.all([api.monitoringOverview(), api.monitoringPending()]);
    setOverview(ov);
    setPending(pend.agents);
    setAssignable(pend.assets);
  }

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      reloadFleet()
        .catch((err) => setError(err instanceof Error ? err.message : "Laden fehlgeschlagen"))
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    void load();
    const t = window.setInterval(() => {
      void reloadFleet().catch(() => undefined);
    }, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, []);

  useEffect(() => {
    if (!customerId) {
      setDevices([]);
      setWaitingAssets([]);
      return;
    }
    void api
      .monitoringCustomer(customerId)
      .then((row) => {
        setDevices(row.devices);
        setWaitingAssets(row.waitingAssets);
      })
      .catch(() => {
        setDevices([]);
        setWaitingAssets([]);
      });
  }, [customerId, overview]);

  useEffect(() => {
    if (!detailAssetId) {
      setDetail(null);
      return;
    }
    const to = Date.now();
    const from = to - rangeDays * 24 * 60 * 60 * 1000;
    void api
      .monitoringDevice(detailAssetId, { from, to })
      .then(setDetail)
      .catch(() => setDetail(null));
  }, [detailAssetId, rangeDays, overview]);

  const slices = useMemo(() => {
    if (!overview) return [];
    return [
      { label: "Online", value: overview.online, color: "#34d399" },
      { label: "Offline", value: overview.offline, color: "#94a3b8" },
      { label: "Warnung", value: overview.warning, color: "#f87171" },
    ].filter((s) => s.value > 0);
  }, [overview]);

  async function assign(agentId: string) {
    const assetId = assignPick[agentId];
    if (!assetId) return;
    setBusyId(agentId);
    setError("");
    try {
      await api.assignMonitoringAgent(agentId, assetId);
      await reloadFleet();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Zuordnung fehlgeschlagen");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleAlert(assetId: string, next: boolean) {
    setBusyId(assetId);
    try {
      await api.patchMonitoringDevice(assetId, { monitoringAlertEnabled: next });
      await reloadFleet();
      if (customerId) {
        const row = await api.monitoringCustomer(customerId);
        setDevices(row.devices);
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="page monitoring-page">
      <header className="dashboard-hero">
        <div>
          <p className="eyebrow">Flotte</p>
          <h2>Monitoring</h2>
          <p className="muted">Live-Status der Agenten, Zuordnung zum Inventar, Warnungen und Verlauf.</p>
        </div>
        <Link className="btn btn-ghost" to="/settings">
          Agent einrichten
        </Link>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="dash-kpis dash-kpis-compact" aria-label="Kennzahlen">
        <div className="dash-kpi">
          <span className="dash-kpi-label">Online</span>
          <strong>{loading ? "–" : (overview?.online ?? 0)}</strong>
          <span className="dash-kpi-meta">Geräte</span>
        </div>
        <div className="dash-kpi">
          <span className="dash-kpi-label">Offline</span>
          <strong>{loading ? "–" : (overview?.offline ?? 0)}</strong>
          <span className="dash-kpi-meta">kein Heartbeat</span>
        </div>
        <div className={`dash-kpi${(overview?.warning ?? 0) > 0 ? " is-warn" : ""}`}>
          <span className="dash-kpi-label">Warnung</span>
          <strong>{loading ? "–" : (overview?.warning ?? 0)}</strong>
          <span className="dash-kpi-meta">mit Ticket</span>
        </div>
        <div className={`dash-kpi${(overview?.pending ?? 0) > 0 ? " is-warn" : ""}`}>
          <span className="dash-kpi-label">Unzugeordnet</span>
          <strong>{loading ? "–" : (overview?.pending ?? 0)}</strong>
          <span className="dash-kpi-meta">warten auf Inventar</span>
        </div>
      </section>

      <section className="dash-analytics dash-analytics-compact" aria-label="Diagramme">
        <article className="panel dash-chart-card">
          <div className="dash-chart-head">
            <div>
              <h3>Status</h3>
              <p className="muted">Zugeordnete Geräte</p>
            </div>
          </div>
          {loading ? (
            <p className="empty">Lade…</p>
          ) : (overview?.assigned ?? 0) === 0 ? (
            <p className="empty">Noch keine Geräte zugeordnet.</p>
          ) : (
            <div className="dash-chart-body is-split">
              <DonutChart
                slices={
                  slices.length
                    ? slices
                    : [{ label: "Online", value: overview?.online ?? 0, color: "#34d399" }]
                }
                size={96}
                thickness={7}
                centerValue={overview?.assigned ?? 0}
                centerLabel="gesamt"
              />
              <ChartLegend
                slices={
                  slices.length
                    ? slices
                    : [{ label: "Online", value: overview?.online ?? 0, color: "#34d399" }]
                }
              />
            </div>
          )}
        </article>
        <article className="panel dash-chart-card">
          <div className="dash-chart-head">
            <div>
              <h3>Probleme</h3>
              <p className="muted">Nach Kunde</p>
            </div>
          </div>
          {loading ? (
            <p className="empty">Lade…</p>
          ) : (overview?.byCustomer.filter((c) => c.warning > 0).length ?? 0) === 0 ? (
            <p className="empty">Keine aktiven Warnungen.</p>
          ) : (
            <HBarChart
              items={(overview?.byCustomer ?? [])
                .filter((c) => c.warning > 0)
                .map((c) => ({
                  label: c.customerName,
                  value: c.warning,
                  color: "#f87171",
                }))}
            />
          )}
        </article>
      </section>

      {(overview?.problems.length ?? 0) > 0 ? (
        <section className="panel mon-panel">
          <div className="section-head">
            <h2>Aktive Warnungen</h2>
            <p>Nur Geräte mit eingeschalteter Warnung</p>
          </div>
          <ul className="mon-problem-list">
            {overview!.problems.map((p) => (
              <li key={p.agentId}>
                <button type="button" className="mon-problem-open" onClick={() => {
                  if (p.customerId) setCustomerId(p.customerId);
                  if (p.assetId) setDetailAssetId(p.assetId);
                }}>
                  <span className="mon-dot is-warn" aria-hidden />
                  <div>
                    <strong>{p.assetName}</strong>
                    <p className="muted">
                      {p.customerName} · {p.issues.map((i) => issueLabel[i]).join(", ") || "Problem"} ·{" "}
                      {relSeen(p.lastSeenAt)}
                    </p>
                  </div>
                </button>
                {p.ticketId && p.ticketNumber ? (
                  <Link className="btn btn-ghost btn-sm" to={`/tickets/${p.ticketId}`}>
                    {p.ticketNumber}
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {pending.length > 0 ? (
        <section className="panel mon-panel">
          <div className="section-head">
            <h2>Unzugeordnet</h2>
            <p>Agenten dem Inventar zuordnen (Monitoring muss am Eintrag aktiv sein)</p>
          </div>
          {assignable.length === 0 ? (
            <p className="empty">
              Keine freien Inventar-Einträge mit aktiviertem Monitoring. Im Kunden-Inventar zuerst
              „Monitoring“ einschalten.
            </p>
          ) : null}
          <ul className="mon-pending-list">
            {pending.map((agent) => (
              <li key={agent.id}>
                <div>
                  <strong>{agent.hostname || agent.machineId}</strong>
                  <p className="muted">
                    {[agent.os, agent.osVersion, agent.ipAddress].filter(Boolean).join(" · ") || agent.machineId}{" "}
                    · {relSeen(agent.lastSeenAt)}
                  </p>
                </div>
                <div className="mon-pending-actions">
                  <select
                    value={assignPick[agent.id] ?? ""}
                    onChange={(e) => setAssignPick((prev) => ({ ...prev, [agent.id]: e.target.value }))}
                  >
                    <option value="">Inventar wählen…</option>
                    {assignable.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.customerName} — {a.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={!assignPick[agent.id] || busyId === agent.id}
                    onClick={() => void assign(agent.id)}
                  >
                    Zuordnen
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="panel mon-panel">
        <div className="section-head row-between">
          <div>
            <h2>Kunde</h2>
            <p>Geräte eines Kunden im Detail</p>
          </div>
          <select
            className="mon-customer-select"
            value={customerId}
            onChange={(e) => {
              setCustomerId(e.target.value);
              setDetailAssetId(null);
            }}
          >
            <option value="">Kunde wählen…</option>
            {(overview?.customers ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {!customerId ? (
          <p className="empty">Wähle einen Kunden, um dessen Geräte zu sehen.</p>
        ) : devices.length === 0 && waitingAssets.length === 0 ? (
          <p className="empty">
            Keine Monitoring-Geräte. Im Inventar Monitoring aktivieren und den Agenten zuordnen.
          </p>
        ) : (
          <ul className="mon-device-grid">
            {devices.map((d) => (
              <li key={d.agentId}>
                <button
                  type="button"
                  className={`mon-device-card${d.assetId === detailAssetId ? " is-active" : ""}${d.warning ? " is-warn" : ""}`}
                  onClick={() => d.assetId && setDetailAssetId(d.assetId)}
                >
                  <span
                    className={`mon-dot${d.warning ? " is-warn" : d.online ? " is-on" : " is-off"}`}
                    aria-hidden
                  />
                  <strong>{d.assetName}</strong>
                  <p className="muted">
                    {d.hostname || d.ipAddress || "–"} · {d.online ? "online" : "offline"}
                  </p>
                  <p className="mon-device-metrics">
                    CPU {pct(d.cpuPercent)} · RAM {pct(d.ramPercent)} · Disk {pct(d.diskUsedPct)}
                  </p>
                </button>
              </li>
            ))}
            {waitingAssets.map((a) => (
              <li key={a.id}>
                <div className="mon-device-card is-waiting">
                  <span className="mon-dot" aria-hidden />
                  <strong>{a.name}</strong>
                  <p className="muted">wartet auf Agent</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {detail ? (
        <DeviceDetail
          detail={detail}
          rangeDays={rangeDays}
          onRange={setRangeDays}
          busy={busyId === detail.device.assetId}
          onToggleAlert={(next) => {
            if (detail.device.assetId) void toggleAlert(detail.device.assetId, next);
          }}
        />
      ) : null}
    </div>
  );
}

function DeviceDetail({
  detail,
  rangeDays,
  onRange,
  busy,
  onToggleAlert,
}: {
  detail: MonitoringDeviceDetail;
  rangeDays: number;
  onRange: (days: number) => void;
  busy: boolean;
  onToggleAlert: (next: boolean) => void;
}) {
  const { device, snapshot, samples } = detail;
  const pointsCpu = seriesFrom(samples, "cpuPct");
  const pointsRam = seriesFrom(samples, "ramPct");
  const pointsDisk = seriesFrom(samples, "diskUsedPct");

  return (
    <section className="panel mon-detail">
      <div className="section-head row-between">
        <div>
          <h2>{device.assetName}</h2>
          <p>
            {device.customerName} · {device.hostname || "–"} · {device.ipAddress || "–"} · zuletzt{" "}
            {relSeen(device.lastSeenAt)}
          </p>
        </div>
        <div className="mon-detail-actions">
          {device.assetId ? (
            <Link className="btn btn-ghost btn-sm" to={`/customers/${device.customerId}/assets`}>
              Inventar
            </Link>
          ) : null}
          {device.ticketId ? (
            <Link className="btn btn-ghost btn-sm" to={`/tickets/${device.ticketId}`}>
              {device.ticketNumber}
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mon-detail-toggles">
        <Checkbox
          label="Warnung (Ticket bei Problemen)"
          checked={device.alertEnabled}
          onChange={onToggleAlert}
          disabled={busy}
        />
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

      {device.warning ? (
        <p className="mon-warn-banner">
          {device.issues.map((i) => issueLabel[i]).join(" · ") || "Warnung aktiv"}
        </p>
      ) : null}

      <div className="mon-kpis-mini">
        <div>
          <span>CPU</span>
          <strong>{pct(device.cpuPercent)}</strong>
        </div>
        <div>
          <span>RAM</span>
          <strong>{pct(device.ramPercent)}</strong>
        </div>
        <div>
          <span>Datenträger</span>
          <strong>{pct(device.diskUsedPct)}</strong>
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

      {snapshot?.disks?.length ? (
        <div className="mon-block">
          <h3>Datenträger</h3>
          <ul className="mon-disk-list">
            {snapshot.disks.map((d) => {
              const used = d.totalBytes > 0 ? (d.usedBytes / d.totalBytes) * 100 : 0;
              return (
                <li key={d.name}>
                  <span>{d.name}</span>
                  <span className="muted">
                    {formatBytes(d.freeBytes)} frei von {formatBytes(d.totalBytes)} ({Math.round(used)} %)
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {snapshot?.processes?.length ? (
        <div className="mon-block">
          <h3>Top-Prozesse</h3>
          <table className="mon-table">
            <thead>
              <tr>
                <th>Prozess</th>
                <th>CPU</th>
                <th>RAM</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.processes.map((p, i) => (
                <tr key={`${p.name}-${i}`}>
                  <td>{p.name}</td>
                  <td>{pct(p.cpuPercent ?? null)}</td>
                  <td>{formatBytes(p.rssBytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {snapshot?.updates ? (
        <div className="mon-block">
          <h3>Updates</h3>
          <p>
            {snapshot.updates.pendingCount ?? 0} ausstehend
            {snapshot.updates.lastInstalled ? ` · zuletzt ${snapshot.updates.lastInstalled}` : ""}
          </p>
        </div>
      ) : null}

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

      <p className="muted mon-os-line">
        {[snapshot?.os, snapshot?.osVersion, snapshot?.arch, snapshot?.agentVersion && `Agent ${snapshot.agentVersion}`]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </section>
  );
}
