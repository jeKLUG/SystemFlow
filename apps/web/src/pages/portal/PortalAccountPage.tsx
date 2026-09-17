import { useState, type FormEvent } from "react";
import { useAuth } from "../../auth";
import { HelpHint } from "../../components/HelpHint";
import { PasswordField, PasswordMatchHint } from "../../components/PasswordField";

/**
 * Portal-Konto: Profil und Passwort ändern.
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

  const username = user?.username ?? "";
  const displayName = user?.customerName || username || "Konto";
  const showUsernameChip = Boolean(username && displayName !== username);

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
        <h2>Konto</h2>
      </header>
      <div className="portal-account-stack">
        <section className="panel portal-account-who" aria-label="Angemeldet">
          <span className="avatar" aria-hidden>
            {(username || "?").slice(0, 1).toUpperCase()}
          </span>
          <span className="portal-account-who-meta">
            <strong className="portal-account-who-name">{displayName}</strong>
            {showUsernameChip ? (
              <span className="portal-account-handle">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                  <path
                    d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="portal-account-handle-k">Benutzername</span>
                <span className="portal-account-handle-v">{username}</span>
              </span>
            ) : (
              <span className="portal-account-handle is-plain">Portal-Benutzer</span>
            )}
          </span>
        </section>
        <section className="panel settings-card portal-account-card">
          <header className="settings-card-head">
            <div>
              <p className="eyebrow">Sicherheit</p>
              <div className="page-head-title">
                <h3>Passwort ändern</h3>
                <HelpHint text="Mindestens 8 Zeichen, zur Kontrolle zweimal eingeben. Mit dem Auge kannst du mitlesen, was du tippst." />
              </div>
            </div>
          </header>
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
    </div>
  );
}
