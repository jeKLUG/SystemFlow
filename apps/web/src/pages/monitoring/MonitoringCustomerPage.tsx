import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api";
import { ChartLegend, DonutChart, HBarChart } from "../../components/DashCharts";
import { HelpHint } from "../../components/HelpHint";
import { MonitoringAlertItem } from "../../components/MonitoringAlertItem";
import { MonitoringDeviceDetail } from "../../components/MonitoringDeviceDetail";
import {
  deviceIssueChips,
  deviceMatchesQuery,
  monitoringIssueLabel,
  pct,
  relSeen,
} from "../../lib/monitoringUi";
import type {
  MonitoringAlertConfig,
  MonitoringCustomerView,
  MonitoringDeviceDetail as DeviceDetailData,
  MonitoringDeviceSummary,
  MonitoringIssueKind,
} from "../../types";
import { monitoringIssueKinds } from "../../types";

const issueBarColor: Record<MonitoringIssueKind, string> = {
  offline: "#94a3b8",
  disk: "#fb923c",
  cpu: "#fbbf24",
  ram: "#a78bfa",
  eventlog: "#38bdf8",
  updates: "#60a5fa",
  smart: "#f87171",
  services: "#c084fc",
  reboot: "#fbbf24",
};

type DeviceFilter = "all" | "warn" | "offline" | "online" | "update" | "waiting";

function customerPath(customerId: string, assetId?: string | null) {
  return assetId
    ? `/monitoring/customers/${customerId}/devices/${assetId}`
    : `/monitoring/customers/${customerId}`;
}

/**
 * Monitoring-Kundenseite: Status, Meldungen und durchsuchbare Geräteliste.
 */
export function MonitoringCustomerPage() {
  const { customerId = "", assetId } = useParams();
  const [view, setView] = useState<MonitoringCustomerView | null>(null);
  const [detail, setDetail] = useState<DeviceDetailData | null>(null);
  const [rangeDays, setRangeDays] = useState(1);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<DeviceFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const saveAlertsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveAlertsLatest = useRef<{ assetId: string; cfg: MonitoringAlertConfig } | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  async function reloadCustomer() {
    const row = await api.monitoringCustomer(customerId);
    setView(row);
    return row;
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const load = () =>
      reloadCustomer()
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : "Laden fehlgeschlagen");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    void load();
    const t = window.setInterval(() => {
      void reloadCustomer().catch(() => undefined);
    }, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [customerId]);

  useEffect(() => {
    if (!assetId) {
      setDetail(null);
      return;
    }
    const to = Date.now();
    const from = to - rangeDays * 24 * 60 * 60 * 1000;
    void api
      .monitoringDevice(assetId, { from, to })
      .then(setDetail)
      .catch(() => setDetail(null));
  }, [assetId, rangeDays, view]);

  useEffect(() => {
    return () => {
      if (saveAlertsTimer.current) window.clearTimeout(saveAlertsTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!assetId || !detail) return;
    detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [assetId, detail?.device.assetId]);

  const devices = view?.devices ?? [];
  const waitingAssets = view?.waitingAssets ?? [];
  const online = devices.filter((d) => d.online && !d.warning).length;
  const warning = devices.filter((d) => d.warning).length;
  const offline = devices.filter((d) => !d.online).length;
  const outdated = devices.filter((d) => d.agentOutdated).length;
  const waiting = waitingAssets.length;

  const statusSlices = useMemo(
    () =>
      [
        { label: "Online", value: online, color: "#34d399" },
        { label: "Warnung", value: warning, color: "#f87171" },
        { label: "Offline", value: devices.filter((d) => !d.online && !d.warning).length, color: "#94a3b8" },
        { label: "Wartet", value: waiting, color: "#fbbf24" },
      ].filter((s) => s.value > 0),
    [online, warning, devices, waiting],
  );

  const issueBars = useMemo(() => {
    const counts: Record<MonitoringIssueKind, number> = {
      offline: 0,
      disk: 0,
      cpu: 0,
      ram: 0,
      eventlog: 0,
      updates: 0,
      smart: 0,
      services: 0,
      reboot: 0,
    };
    for (const d of devices) {
      for (const kind of d.issues) counts[kind] += 1;
    }
    return monitoringIssueKinds
      .map((kind) => ({
        label: monitoringIssueLabel[kind],
        value: counts[kind],
        color: issueBarColor[kind],
      }))
      .filter((row) => row.value > 0);
  }, [devices]);

  const messages = useMemo(() => {
    const rows: {
      key: string;
      tone: "warn" | "off" | "info";
      kindLabel: string;
      title: string;
      subtitle?: string | null;
      chips: string[];
      seen?: string;
      href?: string;
      tickets?: MonitoringDeviceSummary["tickets"];
    }[] = [];
    for (const d of devices.filter((x) => x.warning)) {
      rows.push({
        key: `warn-${d.agentId}`,
        tone: "warn",
        kindLabel: "Warnung",
        title: d.assetName,
        subtitle: d.hostname || d.ipAddress,
        chips: deviceIssueChips(d),
        seen: relSeen(d.lastSeenAt),
        href: d.assetId ? customerPath(customerId, d.assetId) : undefined,
        tickets: d.tickets,
      });
    }
    for (const d of devices.filter((x) => !x.online && !x.warning)) {
      rows.push({
        key: `off-${d.agentId}`,
        tone: "off",
        kindLabel: "Offline",
        title: d.assetName,
        subtitle: d.hostname || d.ipAddress,
        chips: ["Kein Heartbeat"],
        seen: relSeen(d.lastSeenAt),
        href: d.assetId ? customerPath(customerId, d.assetId) : undefined,
      });
    }
    for (const d of devices.filter((x) => x.agentOutdated && !x.warning)) {
      rows.push({
        key: `upd-${d.agentId}`,
        tone: "info",
        kindLabel: "Agent",
        title: d.assetName,
        subtitle: d.hostname || d.ipAddress,
        chips: d.latestAgentVersion ? [`Update ${d.latestAgentVersion}`] : ["Update"],
        seen: relSeen(d.lastSeenAt),
        href: d.assetId ? customerPath(customerId, d.assetId) : undefined,
      });
    }
    for (const a of waitingAssets) {
      rows.push({
        key: `wait-${a.id}`,
        tone: "info",
        kindLabel: "Inventar",
        title: a.name,
        subtitle: a.hostname,
        chips: ["Wartet auf Agent"],
      });
    }
    return rows;
  }, [devices, waitingAssets, customerId]);

  const visibleDevices = useMemo(() => {
    const q = query;
    let list = devices.filter((d) => deviceMatchesQuery(d, q));
    if (filter === "warn") list = list.filter((d) => d.warning);
    else if (filter === "offline") list = list.filter((d) => !d.online);
    else if (filter === "online") list = list.filter((d) => d.online);
    else if (filter === "update") list = list.filter((d) => d.agentOutdated);
    else if (filter === "waiting") list = [];
    return [...list].sort((a, b) => {
      if (a.warning !== b.warning) return a.warning ? -1 : 1;
      if (a.online !== b.online) return a.online ? -1 : 1;
      return a.assetName.localeCompare(b.assetName, "de");
    });
  }, [devices, query, filter]);

  const visibleWaiting = useMemo(() => {
    if (filter !== "all" && filter !== "waiting") return [];
    return waitingAssets.filter((a) => deviceMatchesQuery({ name: a.name, hostname: a.hostname }, query));
  }, [waitingAssets, query, filter]);

  function saveAlerts(nextAssetId: string, monitoringAlerts: MonitoringAlertConfig) {
    saveAlertsLatest.current = { assetId: nextAssetId, cfg: monitoringAlerts };
    if (saveAlertsTimer.current) window.clearTimeout(saveAlertsTimer.current);
    saveAlertsTimer.current = setTimeout(() => {
      const payload = saveAlertsLatest.current;
      if (!payload) return;
      void flushSaveAlerts(payload.assetId, payload.cfg);
    }, 400);
  }

  async function flushSaveAlerts(nextAssetId: string, monitoringAlerts: MonitoringAlertConfig) {
    setBusyId(nextAssetId);
    setError("");
    try {
      await api.patchMonitoringDevice(nextAssetId, { monitoringAlerts });
      await reloadCustomer();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Warnungen konnten nicht gespeichert werden");
    } finally {
      setBusyId(null);
    }
  }

  async function requestAgentUpdate() {
    const id = detail?.device.assetId;
    if (!id) return;
    setBusyId(id);
    setError("");
    try {
      await api.requestAgentUpdate(id);
      await reloadCustomer();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update konnte nicht angefordert werden");
    } finally {
      setBusyId(null);
    }
  }

  async function requestAgentUninstall() {
    const agentId = detail?.device.agentId;
    if (!agentId) return;
    setBusyId(agentId);
    setError("");
    try {
      await api.requestMonitoringUninstall(agentId);
      await reloadCustomer();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deinstallation fehlgeschlagen");
    } finally {
      setBusyId(null);
    }
  }

  const totalAssigned = devices.length + waiting;
  const filters: { id: DeviceFilter; label: string; count: number }[] = [
    { id: "all", label: "Alle", count: devices.length + waiting },
    { id: "warn", label: "Warnung", count: warning },
    { id: "offline", label: "Offline", count: offline },
    { id: "online", label: "Online", count: devices.filter((d) => d.online).length },
    { id: "update", label: "Update", count: outdated },
    { id: "waiting", label: "Wartet", count: waiting },
  ];

  return (
    <div className="page monitoring-page mon-customer-page">
      <header className="dashboard-hero">
        <div>
          <p className="eyebrow">
            <Link to="/monitoring">Monitoring</Link>
            <span aria-hidden> / </span>
            Kunde
          </p>
          <h2>{view?.customerName || (loading ? "…" : "Kunde")}</h2>
          <p className="muted">
            {totalAssigned
              ? `${devices.length} ${devices.length === 1 ? "Gerät" : "Geräte"}${waiting ? ` · ${waiting} ohne Agent` : ""}`
              : "Noch keine Monitoring-Geräte"}
          </p>
        </div>
        <div className="mon-customer-hero-actions">
          <Link className="btn btn-ghost" to={`/customers/${customerId}`}>
            Kundenakte
          </Link>
          <Link className="btn btn-ghost" to={`/customers/${customerId}/assets`}>
            Inventar
          </Link>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="dash-kpis dash-kpis-compact" aria-label="Kennzahlen">
        <div className="dash-kpi">
          <span className="dash-kpi-label">Online</span>
          <strong>{loading ? "–" : online}</strong>
          <span className="dash-kpi-meta">ohne Warnung</span>
        </div>
        <div className={`dash-kpi${warning > 0 ? " is-warn" : ""}`}>
          <span className="dash-kpi-label">Warnung</span>
          <strong>{loading ? "–" : warning}</strong>
          <span className="dash-kpi-meta">aktive Schwellen</span>
        </div>
        <div className="dash-kpi">
          <span className="dash-kpi-label">Offline</span>
          <strong>{loading ? "–" : offline}</strong>
          <span className="dash-kpi-meta">kein Heartbeat</span>
        </div>
        <div className={`dash-kpi${waiting > 0 ? " is-warn" : ""}`}>
          <span className="dash-kpi-label">Wartet</span>
          <strong>{loading ? "–" : waiting}</strong>
          <span className="dash-kpi-meta">ohne Agent</span>
        </div>
      </section>

      <section className="dash-analytics dash-analytics-compact" aria-label="Diagramme">
        <article className="panel dash-chart-card">
          <div className="dash-chart-head">
            <div>
              <h3>Status</h3>
              <p className="muted">Geräte dieses Kunden</p>
            </div>
          </div>
          {loading ? (
            <p className="empty">Lade…</p>
          ) : totalAssigned === 0 ? (
            <p className="empty">Noch keine Geräte.</p>
          ) : (
            <div className="dash-chart-body is-split">
              <DonutChart
                slices={
                  statusSlices.length
                    ? statusSlices
                    : [{ label: "Online", value: 0, color: "#34d399" }]
                }
                size={96}
                thickness={7}
                centerValue={totalAssigned}
                centerLabel="gesamt"
              />
              <ChartLegend
                slices={
                  statusSlices.length
                    ? statusSlices
                    : [{ label: "Online", value: 0, color: "#34d399" }]
                }
              />
            </div>
          )}
        </article>
        <article className="panel dash-chart-card">
          <div className="dash-chart-head">
            <div>
              <h3>Meldungen</h3>
              <p className="muted">Nach Art</p>
            </div>
          </div>
          {loading ? (
            <p className="empty">Lade…</p>
          ) : issueBars.length === 0 ? (
            <p className="empty">Keine ausgelösten Warnungen.</p>
          ) : (
            <HBarChart items={issueBars} />
          )}
        </article>
      </section>

      <section className="panel mon-panel">
        <div className="section-head row-between">
          <div className="page-head-title">
            <h2>Aktuelle Meldungen</h2>
            <HelpHint text="Störungen, Offline und Agent-Hinweise. Klick öffnet das Gerät, die Nummer das Ticket." />
          </div>
          <span className={`mon-count-badge${messages.length > 0 ? " is-warn" : ""}`}>
            {loading ? "…" : messages.length}
          </span>
        </div>
        {loading ? (
          <p className="empty">Lade…</p>
        ) : messages.length === 0 ? (
          <p className="mon-warn-empty">Keine offenen Meldungen. Die Geräte liegen innerhalb der Schwellen.</p>
        ) : (
          <ul className="mon-alert-feed">
            {messages.map((m) => (
              <li key={m.key}>
                <MonitoringAlertItem
                  title={m.title}
                  subtitle={m.subtitle}
                  kindLabel={m.kindLabel}
                  tone={m.tone}
                  chips={m.chips}
                  seen={m.seen}
                  tickets={m.tickets}
                  href={m.href}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel mon-panel">
        <div className="section-head">
          <h2>Geräte</h2>
          <p>
            {visibleDevices.length + visibleWaiting.length} von {devices.length + waiting}{" "}
            {devices.length + waiting === 1 ? "Eintrag" : "Einträgen"}
          </p>
        </div>

        <div className="mon-cust-toolbar">
          <label className="mon-cust-search">
            <span className="mon-cust-search-icon" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="11" cy="11" r="6.5" />
                <path d="M16.2 16.2 21 21" strokeLinecap="round" />
              </svg>
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Gerät, Hostname oder IP…"
              aria-label="Geräte suchen"
            />
            {query ? (
              <button
                type="button"
                className="mon-cust-search-clear"
                aria-label="Suche leeren"
                onClick={() => setQuery("")}
              >
                ×
              </button>
            ) : null}
          </label>
          <div className="mon-customer-switch" aria-label="Geräte filtern">
            {filters.map((f) =>
              f.count === 0 && f.id !== "all" ? null : (
                <button
                  key={f.id}
                  type="button"
                  className={`chip${filter === f.id ? " chip-active" : ""}${f.id === "warn" && f.count > 0 ? " mon-chip-warn" : ""}`}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                  <span className="mon-chip-count">{f.count}</span>
                </button>
              ),
            )}
          </div>
        </div>

        {loading ? (
          <p className="empty">Lade…</p>
        ) : visibleDevices.length === 0 && visibleWaiting.length === 0 ? (
          <p className="empty">
            {query.trim() || filter !== "all"
              ? "Keine Geräte zu dieser Suche."
              : "Keine Monitoring-Geräte. Im Inventar Monitoring aktivieren und den Agenten zuordnen."}
          </p>
        ) : (
          <ul className="mon-cust-device-list">
            {visibleDevices.map((d) => (
              <li key={d.agentId}>
                <DeviceRow device={d} active={d.assetId === assetId} customerId={customerId} />
              </li>
            ))}
            {visibleWaiting.map((a) => (
              <li key={a.id}>
                <div className="mon-cust-device-row is-waiting">
                  <span className="mon-dot" aria-hidden />
                  <div className="mon-cust-device-main">
                    <strong>{a.name}</strong>
                    <p className="muted">{a.hostname || "–"} · wartet auf Agent</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {detail && assetId ? (
        <div ref={detailRef}>
          <MonitoringDeviceDetail
            key={detail.device.assetId ?? detail.device.agentId}
            detail={detail}
            rangeDays={rangeDays}
            onRange={setRangeDays}
            onSaveAlerts={(cfg) => {
              if (detail.device.assetId) void saveAlerts(detail.device.assetId, cfg);
            }}
            onRequestUpdate={requestAgentUpdate}
            onRequestUninstall={requestAgentUninstall}
            updateBusy={busyId === detail.device.assetId}
            uninstallBusy={busyId === detail.device.agentId}
            backTo={customerPath(customerId)}
          />
        </div>
      ) : null}
    </div>
  );
}

function DeviceRow({
  device,
  active,
  customerId,
}: {
  device: MonitoringDeviceSummary;
  active: boolean;
  customerId: string;
}) {
  return (
    <article className={`mon-cust-device-row${active ? " is-active" : ""}${device.warning ? " is-warn" : ""}`}>
      {device.assetId ? (
        <Link className="mon-cust-device-open" to={customerPath(customerId, device.assetId)}>
          <DeviceRowBody device={device} />
        </Link>
      ) : (
        <div className="mon-cust-device-open">
          <DeviceRowBody device={device} />
        </div>
      )}
      {(device.tickets ?? []).length > 0 ? (
        <div className="mon-warn-tickets">
          {(device.tickets ?? []).map((t) => (
            <Link key={t.ticketId} className="mon-warn-ticket" to={`/tickets/${t.ticketId}`}>
              {t.ticketNumber}
              <span>{t.diskId ?? monitoringIssueLabel[t.kind]}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function DeviceRowBody({ device }: { device: MonitoringDeviceSummary }) {
  return (
    <>
      <span
        className={`mon-dot${device.warning ? " is-warn" : device.online ? " is-on" : " is-off"}`}
        aria-hidden
      />
      <div className="mon-cust-device-main">
        <strong>{device.assetName}</strong>
        <p className="muted">
          {[device.hostname || device.ipAddress, device.online ? "online" : "offline", device.agentOutdated ? "Update" : ""]
            .filter(Boolean)
            .join(" · ")}
          {device.lastSeenAt ? ` · ${relSeen(device.lastSeenAt)}` : ""}
        </p>
        {device.warning ? (
          <div className="mon-warn-chips">
            {deviceIssueChips(device).map((label) => (
              <span key={label} className="mon-issue-chip">
                {label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <dl className="mon-cust-device-metrics">
        <div>
          <dt>CPU</dt>
          <dd>{pct(device.cpuPercent)}</dd>
        </div>
        <div>
          <dt>RAM</dt>
          <dd>{pct(device.ramPercent)}</dd>
        </div>
        <div>
          <dt>Disk</dt>
          <dd>{pct(device.diskUsedPct)}</dd>
        </div>
      </dl>
    </>
  );
}
