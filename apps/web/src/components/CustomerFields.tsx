import type { ContactKind, CustomerStatus } from "../types";

export interface CustomerFormState {
  name: string;
  company: string;
  contactPerson: string;
  email: string;
  phone: string;
  mobile: string;
  address: string;
  zip: string;
  city: string;
  country: string;
  vatId: string;
  website: string;
  notes: string;
  kind: ContactKind;
  status: CustomerStatus;
}

interface Props {
  form: CustomerFormState;
  onChange: (next: CustomerFormState) => void;
  showStatus?: boolean;
  /** Typ Kontakt/Kunde anzeigen (Standard: ja). */
  showKind?: boolean;
}

/**
 * Gemeinsame Eingabefelder für Kontakt- und Kundenformulare, gruppiert nach Themen.
 */
export function CustomerFields({
  form,
  onChange,
  showStatus = false,
  showKind = true,
}: Props) {
  function set<K extends keyof CustomerFormState>(key: K, value: CustomerFormState[K]) {
    onChange({ ...form, [key]: value });
  }

  const isCustomer = form.kind === "customer";

  return (
    <div className="customer-fields">
      <section className="customer-fields-section">
        <h4 className="customer-fields-title">Stammdaten</h4>
        <div className="form-grid customer-fields-grid">
          {showKind ? (
            <label className="field">
              <span>Typ</span>
              <select
                value={form.kind}
                onChange={(e) => set("kind", e.target.value as ContactKind)}
              >
                <option value="contact">Kontakt</option>
                <option value="customer">Kunde</option>
              </select>
            </label>
          ) : null}

          {showStatus ? (
            <label className="field">
              <span>Status</span>
              <select
                value={form.status}
                onChange={(e) => set("status", e.target.value as CustomerStatus)}
              >
                <option value="active">Aktiv</option>
                <option value="inactive">Inaktiv</option>
              </select>
            </label>
          ) : showKind ? (
            <div className="field customer-fields-spacer" aria-hidden />
          ) : null}

          <label className="field">
            <span>{isCustomer ? "Kurzname / Anzeigename *" : "Name *"}</span>
            <input
              required
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder={isCustomer ? "z. B. Muster" : "z. B. Max Mustermann"}
            />
          </label>

          <label className="field">
            <span>{isCustomer ? "Firma" : "Firma / Organisation"}</span>
            <input
              value={form.company}
              onChange={(e) => set("company", e.target.value)}
              placeholder={isCustomer ? "z. B. Muster GmbH" : "optional"}
            />
          </label>

          {isCustomer ? (
            <label className="field full">
              <span>Ansprechpartner</span>
              <input
                value={form.contactPerson}
                onChange={(e) => set("contactPerson", e.target.value)}
                placeholder="z. B. Max Mustermann"
              />
            </label>
          ) : null}
        </div>
      </section>

      <section className="customer-fields-section">
        <h4 className="customer-fields-title">Erreichbarkeit</h4>
        <div className="form-grid customer-fields-grid">
          <label className="field">
            <span>E-Mail</span>
            <input
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="name@firma.de"
            />
          </label>
          <label className="field">
            <span>Website</span>
            <input
              type="url"
              value={form.website}
              onChange={(e) => set("website", e.target.value)}
              placeholder="https://"
            />
          </label>
          <label className="field">
            <span>Telefon</span>
            <input
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="+49 …"
            />
          </label>
          <label className="field">
            <span>Mobil</span>
            <input
              value={form.mobile}
              onChange={(e) => set("mobile", e.target.value)}
              placeholder="+49 …"
            />
          </label>
        </div>
      </section>

      <section className="customer-fields-section">
        <h4 className="customer-fields-title">Adresse</h4>
        <div className="form-grid customer-fields-grid">
          <label className="field full">
            <span>Straße / Hausnummer</span>
            <input
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              placeholder="Musterstraße 1"
            />
          </label>
          <label className="field customer-fields-zip">
            <span>PLZ</span>
            <input value={form.zip} onChange={(e) => set("zip", e.target.value)} />
          </label>
          <label className="field">
            <span>Ort</span>
            <input value={form.city} onChange={(e) => set("city", e.target.value)} />
          </label>
          <label className="field">
            <span>Land</span>
            <input value={form.country} onChange={(e) => set("country", e.target.value)} />
          </label>
          {isCustomer ? (
            <label className="field">
              <span>USt-IdNr.</span>
              <input
                value={form.vatId}
                onChange={(e) => set("vatId", e.target.value)}
                placeholder="DE…"
              />
            </label>
          ) : null}
        </div>
      </section>

      <section className="customer-fields-section">
        <h4 className="customer-fields-title">Notiz</h4>
        <div className="form-grid customer-fields-grid">
          <label className="field full">
            <span>Kurznotiz</span>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Interner Hinweis…"
            />
          </label>
        </div>
      </section>
    </div>
  );
}
