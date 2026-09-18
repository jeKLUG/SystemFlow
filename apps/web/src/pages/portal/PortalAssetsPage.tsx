import { useMemo, useState, useEffect } from "react";
import { api } from "../../api";
import { AssetFacts } from "../../components/AssetFacts";
import { HelpHint } from "../../components/HelpHint";
import {
  assetKindDetailRows,
  assetKindShowsMonitoring,
} from "../../lib/assetFields";
import {
  assetKindLabel,
  assetOwnershipLabel,
  assetStatusLabel,
} from "../../lib/labels";
import type { Asset, AssetKind, AssetOwnership, AssetStatus } from "../../types";

function portalAssetRows(asset: Asset) {
  return assetKindDetailRows(asset, { notes: false });
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
        <div className="page-head-title">
          <h2>Inventar</h2>
          <HelpHint text="Freigegebene Geräte, Lizenzen und Software. Bei PCs sehen Sie, ob Monitoring aktiv ist." />
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
                          {assetKindShowsMonitoring(asset.kind) || asset.monitoringEnabled ? (
                            <span
                              className={`badge ${asset.monitoringEnabled ? "badge-monitoring" : "badge-monitoring-off"}`}
                            >
                              {asset.monitoringEnabled ? "Überwacht" : "Nicht überwacht"}
                            </span>
                          ) : null}
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
