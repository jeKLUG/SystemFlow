import type { Customer } from "../types";

/** Anzeigename: Firma bevorzugt, sonst Kurzname. */
export function customerDisplayName(
  customer: Pick<Customer, "name" | "company">,
): string {
  return customer.company?.trim() || customer.name;
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
