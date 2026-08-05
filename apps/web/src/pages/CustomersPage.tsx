import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { CustomerFields } from "../components/CustomerFields";
import { customerDisplayName } from "../lib/customer";
import { pushRecentCustomer } from "../lib/recentCustomers";
import { formatDate } from "../lib/labels";
import { emptyCustomerForm, type Customer } from "../types";

const PAGE_SIZE = 40;

/**
 * Kundenverwaltung mit Live-Suche, Filtern und paginiertem Laden.
 */
export function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("active");
  const [sort, setSort] = useState<"updated" | "name">("name");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyCustomerForm);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const debounceRef = useRef<number | null>(null);

  async function load(opts?: { append?: boolean; offset?: number; search?: string }) {
    const append = opts?.append ?? false;
    const offset = opts?.offset ?? 0;
    const search = opts?.search ?? q;
    setLoading(true);
    try {
      const res = await api.customers({
        q: search.trim() || undefined,
        status,
        sort,
        limit: PAGE_SIZE,
        offset,
      });
      setTotal(res.total);
      setCustomers((prev) => (append ? [...prev, ...res.items] : res.items));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void load({ search: q, offset: 0 });
    }, 250);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [q, status, sort]);

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
      pushRecentCustomer(created.id);
      setForm(emptyCustomerForm);
      setShowForm(false);
      navigate(`/customers/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    }
  }

  const hasMore = customers.length < total;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Kunden</h2>
          <p>
            {total === 1 ? "1 Kunde" : `${total} Kunden`}
            {status === "active" ? " · aktive" : status === "inactive" ? " · inaktive" : ""}
            {q.trim() ? ` · Suche „${q.trim()}“` : ""}
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Abbrechen" : "Kunde anlegen"}
          </button>
        </div>
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

      <div className="customers-toolbar panel">
        <input
          className="customers-search"
          placeholder="Firma, Ansprechpartner, Ort, Telefon, USt-Id…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
        <div className="filter-chips">
          {(
            [
              ["active", "Aktiv"],
              ["inactive", "Inaktiv"],
              ["all", "Alle"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={status === key ? "chip chip-active" : "chip"}
              onClick={() => setStatus(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="field customers-sort">
          <span>Sortierung</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as "updated" | "name")}
          >
            <option value="name">Name A–Z</option>
            <option value="updated">Zuletzt aktualisiert</option>
          </select>
        </label>
      </div>

      {customers.length === 0 && !loading ? (
        <p className="empty">Keine Kunden gefunden.</p>
      ) : (
        <ul className="list customer-list">
          {customers.map((c) => (
            <li key={c.id}>
              <Link
                className="list-row"
                to={`/customers/${c.id}`}
                onClick={() => pushRecentCustomer(c.id)}
              >
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

      <div className="customers-footer">
        <span className="muted">
          {loading
            ? "Lade…"
            : `${customers.length} von ${total} angezeigt`}
        </span>
        {hasMore ? (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={loading}
            onClick={() => void load({ append: true, offset: customers.length })}
          >
            Mehr laden
          </button>
        ) : null}
      </div>
    </div>
  );
}
