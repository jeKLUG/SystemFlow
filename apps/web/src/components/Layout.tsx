import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth";

const navItems = [
  { to: "/", label: "Übersicht", end: true },
  { to: "/customers", label: "Kunden" },
  { to: "/reminders", label: "Ablauf" },
  { to: "/search", label: "Suche" },
  { to: "/quick-note", label: "Notiz" },
  { to: "/settings", label: "Konto" },
];

export function Layout() {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="app-shell">
      <div className="atmosphere" aria-hidden="true" />

      <aside className={`sidebar${mobileOpen ? " is-open" : ""}`}>
        <div className="sidebar-brand">
          <span className="brand-mark" />
          <div>
            <strong>Systemhaus-Ess</strong>
            <span>Workspace</span>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Hauptnavigation">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `side-link${isActive ? " active" : ""}`}
              onClick={() => setMobileOpen(false)}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-block">
            <span className="avatar">{(user?.username ?? "?").slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{user?.username}</strong>
              <span>Administrator</span>
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void logout()}>
            Abmelden
          </button>
        </div>
      </aside>

      {mobileOpen ? (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Menü schließen"
          onClick={() => setMobileOpen(false)}
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
            + Schnellnotiz
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
        <NavLink to="/quick-note" className="tab-primary">
          +
        </NavLink>
        <NavLink to="/reminders">Ablauf</NavLink>
        <NavLink to="/settings">Konto</NavLink>
      </nav>
    </div>
  );
}
