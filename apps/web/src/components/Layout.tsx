import { useState, type ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth";

type NavItem = { to: string; label: string; end?: boolean; icon: ReactNode };

const icon = {
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
    </svg>
  ),
  customers: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="3.5" />
      <path d="M22 21v-2a3.5 3.5 0 0 0-2.5-3.35" />
      <path d="M16.5 3.6a3.5 3.5 0 0 1 0 6.8" />
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M8 3.5V7M16 3.5V7M3.5 10h17" />
    </svg>
  ),
  vault: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
      <circle cx="12" cy="15" r="1.2" />
    </svg>
  ),
  reminders: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 22a2.2 2.2 0 0 0 2.2-2.2H9.8A2.2 2.2 0 0 0 12 22Z" />
      <path d="M18 16V11a6 6 0 1 0-12 0v5l-1.5 2h15L18 16Z" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16.2 16.2 21 21" />
    </svg>
  ),
  note: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 3.5h7l4.5 4.5V20a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5Z" />
      <path d="M14 3.5V8h4.5M8.5 12h7M8.5 15.5h5" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3V20.5M3.5 12h2.2M18.3 12H20.5M6.1 6.1l1.6 1.6M16.3 16.3l1.6 1.6M17.9 6.1l-1.6 1.6M7.7 16.3l-1.6 1.6" />
    </svg>
  ),
};

const primaryNav: NavItem[] = [
  { to: "/", label: "Übersicht", end: true, icon: icon.home },
  { to: "/customers", label: "Kunden", icon: icon.customers },
  { to: "/calendar", label: "Kalender", icon: icon.calendar },
  { to: "/vault", label: "Tresor", icon: icon.vault },
];

const secondaryNav: NavItem[] = [
  { to: "/reminders", label: "Ablauf", icon: icon.reminders },
  { to: "/search", label: "Suche", icon: icon.search },
  { to: "/quick-note", label: "Schnellnotiz", icon: icon.note },
  { to: "/settings", label: "Konto", icon: icon.settings },
];

function NavGroup({ title, items, onNavigate }: { title: string; items: NavItem[]; onNavigate: () => void }) {
  return (
    <div className="nav-section">
      <p className="nav-section-label">{title}</p>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) => `side-link${isActive ? " active" : ""}`}
          onClick={onNavigate}
        >
          {item.icon}
          <span>{item.label}</span>
        </NavLink>
      ))}
    </div>
  );
}

/**
 * App-Shell mit Sidebar, Topbar und mobiler Navigation.
 */
export function Layout() {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = () => setMobileOpen(false);

  return (
    <div className="app-shell">
      <div className="atmosphere" aria-hidden="true" />

      <aside className={`sidebar${mobileOpen ? " is-open" : ""}`}>
        <div className="sidebar-brand">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <strong>Systemhaus-Ess</strong>
            <span>IT Workspace</span>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Hauptnavigation">
          <NavGroup title="Arbeitsplatz" items={primaryNav} onNavigate={closeMobile} />
          <NavGroup title="Werkzeuge" items={secondaryNav} onNavigate={closeMobile} />
        </nav>

        <div className="sidebar-footer">
          <div className="user-card">
            <div className="user-card-main">
              <span className="avatar" aria-hidden="true">
                {(user?.username ?? "?").slice(0, 1).toUpperCase()}
                <i className="avatar-status" title="Angemeldet" />
              </span>
              <div className="user-card-meta">
                <strong title={user?.username ?? undefined}>{user?.username}</strong>
                <span>Administrator</span>
              </div>
            </div>
            <div className="user-card-actions">
              <NavLink
                to="/settings"
                className="user-action"
                title="Konto"
                aria-label="Konto öffnen"
                onClick={closeMobile}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 3.5v2.2M12 18.3V20.5M3.5 12h2.2M18.3 12H20.5M6.1 6.1l1.6 1.6M16.3 16.3l1.6 1.6M17.9 6.1l-1.6 1.6M7.7 16.3l-1.6 1.6" />
                </svg>
              </NavLink>
              <button
                type="button"
                className="user-action is-logout"
                title="Abmelden"
                aria-label="Abmelden"
                onClick={() => void logout()}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <path d="M10 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20H10" strokeLinecap="round" />
                  <path d="M14 16l4-4-4-4M10 12h8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </aside>

      {mobileOpen ? (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Menü schließen"
          onClick={closeMobile}
        />
      ) : null}

      <div className="app-main">
        <header className="app-topbar">
          <button
            type="button"
            className="btn btn-ghost btn-sm menu-toggle"
            onClick={() => setMobileOpen((v) => !v)}
          >
            Menü
          </button>
          <NavLink to="/quick-note" className="btn btn-primary btn-sm">
            + Notiz
          </NavLink>
        </header>
        <main className="app-content">
          <Outlet />
        </main>
      </div>

      <nav className="mobile-tabbar" aria-label="Mobile Navigation">
        <NavLink to="/" end>
          Start
        </NavLink>
        <NavLink to="/customers">Kunden</NavLink>
        <NavLink to="/calendar">Kalender</NavLink>
        <NavLink to="/quick-note" className="tab-primary">
          +
        </NavLink>
        <NavLink to="/vault">Tresor</NavLink>
      </nav>
    </div>
  );
}
