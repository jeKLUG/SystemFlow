import type { CustomerStatus } from "../types";

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
  status: CustomerStatus;
}

interface Props {
  form: CustomerFormState;
  onChange: (next: CustomerFormState) => void;
  showStatus?: boolean;
}

/**
 * Gemeinsame Eingabefelder für Kundenformulare.
 */
export function CustomerFields({ form, onChange, showStatus = false }: Props) {
  function set<K extends keyof CustomerFormState>(key: K, value: CustomerFormState[K]) {
    onChange({ ...form, [key]: value });
  }

  return (
    <>
      <label className="field">
        <span>Firma</span>
        <input
          value={form.company}
          onChange={(e) => set("company", e.target.value)}
          placeholder="z. B. Muster GmbH"
        />
      </label>
      <label className="field">
        <span>Kurzname / Anzeigename *</span>
        <input
          required
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="z. B. Muster"
        />
      </label>
      <label className="field">
        <span>Ansprechpartner</span>
        <input
          value={form.contactPerson}
          onChange={(e) => set("contactPerson", e.target.value)}
        />
      </label>
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
      ) : (
        <div />
      )}
      <label className="field">
        <span>E-Mail</span>
        <input
          type="email"
          value={form.email}
          onChange={(e) => set("email", e.target.value)}
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
        <input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
      </label>
      <label className="field">
        <span>Mobil</span>
        <input value={form.mobile} onChange={(e) => set("mobile", e.target.value)} />
      </label>
      <label className="field full">
        <span>Straße / Hausnummer</span>
        <input value={form.address} onChange={(e) => set("address", e.target.value)} />
      </label>
      <label className="field">
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
      <label className="field">
        <span>USt-IdNr.</span>
        <input
          value={form.vatId}
          onChange={(e) => set("vatId", e.target.value)}
          placeholder="DE…"
        />
      </label>
      <label className="field full">
        <span>Kurznotiz</span>
        <textarea
          rows={3}
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
        />
      </label>
    </>
  );
}
