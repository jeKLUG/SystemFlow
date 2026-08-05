import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api";
import { customerDisplayName } from "../../lib/customer";
import type { Customer } from "../../types";

const tabs = [
  { to: ".", end: true, label: "Übersicht" },
  { to: "wiki", label: "Wiki" },
  { to: "projects", label: "Projekte" },
  { to: "time", label: "Zeiten" },
  { to: "assets", label: "Anlagen" },
  { to: "ops", label: "Betrieb" },
] as const;

/**
 * Kunden-Shell mit Tabs für Wiki, Projekte, Zeiten und Betrieb.
 */
export function CustomerLayout() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<Customer | null>(null);

  useEffect(() => {
    void api
      .customer(id)
      .then(setCustomer)
      .catch(() => navigate("/customers"));
  }, [id, navigate]);

  if (!customer) return <div className="boot">Lade Kunde…</div>;

  return (
    <div className="page customer-hub">
      <div className="breadcrumb">
        <Link to="/customers">Kunden</Link>
        <span>/</span>
        <span>{customerDisplayName(customer)}</span>
      </div>

      <div className="section-head row-between">
        <div>
          <h2>{customerDisplayName(customer)}</h2>
          <p>
            <span className={`badge badge-${customer.status}`}>
              {customer.status === "active" ? "Aktiv" : "Inaktiv"}
            </span>
            {customer.contactPerson ? (
              <span className="muted"> · {customer.contactPerson}</span>
            ) : null}
          </p>
        </div>
        <div className="cta-row">
          <Link className="btn btn-primary" to={`/quick-note?customerId=${id}`}>
            + Notiz
          </Link>
          <Link className="btn btn-ghost" to={`/calendar?customerId=${id}`}>
            Kalender
          </Link>
          <Link className="btn btn-ghost" to={`/vault?customerId=${id}`}>
            Tresor
          </Link>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void api.exportCustomer(id)}
          >
            Export ZIP
          </button>
        </div>
      </div>

      <nav className="customer-tabs" aria-label="Kundenbereiche">
        {tabs.map((tab) => (
          <NavLink
            key={tab.label}
            to={tab.to}
            end={"end" in tab ? tab.end : false}
            className={({ isActive }) =>
              isActive ? "customer-tab customer-tab-active" : "customer-tab"
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <Outlet context={{ customer, setCustomer }} />
    </div>
  );
}
