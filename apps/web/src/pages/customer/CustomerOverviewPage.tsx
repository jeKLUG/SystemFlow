import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { api } from "../../api";
import { CustomerFields } from "../../components/CustomerFields";
import { customerAddressLine } from "../../lib/customer";
import { emptyCustomerForm, type Customer } from "../../types";

type OutletCtx = {
  customer: Customer;
  setCustomer: (c: Customer) => void;
};

/**
 * Stammdaten und Kurzüberblick eines Kontakts oder Kunden.
 */
export function CustomerOverviewPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { customer, setCustomer } = useOutletContext<OutletCtx>();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(emptyCustomerForm);
  const [error, setError] = useState("");
  const [stats, setStats] = useState({
    wiki: 0,
    projects: 0,
    hours: 0,
    openTasks: 0,
  });

  useEffect(() => {
    setForm({
      name: customer.name,
      company: customer.company ?? "",
      contactPerson: customer.contactPerson ?? "",
      email: customer.email ?? "",
      phone: customer.phone ?? "",
      mobile: customer.mobile ?? "",
      address: customer.address ?? "",
      zip: customer.zip ?? "",
      city: customer.city ?? "",
      country: customer.country ?? "Deutschland",
      vatId: customer.vatId ?? "",
      website: customer.website ?? "",
      notes: customer.notes ?? "",
      kind: customer.kind ?? "customer",
      status: customer.status,
    });
  }, [customer]);

  useEffect(() => {
    void Promise.all([
      api.documents(id),
      api.projects(id),
      api.timeEntries(id),
      api.tasks(id),
    ]).then(([docs, projects, time, tasks]) => {
      setStats({
        wiki: docs.length,
        projects: projects.length,
        hours: time.summary.totalHours,
        openTasks: tasks.filter((t) => !t.done).length,
      });
    });
  }, [id]);

  async function saveCustomer(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const updated = await api.updateCustomer(id, form);
      setCustomer(updated);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    }
  }

  async function removeCustomer() {
    const label = (customer.kind ?? "customer") === "contact" ? "Kontakt" : "Kunde";
    if (!confirm(`${label} und alle zugehörigen Daten wirklich löschen?`)) return;
    await api.deleteCustomer(id);
    navigate("/customers");
  }

  const kind = customer.kind ?? "customer";
  const isCustomer = kind === "customer";
  const address = customerAddressLine(customer);
  const hasAddress = address !== "–";
  const websiteHref = normalizeWebsite(customer.website);
  const statusLabel = customer.status === "inactive" ? "Inaktiv" : "Aktiv";

  return (
    <>
      <div className="stat-strip">
        <Link className="stat-chip" to="wiki">
          <strong>{stats.wiki}</strong>
          <span>Dokumente</span>
        </Link>
        <Link className="stat-chip" to="projects">
          <strong>{stats.projects}</strong>
          <span>Projekte</span>
        </Link>
        <Link className="stat-chip" to="time">
          <strong>{stats.hours}</strong>
          <span>Stunden gesamt</span>
        </Link>
        <Link className="stat-chip" to="tasks">
          <strong>{stats.openTasks}</strong>
          <span>Offene Aufgaben</span>
        </Link>
      </div>

      <section className="section stammdaten-section">
        <div className={`panel stammdaten-panel${editing ? " is-editing" : ""}`}>
          <div className="stammdaten-panel-head">
            <div className="stammdaten-panel-title">
              <h2>Stammdaten</h2>
            </div>
            <div className="stammdaten-actions">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setEditing((v) => !v)}
              >
                {editing ? "Schließen" : "Bearbeiten"}
              </button>
              {!editing ? (
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => void removeCustomer()}
                >
                  Löschen
                </button>
              ) : null}
            </div>
          </div>

          {editing ? (
            <form className="customer-edit-form" onSubmit={saveCustomer}>
              <CustomerFields form={form} onChange={setForm} showStatus />
              {error ? <p className="form-error">{error}</p> : null}
              <div className="stammdaten-form-actions">
                <button className="btn btn-primary" type="submit">
                  Speichern
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setEditing(false);
                    setError("");
                  }}
                >
                  Abbrechen
                </button>
              </div>
            </form>
          ) : (
            <div className="stammdaten-view">
              <div className="stammdaten-hero">
                <div className="stammdaten-hero-main">
                  <div className="stammdaten-badges">
                    <span className={`stammdaten-badge${isCustomer ? " is-customer" : ""}`}>
                      {isCustomer ? "Kunde" : "Kontakt"}
                    </span>
                    <span
                      className={`stammdaten-badge is-status${
                        customer.status === "inactive" ? " is-inactive" : ""
                      }`}
                    >
                      {statusLabel}
                    </span>
                  </div>
                  <h3 className="stammdaten-display-name">
                    {isCustomer
                      ? customer.company?.trim() || customer.name
                      : customer.name || customer.company || "Ohne Namen"}
                  </h3>
                  {isCustomer && customer.name && customer.company ? (
                    <p className="stammdaten-subtitle muted">Kurzname · {customer.name}</p>
                  ) : null}
                  {isCustomer && customer.contactPerson?.trim() ? (
                    <p className="stammdaten-subtitle">
                      Ansprechpartner · <strong>{customer.contactPerson}</strong>
                    </p>
                  ) : null}
                </div>
                {isCustomer && customer.vatId?.trim() ? (
                  <div className="stammdaten-vat">
                    <span className="label">USt-IdNr.</span>
                    <strong>{customer.vatId}</strong>
                  </div>
                ) : null}
              </div>

              <div className="stammdaten-blocks">
                <div className="stammdaten-block">
                  <h4 className="stammdaten-block-title">Erreichbarkeit</h4>
                  <ul className="stammdaten-contact-list">
                    {customer.email?.trim() ? (
                      <ContactItem label="E-Mail" icon={icon.mail}>
                        <a href={`mailto:${customer.email}`}>{customer.email}</a>
                      </ContactItem>
                    ) : null}
                    {customer.phone?.trim() ? (
                      <ContactItem label="Telefon" icon={icon.phone}>
                        <a href={`tel:${customer.phone}`}>{customer.phone}</a>
                      </ContactItem>
                    ) : null}
                    {customer.mobile?.trim() ? (
                      <ContactItem label="Mobil" icon={icon.mobile}>
                        <a href={`tel:${customer.mobile}`}>{customer.mobile}</a>
                      </ContactItem>
                    ) : null}
                    {websiteHref ? (
                      <ContactItem label="Website" icon={icon.web}>
                        <a href={websiteHref} target="_blank" rel="noreferrer">
                          {displayWebsite(customer.website!)}
                        </a>
                      </ContactItem>
                    ) : null}
                    {!customer.email?.trim() &&
                    !customer.phone?.trim() &&
                    !customer.mobile?.trim() &&
                    !websiteHref ? (
                      <li className="stammdaten-empty muted">Noch keine Kontaktdaten hinterlegt.</li>
                    ) : null}
                  </ul>
                </div>

                <div className="stammdaten-block">
                  <h4 className="stammdaten-block-title">Adresse</h4>
                  {hasAddress ? (
                    <p className="stammdaten-address">
                      <span className="stammdaten-address-icon" aria-hidden>
                        {icon.map}
                      </span>
                      <span>{address}</span>
                    </p>
                  ) : (
                    <p className="stammdaten-empty muted">Keine Adresse hinterlegt.</p>
                  )}
                </div>
              </div>

              {customer.notes?.trim() ? (
                <div className="stammdaten-notes">
                  <h4 className="stammdaten-block-title">Kurznotiz</h4>
                  <p>{customer.notes}</p>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function ContactItem({
  label,
  icon,
  children,
}: {
  label: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <li className="stammdaten-contact-item">
      <span className="stammdaten-contact-icon" aria-hidden>
        {icon}
      </span>
      <div>
        <span className="label">{label}</span>
        <div className="stammdaten-contact-value">{children}</div>
      </div>
    </li>
  );
}

function normalizeWebsite(raw?: string | null): string | null {
  const value = raw?.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function displayWebsite(raw: string): string {
  return raw.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

const icon = {
  mail: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="m4.5 7.5 7.5 5.5 7.5-5.5" />
    </svg>
  ),
  phone: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M7.5 4.5h3l1.2 3.2-1.8 1.3a11 11 0 0 0 5.1 5.1l1.3-1.8 3.2 1.2v3a2 2 0 0 1-2.2 2A14.5 14.5 0 0 1 5.5 6.7a2 2 0 0 1 2-2.2Z" />
    </svg>
  ),
  mobile: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="7.5" y="3.5" width="9" height="17" rx="2" />
      <path d="M11 17.5h2" strokeLinecap="round" />
    </svg>
  ),
  web: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="8" />
      <path d="M4.5 12h15M12 4.5c2.2 2.4 3.3 5 3.3 7.5s-1.1 5.1-3.3 7.5c-2.2-2.4-3.3-5-3.3-7.5s1.1-5.1 3.3-7.5Z" />
    </svg>
  ),
  map: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 21s6-5.2 6-10.2A6 6 0 0 0 6 10.8C6 15.8 12 21 12 21Z" />
      <circle cx="12" cy="10.5" r="2.2" />
    </svg>
  ),
};
