import { assetSummaryFacts } from "../lib/assets";
import type { Asset } from "../types";

/**
 * Kompakte Kennzahlen-Zeile für Inventar-Karten.
 */
export function AssetFacts({ asset, limit = 8 }: { asset: Asset; limit?: number }) {
  const facts = assetSummaryFacts(asset, limit);
  if (!facts.length) return null;
  return (
    <ul className="asset-meta">
      {facts.map((fact) => (
        <li key={fact.label} className={fact.mono ? "is-mono" : undefined}>
          <em>{fact.label}</em>
          {fact.value}
        </li>
      ))}
    </ul>
  );
}
