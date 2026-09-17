import { formatDateOnly } from "./labels";
import type { Asset } from "../types";

export type AssetFact = { label: string; value: string; mono?: boolean };

/**
 * Kompakte Kernfelder für Inventar-Listen (ohne interne Notizen).
 */
export function assetSummaryFacts(asset: Asset, limit = 8): AssetFact[] {
  const hardware = [asset.manufacturer, asset.model].filter(Boolean).join(" ");
  const specs = [
    asset.cpu,
    asset.ramGb != null ? `${asset.ramGb} GB RAM` : null,
    asset.diskGb != null ? `${asset.diskGb} GB Speicher` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const rows: Array<AssetFact | null> = [
    asset.ipAddress ? { label: "IP", value: asset.ipAddress, mono: true } : null,
    asset.hostname ? { label: "Host", value: asset.hostname, mono: true } : null,
    hardware ? { label: "Gerät", value: hardware } : null,
    asset.location ? { label: "Ort", value: asset.location } : null,
    asset.os ? { label: "OS", value: asset.os } : null,
    asset.role ? { label: "Rolle", value: asset.role } : null,
    specs ? { label: "Specs", value: specs } : null,
    asset.serialNumber ? { label: "SN", value: asset.serialNumber, mono: true } : null,
    asset.warrantyUntil ? { label: "Garantie", value: formatDateOnly(asset.warrantyUntil) } : null,
    asset.responsiblePerson ? { label: "Kontakt", value: asset.responsiblePerson } : null,
    asset.vlan ? { label: "VLAN", value: asset.vlan } : null,
  ];
  return rows.filter((row): row is AssetFact => Boolean(row)).slice(0, limit);
}
