import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../../auth";
import { api } from "../../api";
import { HelpHint } from "../../components/HelpHint";
import { MailNotifyList } from "../../components/MailNotifyList";
import { Modal } from "../../components/Modal";
import { PasswordField, PasswordMatchHint } from "../../components/PasswordField";
import { mailCustomerKinds, mailKindLabel, type PortalMailAccount } from "../../types";

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
  const [mailBusy, setMailBusy] = useState(false);
  const [mailErr, setMailErr] = useState("");
  const [mailOk, setMailOk] = useState("");
  const [account, setAccount] = useState<PortalMailAccount | null>(null);
  const [notifyEmail, setNotifyEmail] = useState("");
  const [mailOpen, setMailOpen] = useState(false);
  const [draftEmail, setDraftEmail] = useState("");
  const [draftNotify, setDraftNotify] = useState<PortalMailAccount["notify"] | null>(null);

  useEffect(() => {
    void api
      .portalAccount()
      .then((row) => {
        setAccount(row);
        setNotifyEmail(row.email);
      })
      .catch((e) => setMailErr(e instanceof Error ? e.message : "Laden fehlgeschlagen"));
  }, []);

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

  async function saveMail(e: FormEvent) {
    e.preventDefault();
    setMailErr("");
    setMailOk("");
    setMailBusy(true);
    try {
      const updated = await api.updatePortalAccount({
        email: draftEmail,
        notify: draftNotify ?? account?.notify,
      });
      setAccount(updated);
      setNotifyEmail(updated.email);
      setMailOk("Benachrichtigungen gespeichert.");
      setMailOpen(false);
    } catch (err) {
      setMailErr(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    } finally {
      setMailBusy(false);
    }
  }

  function openMail() {
    setMailErr("");
    setMailOk("");
    setDraftEmail(notifyEmail);
    setDraftNotify(account ? { ...account.notify } : null);
    setMailOpen(true);
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
              <p className="eyebrow">Benachrichtigungen</p>
              <div className="page-head-title">
                <h3>E-Mail</h3>
                <HelpHint text="An diese Adresse gehen Ticket- und Termin-Mails. Typen, die Ihr Systemhaus ausgeschaltet hat, erscheinen nicht." />
              </div>
            </div>
            <button type="button" className="btn btn-primary btn-sm" onClick={openMail} disabled={!account}>
              Bearbeiten
            </button>
          </header>
          {account ? (
            <p className="muted portal-mail-summary">
              {notifyEmail || "Keine Adresse hinterlegt."}
              {" · "}
              {mailCustomerKinds.filter((k) => account.allowed[k] && account.notify[k]).length === 0
                ? "keine Mails"
                : `${mailCustomerKinds.filter((k) => account.allowed[k] && account.notify[k]).length} Typen aktiv`}
            </p>
          ) : (
            <p className="muted">Lade…</p>
          )}
          {mailErr && !mailOpen ? <p className="form-error">{mailErr}</p> : null}
          {mailOk ? <p className="form-success">{mailOk}</p> : null}
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

      <Modal
        open={mailOpen}
        title="Benachrichtigungen"
        onClose={() => {
          if (!mailBusy) setMailOpen(false);
        }}
        className="modal-mail"
      >
        <form className="stack-form" onSubmit={(e) => void saveMail(e)}>
          <label className="field">
            <span>E-Mail-Adresse</span>
            <input
              type="email"
              value={draftEmail}
              onChange={(e) => setDraftEmail(e.target.value)}
              autoComplete="email"
            />
          </label>
          {account && draftNotify ? (
            <MailNotifyList
              items={mailCustomerKinds
                .filter((kind) => account.allowed[kind])
                .map((kind) => ({
                  id: kind,
                  label: mailKindLabel[kind],
                  checked: draftNotify[kind],
                  onChange: (checked) =>
                    setDraftNotify((n) => (n ? { ...n, [kind]: checked } : n)),
                }))}
            />
          ) : null}
          {mailErr ? <p className="form-error">{mailErr}</p> : null}
          <div className="mail-settings-actions modal-actions">
            <button className="btn btn-primary" type="submit" disabled={mailBusy}>
              {mailBusy ? "Speichern…" : "Speichern"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={mailBusy}
              onClick={() => setMailOpen(false)}
            >
              Abbrechen
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
