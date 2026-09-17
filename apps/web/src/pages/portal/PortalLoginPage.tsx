import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../auth";
import { Checkbox } from "../../components/Checkbox";
import { PasswordField } from "../../components/PasswordField";

/**
 * Login für das Kundenportal (getrennt vom Staff-Login).
 */
export function PortalLoginPage() {
  const { user, loading, portalLogin } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!loading && user) {
    return <Navigate to={user.role === "customer" ? "/portal" : "/"} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await portalLogin(username, password, rememberMe);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="atmosphere" aria-hidden="true" />
      <div className="login-layout">
        <section className="login-hero">
          <div className="sidebar-brand" style={{ border: 0, padding: 0, marginBottom: "1rem" }}>
            <img className="brand-mark" src="/logo.png" alt="" width={40} height={40} />
            <strong>Systemhaus-Ess</strong>
          </div>
          <h1>Tickets, Verträge und Dokumente – an einem Ort.</h1>
        </section>
        <form className="login-panel panel" onSubmit={onSubmit}>
          <h2>Portal-Login</h2>
          <label className="field">
            <span>Benutzername</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
          </label>
          <PasswordField
            label="Passwort"
            value={password}
            onChange={setPassword}
            revealed={showPassword}
            onToggleReveal={() => setShowPassword((v) => !v)}
            autoComplete="current-password"
            required
          />
          <Checkbox label="Angemeldet bleiben" checked={rememberMe} onChange={setRememberMe} />
          {error ? <p className="form-error">{error}</p> : null}
          <button className="btn btn-primary btn-xl" type="submit" disabled={busy || loading}>
            {busy ? "Anmelden…" : "Einloggen"}
          </button>
        </form>
      </div>
    </div>
  );
}
