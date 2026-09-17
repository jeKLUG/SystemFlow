import { useMemo, useState, useEffect } from "react";
import { api } from "../../api";
import { AssetFacts } from "../../components/AssetFacts";
import {
  assetKindLabel,
  assetOwnershipLabel,
  assetStatusLabel,
  formatDateOnly,
} from "../../lib/labels";
import type { Asset, AssetKind, AssetOwnership, AssetStatus } from "../../types";

type PreviewRow = { label: string; value: string; mono?: boolean; href?: string };

function normalizeHref(raw: string): string {
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

/** Alle kundenrelevanten Felder, ohne interne Notizen. */
function portalAssetRows(asset: Asset): PreviewRow[] {
  const hardware = [asset.manufacturer, asset.model].filter(Boolean).join(" ");
  const specs = [
    asset.cpu,
    asset.ramGb != null ? `${asset.ramGb} GB RAM` : null,
    asset.diskGb != null ? `${asset.diskGb} GB Speicher` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const rows: Array<PreviewRow | null> = [
    hardware ? { label: "Gerät", value: hardware } : null,
    asset.role ? { label: "Rolle", value: asset.role } : null,
    specs ? { label: "Ausstattung", value: specs } : null,
    asset.location ? { label: "Standort", value: asset.location } : null,
    asset.rack ? { label: "Rack / Platz", value: asset.rack } : null,
    asset.hostname ? { label: "Hostname", value: asset.hostname, mono: true } : null,
    asset.ipAddress ? { label: "IP-Adresse", value: asset.ipAddress, mono: true } : null,
    asset.secondaryIp ? { label: "Weitere IP", value: asset.secondaryIp, mono: true } : null,
    asset.macAddress ? { label: "MAC-Adresse", value: asset.macAddress, mono: true } : null,
    asset.vlan ? { label: "VLAN", value: asset.vlan } : null,
    asset.ports ? { label: "Ports", value: asset.ports } : null,
    asset.os ? { label: "OS / Version", value: asset.os } : null,
    asset.firmware ? { label: "Firmware", value: asset.firmware } : null,
    asset.serialNumber ? { label: "Serien- / Lizenznr.", value: asset.serialNumber, mono: true } : null,
    asset.responsiblePerson ? { label: "Ansprechpartner", value: asset.responsiblePerson } : null,
    asset.purchaseDate ? { label: "Kaufdatum", value: formatDateOnly(asset.purchaseDate) } : null,
    asset.installedAt ? { label: "Installiert am", value: formatDateOnly(asset.installedAt) } : null,
    asset.warrantyUntil
      ? { label: "Garantie / Laufzeit", value: formatDateOnly(asset.warrantyUntil) }
      : null,
    asset.managementUrl
      ? { label: "Management-URL", value: asset.managementUrl, href: normalizeHref(asset.managementUrl) }
      : null,
  ];
  return rows.filter((r): r is PreviewRow => Boolean(r));
}

/**
 * Opt-in Inventar im Portal: Liste mit aufklappbaren Gerätedetails (ohne interne Notizen).
 */
export function PortalAssetsPage() {
  const [rows, setRows] = useState<Asset[]>([]);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    void api
      .portalAssets()
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : "Laden fehlgeschlagen"));
  }, []);

  const groups = useMemo(() => {
    const order = Object.keys(assetKindLabel) as AssetKind[];
    const byKind = new Map<AssetKind, Asset[]>();
    for (const a of rows) {
      const list = byKind.get(a.kind) ?? [];
      list.push(a);
      byKind.set(a.kind, list);
    }
    return order.filter((k) => byKind.has(k)).map((k) => ({ kind: k, items: byKind.get(k)! }));
  }, [rows]);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h2>Inventar</h2>
          <p className="muted">Freigegebene Geräte, Lizenzen und Software.</p>
        </div>
      </header>
      {error ? <p className="form-error">{error}</p> : null}
      {rows.length === 0 ? (
        <p className="empty panel">Kein freigegebenes Inventar.</p>
      ) : (
        <div className="asset-groups">
          {groups.map((group) => (
            <div key={group.kind} className="asset-group">
              <h3 className="asset-group-title">
                {assetKindLabel[group.kind]}
                <span className="muted"> · {group.items.length}</span>
              </h3>
              <ul className="list">
                {group.items.map((asset) => {
                  const status = (asset.status ?? "active") as AssetStatus;
                  const ownership = (asset.ownership ?? "customer") as AssetOwnership;
                  const open = openId === asset.id;
                  const details = portalAssetRows(asset);
                  return (
                    <li key={asset.id} className="panel portal-asset-card">
                      <button
                        type="button"
                        className="asset-open portal-asset-toggle"
                        onClick={() => setOpenId(open ? null : asset.id)}
                        aria-expanded={open}
                      >
                        <div className="asset-title-row">
                          <strong>{asset.name}</strong>
                          <span className={`badge badge-ownership-${ownership}`}>
                            {assetOwnershipLabel[ownership]}
                          </span>
                          <span className={`badge badge-asset-${status}`}>{assetStatusLabel[status]}</span>
                          <span className="muted portal-asset-more">{open ? "Weniger" : "Mehr"}</span>
                        </div>
                        <AssetFacts asset={asset} />
                      </button>
                      {open ? (
                        <div className="asset-preview">
                          {details.length ? (
                            <dl className="asset-preview-grid">
                              {details.map((row) => (
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
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
