import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../api";
import {
  assetKindLabel,
  assetStatusLabel,
  formatDateOnly,
} from "../../lib/labels";
import type { Asset, AssetKind, AssetStatus } from "../../types";

type AssetForm = {
  name: string;
  kind: AssetKind;
  status: AssetStatus;
  manufacturer: string;
  model: string;
  serialNumber: string;
  hostname: string;
  ipAddress: string;
  macAddress: string;
  location: string;
  vlan: string;
  os: string;
  managementUrl: string;
  warrantyUntil: string;
  notes: string;
};

const emptyAsset: AssetForm = {
  name: "",
  kind: "pc",
  status: "active",
  manufacturer: "",
  model: "",
  serialNumber: "",
  hostname: "",
  ipAddress: "",
  macAddress: "",
  location: "",
  vlan: "",
  os: "",
  managementUrl: "",
  warrantyUntil: "",
  notes: "",
};

function assetToForm(asset: Asset): AssetForm {
  return {
    name: asset.name,
    kind: asset.kind,
    status: asset.status ?? "active",
    manufacturer: asset.manufacturer ?? "",
    model: asset.model ?? "",
    serialNumber: asset.serialNumber ?? "",
    hostname: asset.hostname ?? "",
    ipAddress: asset.ipAddress ?? "",
    macAddress: asset.macAddress ?? "",
    location: asset.location ?? "",
    vlan: asset.vlan ?? "",
    os: asset.os ?? "",
    managementUrl: asset.managementUrl ?? "",
    warrantyUntil: asset.warrantyUntil ?? "",
    notes: asset.notes ?? "",
  };
}

function matchesQuery(asset: Asset, q: string) {
  if (!q) return true;
  const hay = [
    asset.name,
    asset.kind,
    assetKindLabel[asset.kind],
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
    asset.notes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

/**
 * Anlagen-Inventar eines Kunden: Geräte, Netzwerk, Lizenzen.
 */
export function CustomerAssetsPage() {
  const { id = "" } = useParams();
  const [assetList, setAssetList] = useState<Asset[]>([]);
  const [assetForm, setAssetForm] = useState<AssetForm>(emptyAsset);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | AssetKind>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | AssetStatus>("all");
  const [groupByKind, setGroupByKind] = useState(true);
  const [error, setError] = useState("");

  async function reload() {
    setAssetList(await api.assets(id));
  }

  useEffect(() => {
    void reload();
  }, [id]);

  function resetForm() {
    setAssetForm(emptyAsset);
    setEditingId(null);
    setShowForm(false);
    setError("");
  }

  function startCreate() {
    setEditingId(null);
    setAssetForm(emptyAsset);
    setShowForm(true);
    setError("");
  }

  function startEdit(asset: Asset) {
    setEditingId(asset.id);
    setAssetForm(assetToForm(asset));
    setShowForm(true);
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
      resetForm();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    }
  }

  async function removeAsset(asset: Asset) {
    if (!window.confirm(`Anlage „${asset.name}“ wirklich löschen?`)) return;
    await api.deleteAsset(asset.id);
    if (editingId === asset.id) resetForm();
    await reload();
  }

  const stats = useMemo(() => {
    const active = assetList.filter((a) => (a.status ?? "active") === "active").length;
    const spare = assetList.filter((a) => a.status === "spare").length;
    const retired = assetList.filter((a) => a.status === "retired").length;
    const withIp = assetList.filter((a) => a.ipAddress).length;
    return { total: assetList.length, active, spare, retired, withIp };
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
      if (statusFilter !== "all" && (a.status ?? "active") !== statusFilter) return false;
      return matchesQuery(a, query);
    });
  }, [assetList, q, kindFilter, statusFilter]);

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

  return (
    <section className="section">
      <div className="section-head row-between">
        <div>
          <h2>Anlagen</h2>
          <p>Geräte, Netzwerk und Lizenzen – inkl. IP, Hostname und Standort.</p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            if (showForm && !editingId) resetForm();
            else startCreate();
          }}
        >
          {showForm && !editingId ? "Abbrechen" : "+ Anlage"}
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
            <strong>{stats.spare}</strong>
            <span>Ersatz / Lager</span>
          </div>
          <div className="stat-chip">
            <strong>{stats.withIp}</strong>
            <span>Mit IP</span>
          </div>
        </div>
      ) : null}

      <div className="wiki-toolbar asset-toolbar">
        <input
          className="wiki-search"
          type="search"
          placeholder="Suche Name, IP, Hostname, S/N, Standort…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="filter-chips">
          <button
            type="button"
            className={`chip ${statusFilter === "all" ? "chip-active" : ""}`}
            onClick={() => setStatusFilter("all")}
          >
            Alle Status
          </button>
          {(Object.keys(assetStatusLabel) as AssetStatus[]).map((s) => (
            <button
              key={s}
              type="button"
              className={`chip ${statusFilter === s ? "chip-active" : ""}`}
              onClick={() => setStatusFilter(s)}
            >
              {assetStatusLabel[s]}
              {s === "active" && stats.active ? ` (${stats.active})` : ""}
              {s === "spare" && stats.spare ? ` (${stats.spare})` : ""}
              {s === "retired" && stats.retired ? ` (${stats.retired})` : ""}
            </button>
          ))}
          <button
            type="button"
            className={`chip ${groupByKind ? "chip-active" : ""}`}
            onClick={() => setGroupByKind((v) => !v)}
          >
            Nach Typ gruppieren
          </button>
        </div>
        <div className="filter-chips">
          <button
            type="button"
            className={`chip ${kindFilter === "all" ? "chip-active" : ""}`}
            onClick={() => setKindFilter("all")}
          >
            Alle Typen
          </button>
          {(Object.keys(assetKindLabel) as AssetKind[])
            .filter((k) => (kindCounts.get(k) ?? 0) > 0 || kindFilter === k)
            .map((k) => (
              <button
                key={k}
                type="button"
                className={`chip ${kindFilter === k ? "chip-active" : ""}`}
                onClick={() => setKindFilter(k)}
              >
                {assetKindLabel[k]}
                {kindCounts.get(k) ? ` (${kindCounts.get(k)})` : ""}
              </button>
            ))}
        </div>
      </div>

      {showForm ? (
        <form className="panel form-grid asset-form" onSubmit={saveAsset}>
          <div className="full asset-form-title">
            <strong>{editingId ? "Anlage bearbeiten" : "Neue Anlage"}</strong>
          </div>
          <label className="field">
            <span>Name *</span>
            <input
              required
              value={assetForm.name}
              onChange={(e) => setAssetForm({ ...assetForm, name: e.target.value })}
              placeholder="z. B. FW-Hauptsitz / NB-Müller"
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
              placeholder="Serverraum / EG / Homeoffice"
            />
          </label>
          <label className="field">
            <span>Hersteller</span>
            <input
              value={assetForm.manufacturer}
              onChange={(e) => setAssetForm({ ...assetForm, manufacturer: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Modell</span>
            <input
              value={assetForm.model}
              onChange={(e) => setAssetForm({ ...assetForm, model: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Seriennummer</span>
            <input
              value={assetForm.serialNumber}
              onChange={(e) => setAssetForm({ ...assetForm, serialNumber: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Hostname</span>
            <input
              value={assetForm.hostname}
              onChange={(e) => setAssetForm({ ...assetForm, hostname: e.target.value })}
              placeholder="srv-file-01"
            />
          </label>
          <label className="field">
            <span>IP-Adresse</span>
            <input
              value={assetForm.ipAddress}
              onChange={(e) => setAssetForm({ ...assetForm, ipAddress: e.target.value })}
              placeholder="192.168.10.1"
            />
          </label>
          <label className="field">
            <span>MAC-Adresse</span>
            <input
              value={assetForm.macAddress}
              onChange={(e) => setAssetForm({ ...assetForm, macAddress: e.target.value })}
              placeholder="AA:BB:CC:DD:EE:FF"
            />
          </label>
          <label className="field">
            <span>VLAN</span>
            <input
              value={assetForm.vlan}
              onChange={(e) => setAssetForm({ ...assetForm, vlan: e.target.value })}
              placeholder="10 / Clients"
            />
          </label>
          <label className="field">
            <span>Betriebssystem</span>
            <input
              value={assetForm.os}
              onChange={(e) => setAssetForm({ ...assetForm, os: e.target.value })}
              placeholder="Windows 11 / pfSense"
            />
          </label>
          <label className="field">
            <span>Management-URL</span>
            <input
              value={assetForm.managementUrl}
              onChange={(e) => setAssetForm({ ...assetForm, managementUrl: e.target.value })}
              placeholder="https://…"
            />
          </label>
          <label className="field">
            <span>Garantie bis</span>
            <input
              type="date"
              value={assetForm.warrantyUntil}
              onChange={(e) => setAssetForm({ ...assetForm, warrantyUntil: e.target.value })}
            />
          </label>
          <label className="field full">
            <span>Notizen</span>
            <textarea
              rows={2}
              value={assetForm.notes}
              onChange={(e) => setAssetForm({ ...assetForm, notes: e.target.value })}
            />
          </label>
          {error ? <p className="form-error full">{error}</p> : null}
          <div className="full form-actions">
            <button className="btn btn-primary" type="submit">
              {editingId ? "Änderungen speichern" : "Anlage anlegen"}
            </button>
            <button className="btn btn-ghost" type="button" onClick={resetForm}>
              Abbrechen
            </button>
          </div>
        </form>
      ) : null}

      {assetList.length === 0 ? (
        <p className="empty">Noch keine Anlagen. Lege Server, Clients, Switches oder Lizenzen an.</p>
      ) : filtered.length === 0 ? (
        <p className="empty">Keine Anlagen für diese Filter.</p>
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
                  const hardware = [asset.manufacturer, asset.model].filter(Boolean).join(" ");
                  return (
                    <li key={asset.id} className="list-row asset-row">
                      <div className="asset-main">
                        <div className="asset-title-row">
                          <strong>{asset.name}</strong>
                          <span className={`badge badge-asset-${status}`}>
                            {assetStatusLabel[status]}
                          </span>
                          {!groupByKind ? (
                            <span className="badge badge-kind">{assetKindLabel[asset.kind]}</span>
                          ) : null}
                        </div>
                        <div className="asset-meta">
                          {hardware ? <span>{hardware}</span> : null}
                          {asset.hostname ? (
                            <span>
                              <em>Host</em> {asset.hostname}
                            </span>
                          ) : null}
                          {asset.ipAddress ? (
                            <span className="asset-ip">
                              <em>IP</em> {asset.ipAddress}
                            </span>
                          ) : null}
                          {asset.macAddress ? (
                            <span>
                              <em>MAC</em> {asset.macAddress}
                            </span>
                          ) : null}
                          {asset.vlan ? (
                            <span>
                              <em>VLAN</em> {asset.vlan}
                            </span>
                          ) : null}
                          {asset.location ? (
                            <span>
                              <em>Ort</em> {asset.location}
                            </span>
                          ) : null}
                          {asset.os ? (
                            <span>
                              <em>OS</em> {asset.os}
                            </span>
                          ) : null}
                          {asset.serialNumber ? (
                            <span>
                              <em>S/N</em> {asset.serialNumber}
                            </span>
                          ) : null}
                          {asset.warrantyUntil ? (
                            <span>
                              <em>Garantie</em> {formatDateOnly(asset.warrantyUntil)}
                            </span>
                          ) : null}
                        </div>
                        {asset.managementUrl ? (
                          <a
                            className="asset-link"
                            href={asset.managementUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Management öffnen
                          </a>
                        ) : null}
                        {asset.notes ? <p className="asset-notes muted">{asset.notes}</p> : null}
                      </div>
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
    </section>
  );
}
