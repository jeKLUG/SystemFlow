import { useState, type FormEvent } from "react";
import { useAuth } from "../../auth";
import { PasswordField, PasswordMatchHint } from "../../components/PasswordField";

/**
 * Portal-Konto: Passwort ändern.
 */
export function PortalAccountPage() {
  const { user, changePassword, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setOk("");
    if (newPassword.length < 8) {
      setError("Neues Passwort mindestens 8 Zeichen");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }
    setBusy(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setShowCurrent(false);
      setShowNew(false);
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
      <section className="panel settings-card portal-account-card">
        <header className="settings-card-head">
          <div>
            <p className="eyebrow">Sicherheit</p>
            <h3>Passwort ändern</h3>
          </div>
        </header>
        <p className="settings-card-lead muted">
          Mindestens 8 Zeichen, zur Kontrolle zweimal eingeben. Mit dem Auge kannst du mitlesen, was du tippst.
        </p>
        <form className="stack-form" onSubmit={(e) => void onSubmit(e)}>
          <PasswordField
            label="Aktuelles Passwort"
            value={currentPassword}
            onChange={setCurrentPassword}
            revealed={showCurrent}
            onToggleReveal={() => setShowCurrent((v) => !v)}
            autoComplete="current-password"
            required
          />
          <PasswordField
            label="Neues Passwort"
            value={newPassword}
            onChange={setNewPassword}
            revealed={showNew}
            onToggleReveal={() => setShowNew((v) => !v)}
            autoComplete="new-password"
            required
            minLength={8}
          />
          <PasswordField
            label="Neues Passwort wiederholen"
            value={confirmPassword}
            onChange={setConfirmPassword}
            revealed={showNew}
            onToggleReveal={() => setShowNew((v) => !v)}
            autoComplete="new-password"
            required
            minLength={8}
          />
          <PasswordMatchHint value={newPassword} confirm={confirmPassword} />
          {error ? <p className="form-error">{error}</p> : null}
          {ok ? <p className="form-success">{ok}</p> : null}
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Speichern…" : "Passwort speichern"}
          </button>
        </form>
        <button
          type="button"
          className="btn btn-ghost portal-account-logout"
          onClick={() => void logout()}
        >
          Abmelden
        </button>
      </section>
    </div>
  );
}
