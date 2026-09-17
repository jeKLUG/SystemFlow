import { useEffect, useRef, useState } from "react";
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
  const [menuOpen, setMenuOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const displayName = user?.customerName || user?.username || "Konto";

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (!cardRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

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
          <div ref={cardRef} className={`user-card portal-user-card${menuOpen ? " is-open" : ""}`}>
            <button
              type="button"
              className="portal-user-toggle"
              aria-expanded={menuOpen}
              aria-haspopup="true"
              aria-controls="portal-user-logout"
              title={displayName}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span className="avatar" aria-hidden>
                {(user?.username ?? "?").slice(0, 1).toUpperCase()}
              </span>
              <span className="user-card-meta">
                <strong>{displayName}</strong>
                <span className="muted">{user?.username}</span>
              </span>
              <svg className="portal-user-caret" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M7 10l5 5 5-5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {menuOpen ? (
              <button
                id="portal-user-logout"
                type="button"
                className="user-action is-logout"
                title="Abmelden"
                aria-label="Abmelden"
                onClick={() => void logout()}
              >
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                  <path
                    d="M16 17L21 12M21 12L16 7M21 12H9M12 17C12 17.93 12 18.395 11.8978 18.7765C11.6204 19.8117 10.8117 20.6204 9.77646 20.8978C9.39496 21 8.92997 21 8 21H7.5C6.10218 21 5.40326 21 4.85195 20.7716C4.11687 20.4672 3.53284 19.8831 3.22836 19.1481C3 18.5967 3 17.8978 3 16.5V7.5C3 6.10217 3 5.40326 3.22836 4.85195C3.53284 4.11687 4.11687 3.53284 4.85195 3.22836C5.40326 3 6.10218 3 7.5 3H8C8.92997 3 9.39496 3 9.77646 3.10222C10.8117 3.37962 11.6204 4.18827 11.8978 5.22354C12 5.60504 12 6.07003 12 7"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            ) : null}
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
