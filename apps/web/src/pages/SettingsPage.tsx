import { useState, type FormEvent } from "react";
import { useAuth } from "../auth";

export function SettingsPage() {
  const { user, changePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (newPassword.length < 8) {
      setError("Neues Passwort mindestens 8 Zeichen");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwörter stimmen nicht überein");
      return;
    }

    setBusy(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess("Passwort wurde geändert. Du bleibst angemeldet.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Änderung fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Konto</p>
          <h2>Einstellungen</h2>
          <p>Profil und Sicherheit für {user?.username}</p>
        </div>
      </div>

      <section className="panel settings-card">
        <h3>Passwort ändern</h3>
        <p className="muted">
          Nach dem Ändern bleibst du angemeldet. Das Passwort wird nicht mehr durch Deployments
          zurückgesetzt.
        </p>
        <form className="form-stack" onSubmit={onSubmit}>
          <label className="field">
            <span>Aktuelles Passwort</span>
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>Neues Passwort</span>
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
          <label className="field">
            <span>Neues Passwort bestätigen</span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          {success ? <p className="form-success">{success}</p> : null}
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Speichert…" : "Passwort speichern"}
          </button>
        </form>
      </section>
    </div>
  );
}
