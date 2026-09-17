import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../../auth";

const nav = [
  { to: "/portal", end: true, label: "Start" },
  { to: "/portal/tickets", label: "Tickets" },
  { to: "/portal/contracts", label: "Verträge" },
  { to: "/portal/documents", label: "Dokumente" },
  { to: "/portal/assets", label: "Inventar" },
  { to: "/portal/account", label: "Konto" },
];

/**
 * Schlanke Portal-Shell ohne Staff-Navigation.
 */
export function PortalLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell portal-shell">
      <div className="atmosphere" aria-hidden="true" />
      <aside className="sidebar is-open portal-sidebar">
        <div className="sidebar-brand">
          <img className="brand-mark" src="/logo.png" alt="" width={36} height={36} />
          <strong>Kundenportal</strong>
        </div>
        <nav className="sidebar-nav" aria-label="Portal">
          <div className="nav-section">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `side-link${isActive ? " active" : ""}`}
              >
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        </nav>
        <div className="sidebar-footer">
          <div className="user-card">
            <div className="user-card-main">
              <span className="avatar" aria-hidden>
                {(user?.username ?? "?").slice(0, 1).toUpperCase()}
              </span>
              <div className="user-card-meta">
                <strong>{user?.customerName || user?.username}</strong>
                <span className="muted">{user?.username}</span>
              </div>
            </div>
            <button type="button" className="user-action is-logout" onClick={() => void logout()}>
              Abmelden
            </button>
          </div>
        </div>
      </aside>
      <div className="app-main">
        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
