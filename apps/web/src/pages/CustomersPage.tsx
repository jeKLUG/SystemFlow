import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { CustomerFields } from "../components/CustomerFields";
import { customerDisplayName } from "../lib/customer";
import { formatDate } from "../lib/labels";
import { emptyCustomerForm, type Customer } from "../types";

export function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [q, setQ] = useState("");
  const [form, setForm] = useState(emptyCustomerForm);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [params] = useSearchParams();
  const navigate = useNavigate();

  async function load(search = q) {
    setCustomers(await api.customers(search || undefined));
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (params.get("new") === "1") setShowForm(true);
  }, [params]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const payload = {
        ...form,
        name: form.name.trim() || form.company.trim(),
      };
      if (!payload.name) {
        setError("Bitte Firma oder Kurzname angeben");
        return;
      }
      const created = await api.createCustomer(payload);
      setForm(emptyCustomerForm);
      setShowForm(false);
      navigate(`/customers/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    }
  }

  return (
    <div className="page">
      <div className="section-head row-between">
        <div>
          <h2>Kunden</h2>
          <p>Firmenstammdaten anlegen, suchen und öffnen.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Abbrechen" : "Kunde anlegen"}
        </button>
      </div>

      {showForm ? (
        <form className="panel form-grid" onSubmit={onCreate}>
          <CustomerFields form={form} onChange={setForm} />
          {error ? <p className="form-error full">{error}</p> : null}
          <div className="full">
            <button className="btn btn-primary" type="submit">
              Speichern
            </button>
          </div>
        </form>
      ) : null}

      <form
        className="search-bar"
        onSubmit={(e) => {
          e.preventDefault();
          void load(q);
        }}
      >
        <input
          placeholder="Suche nach Firma, Ansprechpartner, Ort, Telefon…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn btn-ghost" type="submit">
          Suchen
        </button>
      </form>

      {customers.length === 0 ? (
        <p className="empty">Keine Kunden gefunden.</p>
      ) : (
        <ul className="list">
          {customers.map((c) => (
            <li key={c.id}>
              <Link className="list-row" to={`/customers/${c.id}`}>
                <div>
                  <strong>{customerDisplayName(c)}</strong>
                  <span className="muted">
                    {[c.contactPerson, c.city, c.email, c.phone]
                      .filter(Boolean)
                      .join(" · ") || "Keine Kontaktdaten"}
                  </span>
                </div>
                <div className="list-meta">
                  <span className={`badge badge-${c.status}`}>
                    {c.status === "active" ? "Aktiv" : "Inaktiv"}
                  </span>
                  <time className="muted">{formatDate(c.updatedAt)}</time>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
