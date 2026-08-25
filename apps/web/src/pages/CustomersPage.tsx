import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { CustomerFields } from "../components/CustomerFields";
import { contactKindLabel, customerDisplayName } from "../lib/customer";
import { pushRecentCustomer } from "../lib/recentCustomers";
import { formatDate } from "../lib/labels";
import { emptyCustomerForm, type ContactKind, type Customer } from "../types";
import { withOfflineFallback } from "../lib/offlineCache";

const PAGE_SIZE = 60;

function initials(c: Customer, kind: ContactKind): string {
  const label = customerDisplayName({ ...c, kind }).trim();
  const parts = label.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return (label.slice(0, 2) || "?").toUpperCase();
}

/**
 * Kontaktverwaltung mit kompakter Liste, Live-Suche und Filtern.
 * Unterstützt einfache Kontakte und Kunden.
 */
export function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("active");
  const [kind, setKind] = useState<"all" | ContactKind>("all");
  const [sort, setSort] = useState<"updated" | "name">("name");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyCustomerForm);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [fromCache, setFromCache] = useState(false);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const debounceRef = useRef<number | null>(null);

  async function load(opts?: { append?: boolean; offset?: number; search?: string }) {
    const append = opts?.append ?? false;
    const offset = opts?.offset ?? 0;
    const search = opts?.search ?? q;
    setLoading(true);
    try {
      const cacheKey = `customers:${status}:${kind}:${sort}:${search.trim()}:${offset}`;
      const { data: res, fromCache: cached } = await withOfflineFallback(cacheKey, () =>
        api.customers({
          q: search.trim() || undefined,
          status,
          kind,
          sort,
          limit: PAGE_SIZE,
          offset,
        }),
      );
      setTotal(res.total);
      setCustomers((prev) => (append ? [...prev, ...res.items] : res.items));
      if (!append) setFromCache(cached);
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
  }, [q, status, kind, sort]);

  useEffect(() => {
    if (params.get("new") === "1") setShowForm(true);
    const newKind = params.get("kind");
    if (newKind === "contact" || newKind === "customer") {
      setForm((f) => ({ ...f, kind: newKind }));
      setShowForm(true);
    }
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
        setError(
          form.kind === "customer"
            ? "Bitte Firma oder Kurzname angeben"
            : "Bitte einen Namen angeben",
        );
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
    <div className="page customers-page">
      <div className="page-header customers-page-header">
        <div>
          <h2>Kontakte</h2>
          <p>
            {total === 1 ? "1 Eintrag" : `${total} Einträge`}
            {kind === "contact" ? " · Kontakte" : kind === "customer" ? " · Kunden" : ""}
            {status === "active" ? " · aktiv" : status === "inactive" ? " · inaktiv" : ""}
            {fromCache ? " · Offline" : ""}
          </p>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setForm({ ...emptyCustomerForm, kind: "customer" });
              setShowForm(true);
            }}
          >
            Kunde
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              if (showForm) {
                setShowForm(false);
                setForm(emptyCustomerForm);
              } else {
                setForm({ ...emptyCustomerForm, kind: "contact" });
                setShowForm(true);
              }
            }}
          >
            {showForm ? "Abbrechen" : "Kontakt"}
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
          type="search"
          placeholder="Suchen…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
          aria-label="Kontakte durchsuchen"
        />
        <div className="customers-filters">
          <div className="filter-chips customers-seg" role="group" aria-label="Typ">
            {(
              [
                ["all", "Alle"],
                ["contact", "Kontakte"],
                ["customer", "Kunden"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={kind === key ? "chip chip-active" : "chip"}
                onClick={() => setKind(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="filter-chips customers-seg" role="group" aria-label="Status">
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
          <label className="customers-sort">
            <span className="sr-only">Sortierung</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as "updated" | "name")}
              aria-label="Sortierung"
            >
              <option value="name">A–Z</option>
              <option value="updated">Zuletzt</option>
            </select>
          </label>
        </div>
      </div>

      {customers.length === 0 && !loading ? (
        <p className="empty">Keine Kontakte gefunden.</p>
      ) : (
        <ul className="customer-list">
          {customers.map((c) => {
            const entryKind = c.kind ?? "customer";
            const secondary =
              entryKind === "customer"
                ? [c.contactPerson, c.email].filter(Boolean).join(" · ")
                : [c.company, c.email].filter(Boolean).join(" · ");
            return (
              <li key={c.id}>
                <Link
                  className="customer-row"
                  to={`/customers/${c.id}`}
                  onClick={() => pushRecentCustomer(c.id)}
                >
                  <span
                    className={`customer-row-avatar is-${entryKind}`}
                    aria-hidden
                  >
                    {initials(c, entryKind)}
                  </span>
                  <div className="customer-row-main">
                    <strong>{customerDisplayName({ ...c, kind: entryKind })}</strong>
                    <span className="customer-row-sub">
                      {secondary || "Keine Kontaktdaten"}
                    </span>
                  </div>
                  <div className="customer-row-facts">
                    {c.city ? <span>{c.city}</span> : null}
                    {c.phone ? <span>{c.phone}</span> : null}
                  </div>
                  <div className="customer-row-meta">
                    <span
                      className={`badge ${
                        entryKind === "customer" ? "badge-kind-customer" : "badge-kind-contact"
                      }`}
                    >
                      {contactKindLabel(entryKind)}
                    </span>
                    {c.status !== "active" ? (
                      <span className={`badge badge-${c.status}`}>Inaktiv</span>
                    ) : null}
                    <time className="customer-row-when" dateTime={c.updatedAt}>
                      {formatDate(c.updatedAt)}
                    </time>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <div className="customers-footer">
        <span className="muted">
          {loading ? "Lade…" : `${customers.length} von ${total}`}
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
