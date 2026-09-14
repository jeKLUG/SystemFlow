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
              {copyHint ? <p className="form-success">{copyHint}</p> : null}
              <div className="vault-share-fields">
                {opened.username ? (
                  <div className="vault-share-field">
                    <span className="label">Benutzer</span>
                    <div className="vault-secret-line">
                      <span>{opened.username}</span>
                      <button
                        type="button"
                        className="vault-entry-icon-btn"
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
                        className="vault-entry-icon-btn"
                        title={showPassword ? "Passwort verbergen" : "Passwort zeigen"}
                        aria-label={showPassword ? "Passwort verbergen" : "Passwort zeigen"}
                        onClick={() => setShowPassword((v) => !v)}
                      >
                        {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                      </button>
                      <button
                        type="button"
                        className="vault-entry-icon-btn"
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
                        className="vault-entry-icon-btn"
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
                        className="vault-entry-icon-btn"
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
              {opened.viewsRemaining === 0 ? (
                <div className="vault-share-warn" role="status">
                  <WarningIcon />
                  <p>
                    Einmal angezeigt – Link ist danach ungültig. Notieren oder kopieren Sie die Daten
                    jetzt.
                  </p>
                </div>
              ) : (
                <p className="muted vault-share-remaining">
                  Noch {opened.viewsRemaining} Abruf
                  {opened.viewsRemaining === 1 ? "" : "e"} möglich.
                </p>
              )}
            </div>
          ) : (
            <form className="form-stack vault-share-stack" onSubmit={onSubmit}>
              <h2>PIN eingeben</h2>
              <p className="muted">
                Den 6-stelligen PIN erhalten Sie separat vom Absender.
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
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M2.9 12C4.1 8.8 7.7 5 12 5s7.9 3.8 9.1 7c-1.2 3.2-4.8 7-9.1 7s-7.9-3.8-9.1-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M4 4l16 16M10.5 10.7A3 3 0 0 0 13.3 13.5" strokeLinecap="round" />
      <path
        d="M9.2 5.6A10.5 10.5 0 0 1 12 5c5.2 0 8.8 3.8 10 7-0.5 1.3-1.4 2.8-2.8 4.1M6.2 6.8C4.5 8.1 3.4 9.8 2.9 12c1.2 3.2 4.8 7 9.1 7 1.3 0 2.5-.3 3.6-.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="8.5" y="8.5" width="10" height="10" rx="2" />
      <path d="M6.5 15.5V7A1.5 1.5 0 0 1 8 5.5h8.5" strokeLinecap="round" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M11.9998 8.99999V13M11.9998 17H12.0098M10.6151 3.89171L2.39019 18.0983C1.93398 18.8863 1.70588 19.2803 1.73959 19.6037C1.769 19.8857 1.91677 20.142 2.14613 20.3088C2.40908 20.5 2.86435 20.5 3.77487 20.5H20.2246C21.1352 20.5 21.5904 20.5 21.8534 20.3088C22.0827 20.142 22.2305 19.8857 22.2599 19.6037C22.2936 19.2803 22.0655 18.8863 21.6093 18.0983L13.3844 3.89171C12.9299 3.10654 12.7026 2.71396 12.4061 2.58211C12.1474 2.4671 11.8521 2.4671 11.5935 2.58211C11.2969 2.71396 11.0696 3.10655 10.6151 3.89171Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
