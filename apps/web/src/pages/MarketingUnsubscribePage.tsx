import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";

/**
 * Öffentliche Bestätigung: Lead wird nicht mehr angeschrieben.
 */
export function MarketingUnsubscribePage() {
  const { token = "" } = useParams();
  const [state, setState] = useState<"loading" | "ok" | "already" | "missing">("loading");
  const [company, setCompany] = useState("");

  useEffect(() => {
    let cancelled = false;
    void api
      .marketingUnsubscribe(token)
      .then((res) => {
        if (cancelled) return;
        setCompany(res.company ?? "");
        setState(res.already ? "already" : "ok");
      })
      .catch(() => {
        if (!cancelled) setState("missing");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="login-page vault-share-page">
      <div className="atmosphere" aria-hidden="true" />
      <div className="login-layout">
        <section className="login-hero">
          <div className="sidebar-brand" style={{ border: 0, padding: 0, marginBottom: "1rem" }}>
            <img className="brand-mark" src="/logo.png" alt="" width={40} height={40} />
            <strong>Systemhaus-Ess</strong>
          </div>
          <h1>Abmeldung</h1>
          <p className="muted">Keine weiteren Marketing-Mails an diese Adresse.</p>
        </section>
        <div className="login-panel panel">
          {state === "loading" ? <p>Einen Moment…</p> : null}
          {state === "ok" ? (
            <>
              <p>
                Wir schreiben {company ? <strong>{company}</strong> : "Sie"} nicht mehr an.
              </p>
              <p className="muted">Falls das ein Versehen war, einfach kurz Bescheid geben.</p>
            </>
          ) : null}
          {state === "already" ? (
            <p>Diese Adresse war bereits abgemeldet{company ? ` (${company})` : ""}.</p>
          ) : null}
          {state === "missing" ? <p>Dieser Link ist ungültig oder abgelaufen.</p> : null}
          {state !== "loading" ? (
            <p>
              <Link className="btn btn-ghost" to="/login">
                Zur Anmeldung
              </Link>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
