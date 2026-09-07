import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../api";
import { Modal } from "../../components/Modal";
import {
  assetKindLabel,
  assetOwnershipFilterLabel,
  assetOwnershipLabel,
  assetStatusLabel,
  formatDateOnly,
} from "../../lib/labels";
import type { Asset, AssetKind, AssetOwnership, AssetStatus } from "../../types";

type AssetForm = {
  name: string;
  kind: AssetKind;
  ownership: AssetOwnership;
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
  ownership: "customer",
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
    ownership: asset.ownership ?? "customer",
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
    asset.notes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

/** Kurze Zweitzeile für die Liste (max. zwei Hinweise). */
function assetListHint(asset: Asset): string {
  const hardware = [asset.manufacturer, asset.model].filter(Boolean).join(" ");
  const parts = [asset.location, asset.ipAddress || asset.hostname, hardware].filter(Boolean);
  return parts.slice(0, 2).join(" · ");
}

type PreviewRow = { label: string; value: string; mono?: boolean; href?: string };

function assetPreviewRows(asset: Asset): PreviewRow[] {
  const hardware = [asset.manufacturer, asset.model].filter(Boolean).join(" ");
  const rows: Array<PreviewRow | null> = [
    hardware ? { label: "Gerät", value: hardware } : null,
    asset.location ? { label: "Standort", value: asset.location } : null,
    asset.hostname ? { label: "Hostname", value: asset.hostname, mono: true } : null,
    asset.ipAddress ? { label: "IP-Adresse", value: asset.ipAddress, mono: true } : null,
    asset.macAddress ? { label: "MAC-Adresse", value: asset.macAddress, mono: true } : null,
    asset.vlan ? { label: "VLAN", value: asset.vlan } : null,
    asset.os ? { label: "OS / Version", value: asset.os } : null,
    asset.serialNumber ? { label: "Serien- / Lizenznr.", value: asset.serialNumber, mono: true } : null,
    asset.warrantyUntil
      ? { label: "Garantie / Laufzeit", value: formatDateOnly(asset.warrantyUntil) }
      : null,
    asset.managementUrl
      ? { label: "Portal", value: asset.managementUrl, href: asset.managementUrl }
      : null,
    asset.notes ? { label: "Notizen", value: asset.notes } : null,
  ];
  return rows.filter((r): r is PreviewRow => Boolean(r));
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
    setError("");
  }

  function startCreate() {
    setPreview(null);
    setEditingId(null);
    setAssetForm(emptyAsset);
    setFormMode("create");
    setError("");
  }

  function startEdit(asset: Asset) {
    setPreview(null);
    setEditingId(asset.id);
    setAssetForm(assetToForm(asset));
    setFormMode("edit");
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
          <input
            className="wiki-search asset-filters-search"
            type="search"
            placeholder="Suche Name, IP, Hostname, S/N, Lizenz, Standort…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Inventar durchsuchen"
          />
          <button
            type="button"
            className={`asset-view-toggle${groupByKind ? " is-active" : ""}`}
            onClick={() => setGroupByKind((v) => !v)}
            aria-pressed={groupByKind}
          >
            {groupByKind ? "Gruppiert nach Typ" : "Liste ohne Gruppen"}
          </button>
        </div>

        <div className="asset-filter-rows">
          <div className="asset-filter-row">
            <span className="asset-filter-label">Zuordnung</span>
            <div className="asset-seg" role="group" aria-label="Zuordnung">
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
          </div>

          <div className="asset-filter-row">
            <span className="asset-filter-label">Status</span>
            <div className="asset-seg" role="group" aria-label="Status">
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
          </div>

          <div className="asset-filter-row">
            <span className="asset-filter-label">Typ</span>
            <div className="asset-seg asset-seg-wrap" role="group" aria-label="Typ">
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
                  const hint = assetListHint(asset);
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
                        </div>
                        {hint ? <p className="asset-hint muted">{hint}</p> : null}
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
        className="modal-wide"
      >
        <form className="form-grid asset-form" onSubmit={saveAsset}>
          <p className="muted full asset-form-lead">
            z. B. Notebook des Kunden, verliehener Adapter, Software-Lizenz oder Gerät in deiner
            Werkstatt.
          </p>
          <label className="field">
            <span>Bezeichnung *</span>
            <input
              required
              value={assetForm.name}
              onChange={(e) => setAssetForm({ ...assetForm, name: e.target.value })}
              placeholder="z. B. NB-Müller / Office 365 / Leih-USV"
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
          <label className="field">
            <span>Hersteller</span>
            <input
              value={assetForm.manufacturer}
              onChange={(e) => setAssetForm({ ...assetForm, manufacturer: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Modell / Produkt</span>
            <input
              value={assetForm.model}
              onChange={(e) => setAssetForm({ ...assetForm, model: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Serien- / Lizenznummer</span>
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
              placeholder="optional"
            />
          </label>
          <label className="field">
            <span>IP-Adresse</span>
            <input
              value={assetForm.ipAddress}
              onChange={(e) => setAssetForm({ ...assetForm, ipAddress: e.target.value })}
              placeholder="optional"
            />
          </label>
          <label className="field">
            <span>MAC-Adresse</span>
            <input
              value={assetForm.macAddress}
              onChange={(e) => setAssetForm({ ...assetForm, macAddress: e.target.value })}
            />
          </label>
          <label className="field">
            <span>VLAN</span>
            <input
              value={assetForm.vlan}
              onChange={(e) => setAssetForm({ ...assetForm, vlan: e.target.value })}
            />
          </label>
          <label className="field">
            <span>OS / Version</span>
            <input
              value={assetForm.os}
              onChange={(e) => setAssetForm({ ...assetForm, os: e.target.value })}
              placeholder="Windows 11 / v3.2"
            />
          </label>
          <label className="field">
            <span>Portal- / Management-URL</span>
            <input
              value={assetForm.managementUrl}
              onChange={(e) => setAssetForm({ ...assetForm, managementUrl: e.target.value })}
              placeholder="https://…"
            />
          </label>
          <label className="field">
            <span>Garantie / Laufzeit bis</span>
            <input
              type="date"
              value={assetForm.warrantyUntil}
              onChange={(e) => setAssetForm({ ...assetForm, warrantyUntil: e.target.value })}
            />
          </label>
          <label className="field full">
            <span>Notizen</span>
            <textarea
              rows={3}
              value={assetForm.notes}
              onChange={(e) => setAssetForm({ ...assetForm, notes: e.target.value })}
              placeholder="Leihfrist, Zustand, Schlüssel, Lizenzkontingent…"
            />
          </label>
          {error ? <p className="form-error full">{error}</p> : null}
          <div className="full form-actions modal-actions">
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
