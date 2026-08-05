import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth";

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="shell">
      <div className="atmosphere" aria-hidden="true" />
      <header className="topbar">
        <NavLink to="/" className="brand">
          <span className="brand-mark" />
          <span className="brand-name">Systemhaus-Ess</span>
        </NavLink>
        <nav className="nav">
          <NavLink to="/" end>
            Start
          </NavLink>
          <NavLink to="/customers">Kunden</NavLink>
          <NavLink to="/search">Suche</NavLink>
        </nav>
        <div className="topbar-actions">
          <span className="user-chip">{user?.username}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void logout()}>
            Abmelden
          </button>
        </div>
      </header>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
