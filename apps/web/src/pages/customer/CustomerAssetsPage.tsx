import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../api";
import { AssetFacts } from "../../components/AssetFacts";
import { AssetTypeFields } from "../../components/AssetTypeFields";
import { Checkbox } from "../../components/Checkbox";
import {
  MonitoringAlertConfigFields,
  monitoringAlertEnabledCount,
  monitoringAlertSummary,
} from "../../components/MonitoringAlertConfigFields";
import { Modal } from "../../components/Modal";
import {
  assetKindDetailRows,
  assetKindShowsMonitoring,
  assetNamePlaceholder,
} from "../../lib/assetFields";
import {
  assetKindLabel,
  assetOwnershipFilterLabel,
  assetOwnershipLabel,
  assetStatusLabel,
  ticketPriorityLabel,
} from "../../lib/labels";
import type { Asset, AssetKind, AssetOwnership, AssetStatus, MonitoringAlertConfig } from "../../types";
import { emptyMonitoringAlertConfig, monitoringIssueKinds } from "../../types";

type AssetForm = {
  name: string;
  kind: AssetKind;
  ownership: AssetOwnership;
  status: AssetStatus;
  location: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  hostname: string;
  ipAddress: string;
  secondaryIp: string;
  macAddress: string;
  vlan: string;
  rack: string;
  os: string;
  firmware: string;
  cpu: string;
  ramGb: string;
  diskGb: string;
  ports: string;
  role: string;
  managementUrl: string;
  purchaseDate: string;
  installedAt: string;
  responsiblePerson: string;
  warrantyUntil: string;
  notes: string;
  portalVisible: boolean;
  monitoringEnabled: boolean;
  monitoringAlerts: MonitoringAlertConfig;
};

const emptyAsset: AssetForm = {
  name: "",
  kind: "pc",
  ownership: "customer",
  status: "active",
  location: "",
  manufacturer: "",
  model: "",
  serialNumber: "",
  hostname: "",
  ipAddress: "",
  secondaryIp: "",
  macAddress: "",
  vlan: "",
  rack: "",
  os: "",
  firmware: "",
  cpu: "",
  ramGb: "",
  diskGb: "",
  ports: "",
  role: "",
  managementUrl: "",
  purchaseDate: "",
  installedAt: "",
  responsiblePerson: "",
  warrantyUntil: "",
  notes: "",
  portalVisible: false,
  monitoringEnabled: false,
  monitoringAlerts: emptyMonitoringAlertConfig(false),
};

function assetToForm(asset: Asset): AssetForm {
  return {
    name: asset.name,
    kind: asset.kind,
    ownership: asset.ownership ?? "customer",
    status: asset.status ?? "active",
    location: asset.location ?? "",
    manufacturer: asset.manufacturer ?? "",
    model: asset.model ?? "",
    serialNumber: asset.serialNumber ?? "",
    hostname: asset.hostname ?? "",
    ipAddress: asset.ipAddress ?? "",
    secondaryIp: asset.secondaryIp ?? "",
    macAddress: asset.macAddress ?? "",
    vlan: asset.vlan ?? "",
    rack: asset.rack ?? "",
    os: asset.os ?? "",
    firmware: asset.firmware ?? "",
    cpu: asset.cpu ?? "",
    ramGb: asset.ramGb != null ? String(asset.ramGb) : "",
    diskGb: asset.diskGb != null ? String(asset.diskGb) : "",
    ports: asset.ports ?? "",
    role: asset.role ?? "",
    managementUrl: asset.managementUrl ?? "",
    purchaseDate: asset.purchaseDate ?? "",
    installedAt: asset.installedAt ?? "",
    responsiblePerson: asset.responsiblePerson ?? "",
    warrantyUntil: asset.warrantyUntil ?? "",
    notes: asset.notes ?? "",
    portalVisible: Boolean(asset.portalVisible),
    monitoringEnabled: Boolean(asset.monitoringEnabled),
    monitoringAlerts: asset.monitoringAlerts ?? emptyMonitoringAlertConfig(Boolean(asset.monitoringAlertEnabled)),
  };
}

function matchesQuery(asset: Asset, q: string) {
  if (!q) return true;
  const ownership = asset.ownership ?? "customer";
  const hay = [
    asset.name,
    asset.kind,
    assetKindLabel[asset.kind],
    ownership,
    assetOwnershipLabel[ownership],
    asset.status,
    assetStatusLabel[asset.status ?? "active"],
    asset.manufacturer,
    asset.model,
    asset.serialNumber,
    asset.hostname,
    asset.ipAddress,
    asset.macAddress,
    asset.location,
    asset.vlan,
    asset.os,
    asset.cpu,
    asset.firmware,
    asset.role,
    asset.notes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

type PreviewRow = { label: string; value: string; mono?: boolean; href?: string };

function assetPreviewRows(asset: Asset): PreviewRow[] {
  const rows: Array<PreviewRow | null> = [
    ...assetKindDetailRows(asset, { notes: true }),
    monitoringAlertPreview(asset),
  ];
  return rows.filter((r): r is PreviewRow => Boolean(r));
}

const monitoringKindPreviewLabel: Record<string, string> = {
  offline: "Offline",
  disk: "Datenträger",
  cpu: "CPU",
  ram: "RAM",
  eventlog: "Ereignisse",
  updates: "Updates",
  smart: "SMART",
  services: "Dienste",
  reboot: "Neustart",
  defender: "Antivirus",
  firewall: "Firewall",
  crash: "Absturz",
  lan: "Netz",
};

function monitoringAlertPreview(asset: Asset): PreviewRow | null {
  if (!asset.monitoringEnabled) return null;
  const cfg = asset.monitoringAlerts ?? emptyMonitoringAlertConfig(Boolean(asset.monitoringAlertEnabled));
  const enabled = monitoringIssueKinds.filter((kind) => cfg[kind].enabled);
  if (enabled.length === 0) {
    return { label: "Warnungen", value: "Keine Typen aktiv — nur Status, keine Tickets" };
  }
  return {
    label: "Warnungen",
    value: enabled
      .map((kind) => `${monitoringKindPreviewLabel[kind]} (${ticketPriorityLabel[cfg[kind].priority]})`)
      .join(" · "),
  };
}

/**
 * Inventar eines Kunden: Geräte, Lizenzen, Software, Leihgaben und verwahrte Kundengeräte.
 * Liste kompakt; Details in Vorschau-Modal, Anlegen/Bearbeiten im Formular-Modal.
 */
export function CustomerAssetsPage() {
  const { id = "" } = useParams();
  const [assetList, setAssetList] = useState<Asset[]>([]);
  const [assetForm, setAssetForm] = useState<AssetForm>(emptyAsset);
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<Asset | null>(null);
  const [q, setQ] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | AssetKind>("all");
  const [ownershipFilter, setOwnershipFilter] = useState<"all" | AssetOwnership>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | AssetStatus>("all");
  const [groupByKind, setGroupByKind] = useState(true);
  const [error, setError] = useState("");
  const [alertFieldsOpen, setAlertFieldsOpen] = useState(false);

  async function reload() {
    setAssetList(await api.assets(id));
  }

  useEffect(() => {
    void reload();
  }, [id]);

  useEffect(() => {
    setPreview((current) => {
      if (!current) return null;
      return assetList.find((a) => a.id === current.id) ?? null;
    });
  }, [assetList]);

  function closeForm() {
    setFormMode(null);
    setEditingId(null);
    setAssetForm(emptyAsset);
    setAlertFieldsOpen(false);
    setError("");
  }

  function startCreate() {
    setPreview(null);
    setEditingId(null);
    setAssetForm(emptyAsset);
    setFormMode("create");
    setAlertFieldsOpen(false);
    setError("");
  }

  function startEdit(asset: Asset) {
    setPreview(null);
    setEditingId(asset.id);
    setAssetForm(assetToForm(asset));
    setFormMode("edit");
    setAlertFieldsOpen(false);
    setError("");
  }

  async function saveAsset(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      if (editingId) {
        await api.updateAsset(editingId, assetForm);
      } else {
        await api.createAsset(id, assetForm);
      }
      closeForm();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    }
  }

  async function removeAsset(asset: Asset) {
    if (!window.confirm(`Inventar-Eintrag „${asset.name}“ wirklich löschen?`)) return;
    await api.deleteAsset(asset.id);
    if (editingId === asset.id) closeForm();
    if (preview?.id === asset.id) setPreview(null);
    await reload();
  }

  const stats = useMemo(() => {
    const active = assetList.filter((a) => (a.status ?? "active") === "active").length;
    const loaned = assetList.filter((a) => (a.ownership ?? "customer") === "loaned").length;
    const held = assetList.filter((a) => (a.ownership ?? "customer") === "held").length;
    const licenses = assetList.filter((a) => a.kind === "license" || a.kind === "software").length;
    return { total: assetList.length, active, loaned, held, licenses };
  }, [assetList]);

  const kindCounts = useMemo(() => {
    const map = new Map<AssetKind, number>();
    for (const a of assetList) {
      map.set(a.kind, (map.get(a.kind) ?? 0) + 1);
    }
    return map;
  }, [assetList]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return assetList.filter((a) => {
      if (kindFilter !== "all" && a.kind !== kindFilter) return false;
      if (ownershipFilter !== "all" && (a.ownership ?? "customer") !== ownershipFilter) return false;
      if (statusFilter !== "all" && (a.status ?? "active") !== statusFilter) return false;
      return matchesQuery(a, query);
    });
  }, [assetList, q, kindFilter, ownershipFilter, statusFilter]);

  const groups = useMemo(() => {
    if (!groupByKind) return [{ kind: null as AssetKind | null, items: filtered }];
    const order = Object.keys(assetKindLabel) as AssetKind[];
    const byKind = new Map<AssetKind, Asset[]>();
    for (const a of filtered) {
      const list = byKind.get(a.kind) ?? [];
      list.push(a);
      byKind.set(a.kind, list);
    }
    return order
      .filter((k) => byKind.has(k))
      .map((k) => ({ kind: k, items: byKind.get(k)! }));
  }, [filtered, groupByKind]);

  const previewRows = preview ? assetPreviewRows(preview) : [];
  const previewOwnership = preview?.ownership ?? "customer";
  const previewStatus = preview?.status ?? "active";

  function openPreview(asset: Asset) {
    setPreview(asset);
  }

  return (
    <section className="section">
      <div className="section-head row-between">
        <div>
          <h2>Inventar</h2>
          <p>
            Geräte, Lizenzen und Software – Kundeneigentum, von dir verliehen oder Kundengeräte bei
            dir.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={startCreate}>
          + Eintrag
        </button>
      </div>

      {stats.total > 0 ? (
        <div className="stat-strip asset-stat-strip">
          <div className="stat-chip">
            <strong>{stats.total}</strong>
            <span>Gesamt</span>
          </div>
          <div className="stat-chip">
            <strong>{stats.active}</strong>
            <span>Aktiv</span>
          </div>
          <div className="stat-chip">
            <strong>{stats.loaned}</strong>
            <span>Verliehen</span>
          </div>
          <div className="stat-chip">
            <strong>{stats.held}</strong>
            <span>Bei uns</span>
          </div>
          <div className="stat-chip">
            <strong>{stats.licenses}</strong>
            <span>Lizenz / Software</span>
          </div>
        </div>
      ) : null}

      <div className="panel asset-filters">
        <div className="asset-filters-top">
          <label className="asset-filters-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <circle cx="11" cy="11" r="6.5" />
              <path d="M16.2 16.2 20 20" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              placeholder="Name, IP, Hostname, S/N, Standort…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Inventar durchsuchen"
            />
          </label>
          <button
            type="button"
            className={`asset-view-toggle${groupByKind ? " is-active" : ""}`}
            onClick={() => setGroupByKind((v) => !v)}
            aria-pressed={groupByKind}
            title={groupByKind ? "Als flache Liste anzeigen" : "Nach Typ gruppieren"}
          >
            {groupByKind ? "Gruppiert" : "Liste"}
          </button>
        </div>

        <div className="asset-filter-chips">
          <div className="asset-chip-group" role="group" aria-label="Zuordnung">
            <span className="asset-chip-label">Zuordnung</span>
            <button
              type="button"
              className={ownershipFilter === "all" ? "is-active" : undefined}
              onClick={() => setOwnershipFilter("all")}
            >
              Alle
            </button>
            {(Object.keys(assetOwnershipFilterLabel) as AssetOwnership[]).map((o) => (
              <button
                key={o}
                type="button"
                className={ownershipFilter === o ? "is-active" : undefined}
                onClick={() => setOwnershipFilter(o)}
              >
                {assetOwnershipFilterLabel[o]}
                {o === "loaned" && stats.loaned ? ` · ${stats.loaned}` : ""}
                {o === "held" && stats.held ? ` · ${stats.held}` : ""}
              </button>
            ))}
          </div>

          <div className="asset-chip-group" role="group" aria-label="Status">
            <span className="asset-chip-label">Status</span>
            <button
              type="button"
              className={statusFilter === "all" ? "is-active" : undefined}
              onClick={() => setStatusFilter("all")}
            >
              Alle
            </button>
            {(Object.keys(assetStatusLabel) as AssetStatus[]).map((s) => (
              <button
                key={s}
                type="button"
                className={statusFilter === s ? "is-active" : undefined}
                onClick={() => setStatusFilter(s)}
              >
                {assetStatusLabel[s]}
              </button>
            ))}
          </div>

          <div className="asset-chip-group" role="group" aria-label="Typ">
            <span className="asset-chip-label">Typ</span>
            <button
              type="button"
              className={kindFilter === "all" ? "is-active" : undefined}
              onClick={() => setKindFilter("all")}
            >
              Alle
            </button>
            {(Object.keys(assetKindLabel) as AssetKind[])
              .filter((k) => (kindCounts.get(k) ?? 0) > 0 || kindFilter === k)
              .map((k) => (
                <button
                  key={k}
                  type="button"
                  className={kindFilter === k ? "is-active" : undefined}
                  onClick={() => setKindFilter(k)}
                >
                  {assetKindLabel[k]}
                  {kindCounts.get(k) ? ` · ${kindCounts.get(k)}` : ""}
                </button>
              ))}
          </div>
        </div>
      </div>

      {assetList.length === 0 ? (
        <p className="empty">
          Noch kein Inventar. Lege Kundengeräte, verliehene Hardware/Software oder Lizenzen an.
        </p>
      ) : filtered.length === 0 ? (
        <p className="empty">Keine Einträge für diese Filter.</p>
      ) : (
        <div className="asset-groups">
          {groups.map((group) => (
            <div key={group.kind ?? "flat"} className="asset-group">
              {group.kind ? (
                <h3 className="asset-group-title">
                  {assetKindLabel[group.kind]}
                  <span className="muted"> · {group.items.length}</span>
                </h3>
              ) : null}
              <ul className="list">
                {group.items.map((asset) => {
                  const status = asset.status ?? "active";
                  const ownership = asset.ownership ?? "customer";
                  return (
                    <li key={asset.id} className="list-row asset-row">
                      <button
                        type="button"
                        className="asset-open"
                        onClick={() => openPreview(asset)}
                      >
                        <div className="asset-title-row">
                          <strong>{asset.name}</strong>
                          <span className={`badge badge-ownership-${ownership}`}>
                            {assetOwnershipLabel[ownership]}
                          </span>
                          <span className={`badge badge-asset-${status}`}>
                            {assetStatusLabel[status]}
                          </span>
                          {!groupByKind ? (
                            <span className="badge badge-kind">{assetKindLabel[asset.kind]}</span>
                          ) : null}
                          {asset.monitoringEnabled ? (
                            <span
                              className={`mon-inline-dot${asset.monitoringOnline ? " is-on" : asset.monitoringAgentId ? " is-off" : ""}`}
                              title={
                                asset.monitoringOnline
                                  ? "Monitoring online"
                                  : asset.monitoringAgentId
                                    ? "Monitoring offline"
                                    : "Monitoring aktiv, kein Agent"
                              }
                            />
                          ) : null}
                        </div>
                        <AssetFacts asset={asset} />
                      </button>
                      <div className="list-actions asset-actions">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => startEdit(asset)}
                        >
                          Bearbeiten
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => void removeAsset(asset)}
                        >
                          Löschen
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={preview != null}
        title={preview?.name ?? "Gerät"}
        onClose={() => setPreview(null)}
        className="modal-wide modal-asset-preview"
      >
        {preview ? (
          <div className="asset-preview">
            <div className="asset-preview-badges">
              <span className="badge badge-kind">{assetKindLabel[preview.kind]}</span>
              <span className={`badge badge-ownership-${previewOwnership}`}>
                {assetOwnershipLabel[previewOwnership]}
              </span>
              <span className={`badge badge-asset-${previewStatus}`}>
                {assetStatusLabel[previewStatus]}
              </span>
              {preview.monitoringEnabled ? (
                <span className="badge">
                  Monitoring{" "}
                  {preview.monitoringOnline
                    ? "online"
                    : preview.monitoringAgentId
                      ? "offline"
                      : "ohne Agent"}
                </span>
              ) : null}
            </div>

            {previewRows.length ? (
              <dl className="asset-preview-grid">
                {previewRows.map((row) => (
                  <div key={row.label} className="asset-preview-field">
                    <dt>{row.label}</dt>
                    <dd className={row.mono ? "is-mono" : undefined}>
                      {row.href ? (
                        <a href={row.href} target="_blank" rel="noreferrer">
                          {row.value}
                        </a>
                      ) : (
                        row.value
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="empty">Keine weiteren Details hinterlegt.</p>
            )}

            <div className="form-actions modal-actions">
              <button type="button" className="btn btn-primary" onClick={() => startEdit(preview)}>
                Bearbeiten
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => void removeAsset(preview)}
              >
                Löschen
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setPreview(null)}>
                Schließen
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={formMode != null}
        title={formMode === "edit" ? "Eintrag bearbeiten" : "Neuer Inventar-Eintrag"}
        onClose={closeForm}
        showCloseButton={false}
        className="modal-wide modal-asset-form"
      >
        <form className="asset-form" onSubmit={saveAsset}>
          <section className="asset-form-block">
            <h4>Grunddaten</h4>
            <div className="asset-form-grid">
              <label className="field asset-form-span-2">
                <span>Bezeichnung *</span>
                <input
                  required
                  value={assetForm.name}
                  onChange={(e) => setAssetForm({ ...assetForm, name: e.target.value })}
                  placeholder={assetNamePlaceholder(assetForm.kind)}
                />
              </label>
              <label className="field">
                <span>Typ</span>
                <select
                  value={assetForm.kind}
                  onChange={(e) =>
                    setAssetForm({ ...assetForm, kind: e.target.value as AssetKind })
                  }
                >
                  {Object.entries(assetKindLabel).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Zuordnung</span>
                <select
                  value={assetForm.ownership}
                  onChange={(e) =>
                    setAssetForm({ ...assetForm, ownership: e.target.value as AssetOwnership })
                  }
                >
                  {Object.entries(assetOwnershipLabel).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Status</span>
                <select
                  value={assetForm.status}
                  onChange={(e) =>
                    setAssetForm({ ...assetForm, status: e.target.value as AssetStatus })
                  }
                >
                  {Object.entries(assetStatusLabel).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Standort</span>
                <input
                  value={assetForm.location}
                  onChange={(e) => setAssetForm({ ...assetForm, location: e.target.value })}
                  placeholder="Kunde / Werkstatt / Lager"
                />
              </label>
            </div>
          </section>

          <AssetTypeFields
            kind={assetForm.kind}
            values={assetForm}
            onChange={(id, value) => setAssetForm({ ...assetForm, [id]: value })}
          />

          {assetKindShowsMonitoring(assetForm.kind) ? (
          <section className="asset-form-block">
            <h4>Monitoring</h4>
            <p className="muted">
              Hostname, IP, MAC, Hersteller, Modell, Seriennummer, CPU, RAM, Speicher, OS und BIOS
              füllt der Agent automatisch, sobald er diesem Eintrag zugeordnet ist (leere Felder).
            </p>
            <div className="asset-form-grid">
              <div className="asset-form-span-2">
                <Checkbox
                  label="Monitoring aktivieren (Agent kann diesem Eintrag zugeordnet werden)"
                  checked={assetForm.monitoringEnabled}
                  onChange={(checked) =>
                    setAssetForm({
                      ...assetForm,
                      monitoringEnabled: checked,
                      monitoringAlerts: checked
                        ? assetForm.monitoringAlerts
                        : emptyMonitoringAlertConfig(false),
                    })
                  }
                />
              </div>
              {assetForm.monitoringEnabled ? (
                <div className="asset-form-span-2 mon-alert-form">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setAlertFieldsOpen((open) => !open)}
                  >
                    Warnungen konfigurieren
                    {monitoringAlertEnabledCount(assetForm.monitoringAlerts) ? (
                      <span className="mon-alert-btn-count">
                        {monitoringAlertEnabledCount(assetForm.monitoringAlerts)}
                      </span>
                    ) : null}
                  </button>
                  <p className="muted">
                    {monitoringAlertEnabledCount(assetForm.monitoringAlerts)
                      ? monitoringAlertSummary(assetForm.monitoringAlerts).join(" · ")
                      : "Keine Warnungen aktiv"}
                  </p>
                  {alertFieldsOpen ? (
                    <MonitoringAlertConfigFields
                      value={assetForm.monitoringAlerts}
                      onChange={(monitoringAlerts) => setAssetForm({ ...assetForm, monitoringAlerts })}
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          </section>
          ) : null}

          {error ? <p className="form-error">{error}</p> : null}
          <div className="form-actions modal-actions">
            <button className="btn btn-primary" type="submit">
              {formMode === "edit" ? "Änderungen speichern" : "Eintrag anlegen"}
            </button>
            <button className="btn btn-ghost" type="button" onClick={closeForm}>
              Abbrechen
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
