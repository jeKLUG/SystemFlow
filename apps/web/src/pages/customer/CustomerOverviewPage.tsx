import { useEffect, useState, type FormEvent } from "react";
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

      <section className="section">
        <div className="section-head row-between">
          <div>
            <h2>Stammdaten</h2>
            <p>{isCustomer ? "Firma, Kontakt und Adresse." : "Person, Organisation und Adresse."}</p>
          </div>
          <div className="cta-row">
            <button type="button" className="btn btn-ghost" onClick={() => setEditing((v) => !v)}>
              {editing ? "Schließen" : "Bearbeiten"}
            </button>
            <button type="button" className="btn btn-danger" onClick={() => void removeCustomer()}>
              Löschen
            </button>
          </div>
        </div>

        {editing ? (
          <form className="panel form-grid" onSubmit={saveCustomer}>
            <CustomerFields form={form} onChange={setForm} showStatus />
            {error ? <p className="form-error full">{error}</p> : null}
            <div className="full">
              <button className="btn btn-primary" type="submit">
                Speichern
              </button>
            </div>
          </form>
        ) : (
          <div className="detail-grid">
            <div>
              <span className="label">Typ</span>
              <p>{isCustomer ? "Kunde" : "Kontakt"}</p>
            </div>
            <div>
              <span className="label">{isCustomer ? "Firma" : "Firma / Organisation"}</span>
              <p>{customer.company || "–"}</p>
            </div>
            <div>
              <span className="label">{isCustomer ? "Kurzname" : "Name"}</span>
              <p>{customer.name || "–"}</p>
            </div>
            {isCustomer ? (
              <div>
                <span className="label">Ansprechpartner</span>
                <p>{customer.contactPerson || "–"}</p>
              </div>
            ) : null}
            {isCustomer ? (
              <div>
                <span className="label">USt-IdNr.</span>
                <p>{customer.vatId || "–"}</p>
              </div>
            ) : null}
            <div>
              <span className="label">E-Mail</span>
              <p>{customer.email || "–"}</p>
            </div>
            <div>
              <span className="label">Website</span>
              <p>
                {customer.website ? (
                  <a href={customer.website} target="_blank" rel="noreferrer">
                    {customer.website}
                  </a>
                ) : (
                  "–"
                )}
              </p>
            </div>
            <div>
              <span className="label">Telefon</span>
              <p>{customer.phone || "–"}</p>
            </div>
            <div>
              <span className="label">Mobil</span>
              <p>{customer.mobile || "–"}</p>
            </div>
            <div className="full">
              <span className="label">Adresse</span>
              <p>{customerAddressLine(customer)}</p>
            </div>
            <div className="full">
              <span className="label">Kurznotiz</span>
              <p>{customer.notes || "–"}</p>
            </div>
          </div>
        )}
      </section>
    </>
  );
}

