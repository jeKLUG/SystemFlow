import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api";
import { CustomerPicker } from "../../components/CustomerPicker";
import { ChartLegend, DonutChart, HBarChart } from "../../components/DashCharts";
import {
  deviceIssueChips,
  fleetCustomerMeta,
  monitoringIssueLabel,
  relSeen,
} from "../../lib/monitoringUi";
import type {
  MonitoringAssignableAsset,
  MonitoringDeviceSummary,
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

  function openProblem(p: MonitoringDeviceSummary) {
    if (p.customerId) navigate(customerHref(p.customerId, p.assetId));
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
            <p>Klick öffnet die Kundenseite und das Gerät</p>
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
          <ul className="mon-warn-list">
            {overview!.problems.map((p) => (
              <li key={p.agentId}>
                <article className="mon-warn-card">
                  <button
                    type="button"
                    className="mon-warn-card-main"
                    onClick={() => openProblem(p)}
                    aria-label={`${p.assetName} öffnen`}
                  >
                    <span className="mon-dot is-warn" aria-hidden />
                    <div className="mon-warn-card-body">
                      <div className="mon-warn-card-title">
                        <strong>{p.assetName}</strong>
                        <span className="muted">{relSeen(p.lastSeenAt)}</span>
                      </div>
                      <p className="muted">{p.customerName || "Ohne Kunde"}</p>
                      <div className="mon-warn-chips">
                        {deviceIssueChips(p).map((label) => (
                          <span key={label} className="mon-issue-chip">
                            {label}
                          </span>
                        ))}
                      </div>
                    </div>
                  </button>
                  {(p.tickets ?? []).length > 0 ? (
                    <div className="mon-warn-tickets">
                      {(p.tickets ?? []).map((t) => (
                        <Link key={t.ticketId} className="mon-warn-ticket" to={`/tickets/${t.ticketId}`}>
                          {t.ticketNumber}
                          <span>{t.diskId ?? monitoringIssueLabel[t.kind]}</span>
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </article>
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
            <p>Öffnet die Monitoring-Seite des Kunden mit Diagrammen und Geräteliste</p>
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
          <ul className="mon-customer-grid">
            {fleetCustomers.map((c) => (
              <li key={c.customerId}>
                <Link
                  className={`mon-customer-card${c.warning > 0 ? " is-warn" : ""}`}
                  to={customerHref(c.customerId)}
                >
                  <span className={`mon-dot${c.warning > 0 ? " is-warn" : c.offline > 0 ? " is-off" : " is-on"}`} aria-hidden />
                  <div>
                    <strong>{c.customerName}</strong>
                    <p className="muted">{fleetCustomerMeta(c)}</p>
                  </div>
                  {c.warning > 0 ? <span className="mon-customer-warn">{c.warning}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
