import { useState, type FormEvent } from "react";
import { useAuth } from "../../auth";

/**
 * Portal-Konto: Passwort ändern.
 */
export function PortalAccountPage() {
  const { user, changePassword, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setOk("");
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setOk("Passwort geändert.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ändern fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h2>Konto</h2>
          <p className="muted">{user?.username}</p>
        </div>
      </header>
      <section className="panel" style={{ maxWidth: 420 }}>
        <h3>Passwort ändern</h3>
        <form className="stack-form" onSubmit={(e) => void onSubmit(e)}>
          <label className="field">
            <span>Aktuelles Passwort</span>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Neues Passwort (mind. 8 Zeichen)</span>
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          {ok ? <p className="muted">{ok}</p> : null}
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Speichern…" : "Passwort speichern"}
          </button>
        </form>
        <button type="button" className="btn btn-ghost" style={{ marginTop: "1rem" }} onClick={() => void logout()}>
          Abmelden
        </button>
      </section>
    </div>
  );
}
