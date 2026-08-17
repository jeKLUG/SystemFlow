import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api";
import { customerDisplayName } from "../../lib/customer";
import type { Customer } from "../../types";

type Tab = {
  to: string;
  end?: boolean;
  label: string;
  short: string;
  icon: ReactNode;
};

const tabIcon = {
  overview: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </svg>
  ),
  docs: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M7 3.5h7l4.5 4.5V20a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5Z" />
      <path d="M14 3.5V8h4.5M8.5 12h7M8.5 15.5h5" />
    </svg>
  ),
  projects: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M4 8h16v11H4zM8 8V6a2 2 0 012-2h4a2 2 0 012 2v2" strokeLinejoin="round" />
    </svg>
  ),
  tasks: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M9 11l3 3L22 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" strokeLinecap="round" />
    </svg>
  ),
  time: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l2.5 1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  assets: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="3" y="5" width="18" height="12" rx="2" />
      <path d="M8 21h8M12 17v4" strokeLinecap="round" />
    </svg>
  ),
  ops: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M12 4v10M8 10l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 18h14" strokeLinecap="round" />
    </svg>
  ),
  emails: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="M4 7l8 6 8-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

const tabs: Tab[] = [
  { to: ".", end: true, label: "Übersicht", short: "Start", icon: tabIcon.overview },
  { to: "wiki", label: "Dokumente", short: "Docs", icon: tabIcon.docs },
  { to: "emails", label: "E-Mails", short: "Mail", icon: tabIcon.emails },
  { to: "projects", label: "Projekte", short: "Projekte", icon: tabIcon.projects },
  { to: "tasks", label: "Aufgaben", short: "Tasks", icon: tabIcon.tasks },
  { to: "time", label: "Zeiten", short: "Zeit", icon: tabIcon.time },
  { to: "assets", label: "Geräte & Netzwerk", short: "Geräte", icon: tabIcon.assets },
  { to: "ops", label: "Betrieb", short: "Betrieb", icon: tabIcon.ops },
];

/**
 * Kunden-Shell mit Tabs für Dokumente, E-Mails, Projekte, Aufgaben, Zeiten, Geräte & Netzwerk und Betrieb.
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

      <div className="section-head">
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
      </div>

      <nav className="customer-tabs" aria-label="Kundenbereiche">
        {tabs.map((tab) => (
          <NavLink
            key={tab.label}
            to={tab.to}
            end={tab.end ?? false}
            className={({ isActive }) =>
              isActive ? "customer-tab customer-tab-active" : "customer-tab"
            }
            title={tab.label}
          >
            <span className="customer-tab-icon">{tab.icon}</span>
            <span className="customer-tab-label">{tab.label}</span>
            <span className="customer-tab-short">{tab.short}</span>
          </NavLink>
        ))}
      </nav>

      <Outlet context={{ customer, setCustomer }} />
    </div>
  );
}
