import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api";
import { CustomerPicker } from "../../components/CustomerPicker";
import { ChartLegend, DonutChart, HBarChart } from "../../components/DashCharts";
import { MonitoringAlertItem } from "../../components/MonitoringAlertItem";
import {
  deviceIssueChips,
  relSeen,
} from "../../lib/monitoringUi";
import type {
  MonitoringAssignableAsset,
  MonitoringOverview,
  MonitoringPendingAgent,
} from "../../types";

function customerHref(customerId: string, assetId?: string | null) {
  return assetId
    ? `/monitoring/customers/${customerId}/devices/${assetId}`
    : `/monitoring/customers/${customerId}`;
}

/**
 * Staff-Monitoring: Flotte, Warnungen und Einstieg in die Kundenseiten.
 */
export function MonitoringPage() {
  const navigate = useNavigate();
  const [overview, setOverview] = useState<MonitoringOverview | null>(null);
  const [pending, setPending] = useState<MonitoringPendingAgent[]>([]);
  const [assignable, setAssignable] = useState<MonitoringAssignableAsset[]>([]);
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

  const slices = useMemo(() => {
    if (!overview) return [];
    return [
      { label: "Online", value: overview.online, color: "#34d399" },
      { label: "Offline", value: overview.offline, color: "#94a3b8" },
      { label: "Warnung", value: overview.warning, color: "#f87171" },
    ].filter((s) => s.value > 0);
  }, [overview]);

  const fleetCustomers = useMemo(() => {
    return [...(overview?.byCustomer ?? [])].sort((a, b) => {
      if (b.warning !== a.warning) return b.warning - a.warning;
      return a.customerName.localeCompare(b.customerName, "de");
    });
  }, [overview]);

  function openCustomer(nextId: string) {
    if (!nextId) return;
    navigate(customerHref(nextId));
  }

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

  return (
    <div className="page monitoring-page">
      <header className="dashboard-hero">
        <div>
          <p className="eyebrow">Flotte</p>
          <h2>Monitoring</h2>
          <p className="muted">Live-Status der Agenten, Zuordnung zum Inventar und Einstieg je Kunde.</p>
        </div>
        <Link className="btn btn-ghost" to="/monitoring/setup">
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
                  href: customerHref(c.customerId),
                }))}
            />
          )}
        </article>
      </section>

      <section className="panel mon-panel" aria-label="Aktive Warnungen">
        <div className="section-head row-between">
          <div>
            <h2>Aktive Warnungen</h2>
            <p>Zum Kunden, Gerät oder Ticket springen</p>
          </div>
          <span className={`mon-count-badge${(overview?.problems.length ?? 0) > 0 ? " is-warn" : ""}`}>
            {loading ? "…" : overview?.problems.length ?? 0}
          </span>
        </div>
        {loading ? (
          <p className="empty">Lade…</p>
        ) : (overview?.problems.length ?? 0) === 0 ? (
          <p className="mon-warn-empty">Keine aktiven Warnungen. Die Flotte liegt innerhalb der Schwellen.</p>
        ) : (
          <ul className="mon-alert-feed">
            {overview!.problems.map((p) => (
              <li key={p.agentId}>
                <MonitoringAlertItem
                  title={p.assetName}
                  subtitle={p.customerName || "Ohne Kunde"}
                  kindLabel="Warnung"
                  tone="warn"
                  chips={deviceIssueChips(p)}
                  seen={relSeen(p.lastSeenAt)}
                  tickets={p.tickets}
                  href={p.customerId ? customerHref(p.customerId, p.assetId) : undefined}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

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

      <section className="panel mon-panel" id="mon-fleet" aria-label="Kunden">
        <div className="section-head row-between">
          <div>
            <h2>Kunden</h2>
            <p>Monitoring-Seite mit Diagrammen und Geräten</p>
          </div>
          <CustomerPicker
            className="mon-customer-picker"
            value=""
            onChange={openCustomer}
            allowEmpty
            emptyLabel="Kunde suchen…"
            compact
            placeholder="Kunde suchen…"
          />
        </div>

        {loading ? (
          <p className="empty">Lade…</p>
        ) : fleetCustomers.length === 0 ? (
          <p className="empty">
            Noch keine zugeordneten Geräte. Oben einen Agenten zuordnen oder einen Kunden suchen.
          </p>
        ) : (
          <ul className="mon-customer-feed">
            {fleetCustomers.map((c) => {
              const total = c.online + c.offline;
              const tone = c.warning > 0 ? "warn" : c.offline > 0 ? "off" : "ok";
              return (
                <li key={c.customerId}>
                  <Link className={`mon-customer-row is-${tone}`} to={customerHref(c.customerId)}>
                    <span
                      className={`mon-dot${tone === "warn" ? " is-warn" : tone === "off" ? " is-off" : " is-on"}`}
                      aria-hidden
                    />
                    <div className="mon-customer-row-copy">
                      <span className="mon-customer-row-kind">
                        {tone === "warn" ? "Warnung" : tone === "off" ? "Offline" : "Online"}
                      </span>
                      <strong>{c.customerName}</strong>
                    </div>
                    <dl className="mon-customer-row-stats">
                      <div>
                        <dt>Geräte</dt>
                        <dd>{total}</dd>
                      </div>
                      <div>
                        <dt>Online</dt>
                        <dd>{c.online}</dd>
                      </div>
                      {c.offline > 0 ? (
                        <div>
                          <dt>Offline</dt>
                          <dd>{c.offline}</dd>
                        </div>
                      ) : null}
                      <div className={c.warning > 0 ? "is-warn" : undefined}>
                        <dt>Warnungen</dt>
                        <dd>{c.warning}</dd>
                      </div>
                    </dl>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
