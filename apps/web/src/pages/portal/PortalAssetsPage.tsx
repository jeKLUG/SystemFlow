import { useEffect, useState } from "react";
import { api } from "../../api";
import { assetKindLabel, assetStatusLabel, formatDateOnly } from "../../lib/labels";
import type { Asset } from "../../types";

/**
 * Opt-in Inventar im Portal (ohne interne Notizen).
 */
export function PortalAssetsPage() {
  const [rows, setRows] = useState<Asset[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void api
      .portalAssets()
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : "Laden fehlgeschlagen"));
  }, []);

  return (
    <div className="page">
      <header className="page-head">
        <h2>Inventar</h2>
      </header>
      {error ? <p className="form-error">{error}</p> : null}
      {rows.length === 0 ? (
        <p className="empty panel">Kein freigegebenes Inventar.</p>
      ) : (
        <ul className="list">
          {rows.map((asset) => (
            <li key={asset.id} className="list-row">
              <div>
                <strong>{asset.name}</strong>
                <p className="muted">
                  {assetKindLabel[asset.kind]} · {assetStatusLabel[asset.status]}
                  {asset.serialNumber ? ` · ${asset.serialNumber}` : ""}
                  {asset.location ? ` · ${asset.location}` : ""}
                  {asset.warrantyUntil ? ` · Garantie bis ${formatDateOnly(asset.warrantyUntil)}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
