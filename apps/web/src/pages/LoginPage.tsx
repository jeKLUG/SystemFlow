import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth";

export function LoginPage() {
  const { user, loading, login } = useAuth();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(username, password);
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
          <p className="brand-hero">Systemhaus-Ess</p>
          <h1>Dein Workspace für Kunden, Einsätze und Dokumentation.</h1>
          <p className="lede">
            Modern, schnell und mobil – Rechnungen bleiben bewusst in Lexware.
          </p>
        </section>

        <form className="login-panel" onSubmit={onSubmit}>
          <p className="eyebrow">Anmelden</p>
          <h2>Willkommen zurück</h2>
          <p className="muted">Session bleibt 30 Tage aktiv – kein erneutes Login nach Reload.</p>

          <label className="field">
            <span>Benutzername</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label className="field">
            <span>Passwort</span>
            <div className="password-field">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? "Ausblenden" : "Anzeigen"}
              </button>
            </div>
          </label>

          {error ? <p className="form-error">{error}</p> : null}

          <button className="btn btn-primary btn-xl" type="submit" disabled={busy || loading}>
            {busy ? "Anmelden…" : "Einloggen"}
          </button>
        </form>
      </div>
    </div>
  );
}
