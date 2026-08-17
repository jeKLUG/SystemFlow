import type { ContactKind, Customer } from "../types";

/** Anzeigename: bei Kunden Firma bevorzugt, bei Kontakten der Name. */
export function customerDisplayName(
  customer: Pick<Customer, "name" | "company"> & { kind?: ContactKind },
): string {
  if (customer.kind === "contact") {
    return customer.name?.trim() || customer.company?.trim() || "Kontakt";
  }
  return customer.company?.trim() || customer.name;
}

/** Deutsche Bezeichnung für Kontakt/Kunde. */
export function contactKindLabel(kind?: ContactKind | null): string {
  return kind === "contact" ? "Kontakt" : "Kunde";
}

/**
 * Empfohlene Felder beim Upgrade Kontakt → Kunde (fehlende Stammdaten).
 */
export function customerUpgradeGaps(
  customer: Pick<Customer, "company" | "vatId" | "address" | "email" | "phone">,
): string[] {
  const gaps: string[] = [];
  if (!customer.company?.trim()) gaps.push("Firma");
  if (!customer.vatId?.trim()) gaps.push("USt-IdNr.");
  if (!customer.address?.trim()) gaps.push("Adresse");
  if (!customer.email?.trim()) gaps.push("E-Mail");
  if (!customer.phone?.trim()) gaps.push("Telefon");
  return gaps;
}

/** Formatierte Adresszeile. */
export function customerAddressLine(
  customer: Pick<Customer, "address" | "zip" | "city" | "country">,
): string {
  const street = customer.address?.trim();
  const cityLine = [customer.zip, customer.city].filter(Boolean).join(" ").trim();
  const country = customer.country?.trim();
  return [street, cityLine, country].filter(Boolean).join(", ") || "–";
}
