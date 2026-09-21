export type OrgAddressSource = {
  orgName?: string | null;
  orgTagline?: string | null;
  orgAddress?: string | null;
  orgZip?: string | null;
  orgCity?: string | null;
  orgCountry?: string | null;
  orgEmail?: string | null;
  orgPhone?: string | null;
};

/**
 * Zeilen für Auftragnehmer (Verträge, PDF). Fallback: Systemhaus-Ess.
 */
export function contractorPartyLines(org?: OrgAddressSource | null): string[] {
  const customName = org?.orgName?.trim() || "";
  const name = customName || "Systemhaus-Ess";
  const tagline =
    org?.orgTagline?.trim() || (customName ? "" : "IT-Dienstleistungen & Support");
  const zipCity = [org?.orgZip?.trim(), org?.orgCity?.trim()].filter(Boolean).join(" ");
  const country = org?.orgCountry?.trim();
  return [
    name,
    tagline,
    org?.orgAddress?.trim() || "",
    zipCity,
    country && country !== "DE" ? country : "",
    org?.orgEmail?.trim() || "",
    org?.orgPhone?.trim() || "",
  ].filter(Boolean);
}

/**
 * Zeilen für Auftraggeber aus Kundendaten.
 */
export function customerPartyLines(customer: {
  name: string;
  company?: string | null;
  contactPerson?: string | null;
  address?: string | null;
  zip?: string | null;
  city?: string | null;
  country?: string | null;
  email?: string | null;
  phone?: string | null;
}): string[] {
  const zipCity = [customer.zip?.trim(), customer.city?.trim()].filter(Boolean).join(" ");
  const country = customer.country?.trim();
  return [
    customer.company?.trim() || customer.name,
    customer.contactPerson?.trim() ? `z. Hd. ${customer.contactPerson.trim()}` : "",
    customer.address?.trim() || "",
    zipCity,
    country && country !== "DE" ? country : "",
    customer.email?.trim() || "",
    customer.phone?.trim() || "",
  ].filter(Boolean);
}
