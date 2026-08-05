import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { formatDate } from "../lib/labels";
import type { Customer } from "../types";

const emptyForm = {
  name: "",
  email: "",
  phone: "",
  address: "",
  notes: "",
  status: "active" as const,
};

export function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [q, setQ] = useState("");
  const [form, setForm] = useState(emptyForm);
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
      const created = await api.createCustomer(form);
      setForm(emptyForm);
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
          <p>Stammdaten anlegen, suchen und öffnen.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Abbrechen" : "Kunde anlegen"}
        </button>
      </div>

      {showForm ? (
        <form className="panel form-grid" onSubmit={onCreate}>
          <label className="field">
            <span>Name *</span>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label className="field">
            <span>E-Mail</span>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Telefon</span>
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Adresse</span>
            <input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </label>
          <label className="field full">
            <span>Kurznotiz</span>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>
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
          placeholder="Suche nach Name, E-Mail, Telefon…"
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
                  <strong>{c.name}</strong>
                  <span className="muted">
                    {[c.email, c.phone].filter(Boolean).join(" · ") || "Keine Kontaktdaten"}
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
