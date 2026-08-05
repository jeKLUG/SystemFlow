import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../api";
import { assetKindLabel, formatDateOnly } from "../../lib/labels";
import type { Asset, AssetKind } from "../../types";

const emptyAsset = {
  name: "",
  kind: "pc" as AssetKind,
  manufacturer: "",
  model: "",
  serialNumber: "",
  warrantyUntil: "",
  notes: "",
};

/**
 * Anlagen / Geräte eines Kunden.
 */
export function CustomerAssetsPage() {
  const { id = "" } = useParams();
  const [assetList, setAssetList] = useState<Asset[]>([]);
  const [assetForm, setAssetForm] = useState(emptyAsset);
  const [showAssetForm, setShowAssetForm] = useState(false);

  async function reload() {
    setAssetList(await api.assets(id));
  }

  useEffect(() => {
    void reload();
  }, [id]);

  async function createAsset(e: FormEvent) {
    e.preventDefault();
    await api.createAsset(id, assetForm);
    setAssetForm(emptyAsset);
    setShowAssetForm(false);
    await reload();
  }

  return (
    <section className="section">
      <div className="section-head row-between">
        <div>
          <h2>Anlagen</h2>
          <p>PCs, Server, Firewalls, Lizenzen und weitere Geräte.</p>
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setShowAssetForm((v) => !v)}
        >
          {showAssetForm ? "Abbrechen" : "Anlage hinzufügen"}
        </button>
      </div>

      {showAssetForm ? (
        <form className="panel form-grid" onSubmit={createAsset}>
          <label className="field">
            <span>Name *</span>
            <input
              required
              value={assetForm.name}
              onChange={(e) => setAssetForm({ ...assetForm, name: e.target.value })}
              placeholder="z. B. Firewall Standort A"
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
          <div className="full">
            <button className="btn btn-primary" type="submit">
              Speichern
            </button>
          </div>
        </form>
      ) : null}

      {assetList.length === 0 ? (
        <p className="empty">Noch keine Anlagen.</p>
      ) : (
        <ul className="list">
          {assetList.map((asset) => (
            <li key={asset.id} className="list-row asset-row">
              <div>
                <strong>{asset.name}</strong>
                <span className="muted">
                  {assetKindLabel[asset.kind]}
                  {asset.manufacturer || asset.model
                    ? ` · ${[asset.manufacturer, asset.model].filter(Boolean).join(" ")}`
                    : ""}
                  {asset.serialNumber ? ` · S/N ${asset.serialNumber}` : ""}
                </span>
                <span className="muted">Garantie: {formatDateOnly(asset.warrantyUntil)}</span>
              </div>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => void api.deleteAsset(asset.id).then(() => reload())}
              >
                Löschen
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
