import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import { copyToClipboard } from "../lib/clipboard";
import { formatTotpCode, generateTotp } from "../lib/totp";
import type { VaultShareOpened, VaultSharePublicStatus } from "../types";

/**
 * Öffentliche Einweg-Abrufseite: PIN eingeben → Geheimnis einmal anzeigen.
 * Keine Anmeldung, keine Vault-Passphrase.
 */
export function VaultSharePage() {
  const { token = "" } = useParams();
  const [meta, setMeta] = useState<VaultSharePublicStatus | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState<VaultShareOpened | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [copyHint, setCopyHint] = useState("");
  const [totpCode, setTotpCode] = useState("");

  useEffect(() => {
    let cancelled = false;
    void api
      .vaultShareStatus(token)
      .then((s) => {
        if (!cancelled) setMeta(s);
      })
      .catch(() => {
        if (!cancelled) setMeta({ status: "not_found" });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!opened?.totpSecret) {
      setTotpCode("");
      return;
    }
    const secret = opened.totpSecret;
    let cancelled = false;
    async function tick() {
      try {
        const result = await generateTotp(secret);
        if (!cancelled) setTotpCode(formatTotpCode(result.code));
      } catch {
        if (!cancelled) setTotpCode("");
      }
    }
    void tick();
    const id = window.setInterval(() => void tick(), 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [opened?.totpSecret]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api.vaultShareOpen(token, pin.trim());
      setOpened(result);
      setMeta({
        status: result.viewsRemaining > 0 ? "ok" : "consumed",
        expiresAt: result.expiresAt,
        viewsRemaining: result.viewsRemaining,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Abruf fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  async function copyText(value: string, label: string) {
    const ok = await copyToClipboard(value);
    setCopyHint(ok ? `${label} kopiert` : "Kopieren fehlgeschlagen");
    window.setTimeout(() => setCopyHint(""), 2000);
  }

  const blocked =
    meta &&
    meta.status !== "ok" &&
    !(opened && meta.status === "consumed");

  return (
    <div className="login-page vault-share-page">
      <div className="atmosphere" aria-hidden="true" />
      <div className="login-layout">
        <section className="login-hero">
          <div className="sidebar-brand" style={{ border: 0, padding: 0, marginBottom: "1rem" }}>
            <img className="brand-mark" src="/logo.png" alt="" width={40} height={40} />
            <strong>Systemhaus-Ess</strong>
          </div>
          <h1>Geteilter Zugang</h1>
          <p className="muted">Einmaliger Abruf.</p>
        </section>

        <div className="login-panel panel">
          {!meta ? (
            <p>Link wird geprüft…</p>
          ) : blocked && !opened ? (
            <div className="form-stack vault-share-stack">
              <h2>
                {meta.status === "expired"
                  ? "Link abgelaufen"
                  : meta.status === "consumed"
                    ? "Bereits genutzt"
                    : meta.status === "revoked"
                      ? "Widerrufen"
                      : "Link ungültig"}
              </h2>
              <p className="muted">
                Dieser Share-Link kann nicht mehr geöffnet werden. Bitte den Absender um einen neuen
                Link bitten.
              </p>
            </div>
          ) : opened ? (
            <div className="form-stack vault-share-stack vault-share-result">
              <h2>{opened.title || "Zugangsdaten"}</h2>
              {opened.viewsRemaining === 0 ? (
                <p className="vault-reveal-hint">
                  Einmal angezeigt – Link ist danach ungültig. Notieren oder kopieren Sie die Daten
                  jetzt.
                </p>
              ) : (
                <p className="vault-reveal-hint">
                  Noch {opened.viewsRemaining} Abruf
                  {opened.viewsRemaining === 1 ? "" : "e"} möglich.
                </p>
              )}
              {copyHint ? <p className="form-success">{copyHint}</p> : null}
              <div className="vault-share-fields">
                {opened.username ? (
                  <div className="vault-share-field">
                    <span className="label">Benutzer</span>
                    <div className="vault-secret-line">
                      <span>{opened.username}</span>
                      <button
                        type="button"
                        className="vault-share-icon-btn"
                        title="Benutzer kopieren"
                        aria-label="Benutzer kopieren"
                        onClick={() => void copyText(opened.username!, "Benutzer")}
                      >
                        <CopyIcon />
                      </button>
                    </div>
                  </div>
                ) : null}
                {opened.password ? (
                  <div className="vault-share-field">
                    <span className="label">Passwort</span>
                    <div className="vault-secret-line">
                      <span className="vault-mono">
                        {showPassword ? opened.password : "••••••••••••"}
                      </span>
                      <button
                        type="button"
                        className="vault-share-icon-btn"
                        title={showPassword ? "Passwort verbergen" : "Passwort zeigen"}
                        aria-label={showPassword ? "Passwort verbergen" : "Passwort zeigen"}
                        onClick={() => setShowPassword((v) => !v)}
                      >
                        {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                      </button>
                      <button
                        type="button"
                        className="vault-share-icon-btn"
                        title="Passwort kopieren"
                        aria-label="Passwort kopieren"
                        onClick={() => void copyText(opened.password!, "Passwort")}
                      >
                        <CopyIcon />
                      </button>
                    </div>
                  </div>
                ) : null}
                {opened.url ? (
                  <div className="vault-share-field">
                    <span className="label">URL</span>
                    <div className="vault-secret-line">
                      <span>{opened.url}</span>
                      <button
                        type="button"
                        className="vault-share-icon-btn"
                        title="URL kopieren"
                        aria-label="URL kopieren"
                        onClick={() => void copyText(opened.url!, "URL")}
                      >
                        <CopyIcon />
                      </button>
                    </div>
                  </div>
                ) : null}
                {totpCode ? (
                  <div className="vault-share-field">
                    <span className="label">2FA-Code</span>
                    <div className="vault-secret-line">
                      <span className="vault-mono vault-totp-code">{totpCode}</span>
                      <button
                        type="button"
                        className="vault-share-icon-btn"
                        title="2FA-Code kopieren"
                        aria-label="2FA-Code kopieren"
                        onClick={() => void copyText(totpCode.replace(/\s/g, ""), "2FA-Code")}
                      >
                        <CopyIcon />
                      </button>
                    </div>
                  </div>
                ) : null}
                {opened.notes ? (
                  <div className="vault-share-field">
                    <span className="label">Notizen</span>
                    <pre className="vault-notes vault-share-notes">{opened.notes}</pre>
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <form className="form-stack vault-share-stack" onSubmit={onSubmit}>
              <h2>PIN eingeben</h2>
              <p className="muted">
                Den 6-stelligen PIN erhalten Sie separat vom Absender – nicht im Link.
              </p>
              {meta.expiresAt ? (
                <p className="muted">
                  Gültig bis {new Date(meta.expiresAt).toLocaleString("de-DE")}
                  {meta.viewsRemaining != null
                    ? ` · ${meta.viewsRemaining} Abruf${meta.viewsRemaining === 1 ? "" : "e"}`
                    : ""}
                </p>
              ) : null}
              <label className="field">
                <span>PIN</span>
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="\d{6}"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                  autoFocus
                />
              </label>
              {error ? <p className="form-error">{error}</p> : null}
              <button
                type="submit"
                className="btn btn-primary btn-xl"
                disabled={busy || pin.length !== 6}
              >
                {busy ? "Prüfen…" : "Anzeigen"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M2.42012 12.7132C2.28394 12.4975 2.21584 12.3897 2.17772 12.2234C2.14909 12.0985 2.14909 11.9015 2.17772 11.7766C2.21584 11.6103 2.28394 11.5025 2.42012 11.2868C3.54553 9.50484 6.8954 5 12.0004 5C17.1054 5 20.4553 9.50484 21.5807 11.2868C21.7169 11.5025 21.785 11.6103 21.8231 11.7766C21.8517 11.9015 21.8517 12.0985 21.8231 12.2234C21.785 12.3897 21.7169 12.4975 21.5807 12.7132C20.4553 14.4952 17.1054 19 12.0004 19C6.8954 19 3.54553 14.4952 2.42012 12.7132Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12.0004 15C13.6573 15 15.0004 13.6569 15.0004 12C15.0004 10.3431 13.6573 9 12.0004 9C10.3435 9 9.0004 10.3431 9.0004 12C9.0004 13.6569 10.3435 15 12.0004 15Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M10.7429 5.09232C11.1494 5.03223 11.5686 5 12.0004 5C17.1054 5 20.4553 9.50484 21.5807 11.2868C21.7169 11.5025 21.785 11.6103 21.8231 11.7767C21.8518 11.9016 21.8517 12.0987 21.8231 12.2236C21.7849 12.3899 21.7164 12.4985 21.5792 12.7156C21.2793 13.1901 20.8222 13.8571 20.2165 14.5805M6.72432 6.71504C4.56225 8.1817 3.09445 10.2194 2.42111 11.2853C2.28428 11.5019 2.21587 11.6102 2.17774 11.7765C2.1491 11.9014 2.14909 12.0984 2.17771 12.2234C2.21583 12.3897 2.28393 12.4975 2.42013 12.7132C3.54554 14.4952 6.89541 19 12.0004 19C14.0588 19 15.8319 18.2676 17.2888 17.2766M3.00042 3L21.0004 21M9.8791 9.87868C9.3362 10.4216 9.00042 11.1716 9.00042 12C9.00042 13.6569 10.3436 15 12.0004 15C12.8288 15 13.5788 14.6642 14.1217 14.1213"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M16 16V18.8C16 19.9201 16 20.4802 15.782 20.908C15.5903 21.2843 15.2843 21.5903 14.908 21.782C14.4802 22 13.9201 22 12.8 22H5.2C4.0799 22 3.51984 22 3.09202 21.782C2.71569 21.5903 2.40973 21.2843 2.21799 20.908C2 20.4802 2 19.9201 2 18.8V11.2C2 10.0799 2 9.51984 2.21799 9.09202C2.40973 8.71569 2.71569 8.40973 3.09202 8.21799C3.51984 8 4.0799 8 5.2 8H8M11.2 16H18.8C19.9201 16 20.4802 16 20.908 15.782C21.2843 15.5903 21.5903 15.2843 21.782 14.908C22 14.4802 22 13.9201 22 12.8V5.2C22 4.0799 22 3.51984 21.782 3.09202C21.5903 2.71569 21.2843 2.40973 20.908 2.21799C20.4802 2 19.9201 2 18.8 2H11.2C10.0799 2 9.51984 2 9.09202 2.21799C8.71569 2.40973 8.40973 2.71569 8.21799 3.09202C8 3.51984 8 4.07989 8 5.2V12.8C8 13.9201 8 14.4802 8.21799 14.908C8.40973 15.2843 8.71569 15.5903 9.09202 15.782C9.51984 16 10.0799 16 11.2 16Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
