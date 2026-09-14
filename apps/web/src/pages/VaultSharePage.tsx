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
          <p className="muted">Einmaliger Abruf – ohne Vault-Passphrase.</p>
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
              <div className="vault-reveal-grid">
                {opened.username ? (
                  <div>
                    <span className="label">Benutzer</span>
                    <div className="password-field">
                      <input readOnly value={opened.username} />
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => void copyText(opened.username!, "Benutzer")}
                      >
                        Kopieren
                      </button>
                    </div>
                  </div>
                ) : null}
                {opened.password ? (
                  <div>
                    <span className="label">Passwort</span>
                    <div className="password-field">
                      <input
                        readOnly
                        type={showPassword ? "text" : "password"}
                        value={opened.password}
                      />
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setShowPassword((v) => !v)}
                      >
                        {showPassword ? "Aus" : "An"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => void copyText(opened.password!, "Passwort")}
                      >
                        Kopieren
                      </button>
                    </div>
                  </div>
                ) : null}
                {opened.url ? (
                  <div className="full">
                    <span className="label">URL</span>
                    <div className="password-field">
                      <input readOnly value={opened.url} />
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => void copyText(opened.url!, "URL")}
                      >
                        Kopieren
                      </button>
                    </div>
                  </div>
                ) : null}
                {totpCode ? (
                  <div>
                    <span className="label">2FA-Code</span>
                    <div className="password-field">
                      <input readOnly value={totpCode} />
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => void copyText(totpCode.replace(/\s/g, ""), "2FA-Code")}
                      >
                        Kopieren
                      </button>
                    </div>
                  </div>
                ) : null}
                {opened.notes ? (
                  <div className="full">
                    <span className="label">Notizen</span>
                    <pre className="vault-notes">{opened.notes}</pre>
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
