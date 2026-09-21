import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { api } from "../../api";
import { CustomerFields } from "../../components/CustomerFields";
import { MailNotifyList } from "../../components/MailNotifyList";
import { PasswordField, PasswordMatchHint } from "../../components/PasswordField";
import { customerAddressLine } from "../../lib/customer";
import { formatDate } from "../../lib/labels";
import { summarizeMailNotify } from "../../lib/mailNotify";
import { formatTimeAgo } from "../../lib/tickets";
import { emptyCustomerForm, mailCustomerKinds, type Customer, type MailCustomerKind, type PortalUser } from "../../types";

type OutletCtx = {
  customer: Customer;
  setCustomer: (c: Customer) => void;
};

/**
 * Stammdaten und Kurzüberblick eines Kontakts oder Kunden.
 */
export function CustomerOverviewPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { customer, setCustomer } = useOutletContext<OutletCtx>();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(emptyCustomerForm);
  const [error, setError] = useState("");
  const [visitBusy, setVisitBusy] = useState(false);
  const [stats, setStats] = useState({
    wiki: 0,
    projects: 0,
    hours: 0,
    openTasks: 0,
    openTickets: 0,
  });

  useEffect(() => {
    setForm({
      name: customer.name,
      company: customer.company ?? "",
      contactPerson: customer.contactPerson ?? "",
      email: customer.email ?? "",
      phone: customer.phone ?? "",
      mobile: customer.mobile ?? "",
      address: customer.address ?? "",
      zip: customer.zip ?? "",
      city: customer.city ?? "",
      country: customer.country ?? "Deutschland",
      vatId: customer.vatId ?? "",
      website: customer.website ?? "",
      notes: customer.notes ?? "",
      kind: customer.kind ?? "customer",
      status: customer.status,
    });
  }, [customer]);

  useEffect(() => {
    void Promise.all([
      api.documents(id),
      api.projects(id),
      api.timeEntries(id),
      api.tasks(id),
      api.tickets({ customerId: id, status: "open_any" }),
    ]).then(([docs, projects, time, tasks, ticketRows]) => {
      setStats({
        wiki: docs.length,
        projects: projects.length,
        hours: time.summary.totalHours,
        openTasks: tasks.filter((t) => !t.done).length,
        openTickets: ticketRows.length,
      });
    });
  }, [id]);

  async function saveCustomer(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const updated = await api.updateCustomer(id, form);
      setCustomer(updated);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    }
  }

  async function removeCustomer() {
    const label = (customer.kind ?? "customer") === "contact" ? "Kontakt" : "Kunde";
    if (!confirm(`${label} und alle zugehörigen Daten wirklich löschen?`)) return;
    await api.deleteCustomer(id);
    navigate("/customers");
  }

  async function downloadVisitPdf() {
    setVisitBusy(true);
    setError("");
    try {
      await api.exportVisitPdf(id, customer.company || customer.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Besuchsblatt fehlgeschlagen");
    } finally {
      setVisitBusy(false);
    }
  }

  const kind = customer.kind ?? "customer";
  const isCustomer = kind === "customer";
  const address = customerAddressLine(customer);
  const hasAddress = address !== "–";
  const websiteHref = normalizeWebsite(customer.website);
  const statusLabel = customer.status === "inactive" ? "Inaktiv" : "Aktiv";

  return (
    <>
      <div className="stat-strip">
        <Link className="stat-chip" to="wiki">
          <strong>{stats.wiki}</strong>
          <span>Dokumente</span>
        </Link>
        <Link className="stat-chip" to="projects">
          <strong>{stats.projects}</strong>
          <span>Projekte</span>
        </Link>
        <Link className="stat-chip" to="time">
          <strong>{stats.hours}</strong>
          <span>Stunden gesamt</span>
        </Link>
        <Link className="stat-chip" to="tickets">
          <strong>{stats.openTickets}</strong>
          <span>Offene Tickets</span>
        </Link>
        <Link className="stat-chip" to="tasks">
          <strong>{stats.openTasks}</strong>
          <span>Offene Aufgaben</span>
        </Link>
      </div>

      <section className="section stammdaten-section">
        <div className={`panel stammdaten-panel${editing ? " is-editing" : ""}`}>
          <div className="stammdaten-panel-head">
            <div className="stammdaten-panel-title">
              <h2>Stammdaten</h2>
            </div>
            <div className="stammdaten-actions">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={visitBusy}
                title="PDF mit Kontakt, Anlagen, offenen Aufgaben und Zeiten"
                onClick={() => void downloadVisitPdf()}
              >
                {visitBusy ? "PDF…" : "Besuchsblatt"}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setEditing((v) => !v)}
              >
                {editing ? "Schließen" : "Bearbeiten"}
              </button>
              {!editing ? (
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => void removeCustomer()}
                >
                  Löschen
                </button>
              ) : null}
            </div>
          </div>

          {error && !editing ? <p className="form-error">{error}</p> : null}

          {editing ? (
            <form className="customer-edit-form" onSubmit={saveCustomer}>
              <CustomerFields form={form} onChange={setForm} showStatus />
              {error ? <p className="form-error">{error}</p> : null}
              <div className="stammdaten-form-actions">
                <button className="btn btn-primary" type="submit">
                  Speichern
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setEditing(false);
                    setError("");
                  }}
                >
                  Abbrechen
                </button>
              </div>
            </form>
          ) : (
            <div className="stammdaten-view">
              <div className="stammdaten-hero">
                <div className="stammdaten-hero-main">
                  <div className="stammdaten-badges">
                    <span className={`stammdaten-badge${isCustomer ? " is-customer" : ""}`}>
                      {isCustomer ? "Kunde" : "Kontakt"}
                    </span>
                    <span
                      className={`stammdaten-badge is-status${
                        customer.status === "inactive" ? " is-inactive" : ""
                      }`}
                    >
                      {statusLabel}
                    </span>
                  </div>
                  <h3 className="stammdaten-display-name">
                    {isCustomer
                      ? customer.company?.trim() || customer.name
                      : customer.name || customer.company || "Ohne Namen"}
                  </h3>
                </div>
              </div>

              <dl className="stammdaten-facts">
                {isCustomer ? (
                  <FactRow label="Kurzname" value={customer.name?.trim() || null} />
                ) : (
                  <FactRow label="Firma" value={customer.company?.trim() || null} />
                )}
                <FactRow
                  label="Ansprechpartner"
                  value={customer.contactPerson?.trim() || null}
                />
                <FactRow
                  label="E-Mail"
                  value={customer.email?.trim() || null}
                  href={customer.email?.trim() ? `mailto:${customer.email}` : undefined}
                />
                <FactRow
                  label="Telefon"
                  value={customer.phone?.trim() || null}
                  href={customer.phone?.trim() ? `tel:${customer.phone}` : undefined}
                />
                <FactRow
                  label="Mobil"
                  value={customer.mobile?.trim() || null}
                  href={customer.mobile?.trim() ? `tel:${customer.mobile}` : undefined}
                />
                <FactRow
                  label="Website"
                  value={customer.website?.trim() ? displayWebsite(customer.website) : null}
                  href={websiteHref ?? undefined}
                  external
                />
                <FactRow label="Adresse" value={hasAddress ? address : null} wide />
                <FactRow label="USt-IdNr." value={customer.vatId?.trim() || null} />
                <FactRow label="Notizen" value={customer.notes?.trim() || null} wide />
              </dl>
            </div>
          )}
        </div>
      </section>

      {isCustomer ? <PortalAccessPanel customerId={id} email={customer.email} /> : null}
    </>
  );
}

function emptyCustomerNotify(): Record<MailCustomerKind, boolean> {
  return Object.fromEntries(mailCustomerKinds.map((k) => [k, true])) as Record<MailCustomerKind, boolean>;
}

/**
 * Portal-Login je Kundenakte: aktivieren/deaktivieren, Zugangsdaten und Mail-Typen nur im Bearbeiten-Modus.
 */
function PortalAccessPanel({ customerId, email }: { customerId: string; email: string | null }) {
  const [portal, setPortal] = useState<PortalUser | null>(null);
  const [username, setUsername] = useState(email?.split("@")[0] ?? "");
  const [notifyEmail, setNotifyEmail] = useState(email ?? "");
  const [notify, setNotify] = useState<Record<MailCustomerKind, boolean>>(emptyCustomerNotify);
  const [allowed, setAllowed] = useState<Record<MailCustomerKind, boolean>>(emptyCustomerNotify);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [editing, setEditing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState("");

  const exists = Boolean(portal);
  const showFields = editing || (!exists && enabled);

  function applyPortal(row: PortalUser | null, nextAllowed?: Record<MailCustomerKind, boolean>) {
    setPortal(row);
    setEnabled(Boolean(row?.enabled));
    setUsername(row?.username || email?.split("@")[0] || "");
    setNotifyEmail(row?.email || email || "");
    setNotify(row?.notify ?? emptyCustomerNotify());
    if (nextAllowed) setAllowed(nextAllowed);
    setPassword("");
    setPasswordConfirm("");
    setShowPassword(false);
  }

  useEffect(() => {
    setLoaded(false);
    setEditing(false);
    setError("");
    setOk("");
    void api
      .portalUser(customerId)
      .then((res) => {
        if (res.allowed) setAllowed(res.allowed);
        applyPortal(res.portalUser, res.allowed);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Laden fehlgeschlagen"))
      .finally(() => setLoaded(true));
  }, [customerId, email]);

  async function setAccessEnabled(next: boolean) {
    setError("");
    setOk("");
    if (!exists) {
      setEnabled(next);
      if (!next) {
        setEditing(false);
        setPassword("");
        setPasswordConfirm("");
        setShowPassword(false);
      }
      return;
    }
    setBusy("toggle");
    try {
      const res = await api.upsertPortalUser(customerId, { enabled: next });
      applyPortal(res.portalUser, res.allowed);
      setEditing(false);
      setOk(next ? "Zugang ist aktiv." : "Zugang deaktiviert. Der Kunde kann sich nicht anmelden.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    } finally {
      setBusy("");
    }
  }

  async function saveCredentials(e: FormEvent) {
    e.preventDefault();
    setError("");
    setOk("");
    const changingPassword = Boolean(password || passwordConfirm);
    if (changingPassword || !exists) {
      if (password !== passwordConfirm) {
        setError("Die Passwörter stimmen nicht überein.");
        return;
      }
      if (password.length < 8) {
        setError("Passwort mindestens 8 Zeichen");
        return;
      }
    }
    setBusy("save");
    try {
      const body: Record<string, unknown> = {
        username,
        enabled: exists ? enabled : true,
        email: notifyEmail,
        notify,
      };
      if (changingPassword) body.password = password;
      const res = await api.upsertPortalUser(customerId, body);
      applyPortal(res.portalUser, res.allowed);
      setEditing(false);
      setOk(
        changingPassword
          ? "Zugangsdaten gespeichert. Passwort dem Kunden mitteilen – es wird nicht per E-Mail versendet."
          : "Zugang gespeichert.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    } finally {
      setBusy("");
    }
  }

  function startEdit() {
    setEditing(true);
    setOk("");
    setError("");
    setPassword("");
    setPasswordConfirm("");
    setShowPassword(false);
    setUsername(portal?.username || email?.split("@")[0] || "");
    setNotifyEmail(portal?.email || email || "");
    setNotify(portal?.notify ?? emptyCustomerNotify());
  }

  function cancelEdit() {
    setEditing(false);
    setPassword("");
    setPasswordConfirm("");
    setShowPassword(false);
    setUsername(portal?.username || email?.split("@")[0] || "");
    setNotifyEmail(portal?.email || email || "");
    setNotify(portal?.notify ?? emptyCustomerNotify());
    setError("");
    if (!exists) setEnabled(false);
  }

  const lastLogin = portal?.lastLoginAt
    ? `${formatTimeAgo(portal.lastLoginAt)} · ${formatDate(portal.lastLoginAt)}`
    : "Noch nie angemeldet";
  const statusLabel = !exists ? "Nicht eingerichtet" : enabled ? "Aktiv" : "Deaktiviert";
  const statusHint = enabled
    ? "Der Kunde kann sich unter /portal/login anmelden."
    : "Zugang gesperrt. Der Kunde kann sich nicht anmelden.";

  return (
    <section className="section">
      <div className={`panel portal-access-panel${!exists ? " is-empty" : ""}${enabled ? " is-on" : ""}`}>
        <div className="portal-access-head">
          <div>
            <h2>Portal-Zugang</h2>
          </div>
          <div className="portal-access-head-actions">
            {exists && !showFields ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={startEdit} disabled={Boolean(busy)}>
                Bearbeiten
              </button>
            ) : null}
            <label className={`portal-access-switch${enabled ? " is-on" : ""}`}>
              <input
                type="checkbox"
                role="switch"
                checked={enabled}
                disabled={!loaded || busy === "toggle"}
                onChange={(e) => void setAccessEnabled(e.target.checked)}
              />
              <span className="portal-access-track" aria-hidden />
              <span className="portal-access-switch-label">{enabled ? "Aktiv" : "Aus"}</span>
            </label>
          </div>
        </div>

        {!loaded ? (
          <p className="muted portal-access-body">Lade Zugang…</p>
        ) : (
          <div className="portal-access-body">
            <div className="portal-access-status">
              <span
                className={`portal-access-badge${exists && enabled ? " is-active" : exists ? " is-off" : ""}`}
              >
                {statusLabel}
              </span>
              {exists ? <p className="muted">{statusHint}</p> : null}
            </div>

            {exists && !showFields ? (
              <dl className="stammdaten-facts portal-access-facts">
                <FactRow label="Benutzername" value={portal?.username ?? null} />
                <FactRow label="E-Mail" value={portal?.email ?? null} />
                <FactRow label="Mails" value={summarizeMailNotify(portal?.notify, allowed)} wide />
                <FactRow label="Passwort" value="Gesetzt" />
                <FactRow label="Letzte Anmeldung" value={lastLogin} wide />
              </dl>
            ) : null}

            {showFields ? (
              <form className="stack-form portal-access-form" onSubmit={(e) => void saveCredentials(e)}>
                <label className="field">
                  <span>Benutzername</span>
                  <input
                    required
                    minLength={2}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="off"
                  />
                  <span className="field-hint muted">Login für das Kundenportal unter /portal/login</span>
                </label>
                <label className="field">
                  <span>E-Mail für Benachrichtigungen</span>
                  <input
                    type="email"
                    value={notifyEmail}
                    onChange={(e) => setNotifyEmail(e.target.value)}
                    autoComplete="off"
                  />
                  <span className="field-hint muted">
                    An diese Adresse gehen Ticket- und Termin-Mails. Leer = E-Mail aus den Stammdaten.
                  </span>
                </label>
                <div className="field">
                  <span>Benachrichtigungen</span>
                  <p className="field-hint muted">
                    Der Kunde kann die Typen im Portal nicht ändern. Global aus unter Einstellungen wird nicht
                    versendet.
                  </p>
                  <MailNotifyList
                    values={notify}
                    allowed={allowed}
                    onChange={(kind, checked) => setNotify((n) => ({ ...n, [kind]: checked }))}
                  />
                </div>
                <div className="portal-access-secrets">
                  <p className="portal-access-secrets-lead muted">
                    {exists
                      ? "Neues Passwort nur setzen, wenn es geändert werden soll. Zweimal eingeben."
                      : "Passwort zweimal eingeben, mindestens 8 Zeichen."}
                  </p>
                  <PasswordField
                    label={exists ? "Neues Passwort" : "Passwort"}
                    value={password}
                    onChange={setPassword}
                    revealed={showPassword}
                    onToggleReveal={() => setShowPassword((v) => !v)}
                    autoComplete="new-password"
                    required={!exists}
                    minLength={exists ? undefined : 8}
                    placeholder={exists ? "Unverändert lassen…" : undefined}
                  />
                  <PasswordField
                    label={exists ? "Neues Passwort wiederholen" : "Passwort wiederholen"}
                    value={passwordConfirm}
                    onChange={setPasswordConfirm}
                    revealed={showPassword}
                    onToggleReveal={() => setShowPassword((v) => !v)}
                    autoComplete="new-password"
                    required={!exists}
                    minLength={exists ? undefined : 8}
                  />
                  <PasswordMatchHint value={password} confirm={passwordConfirm} />
                </div>
                <div className="stammdaten-form-actions">
                  <button className="btn btn-primary" type="submit" disabled={Boolean(busy)}>
                    {busy === "save" ? "Speichern…" : exists ? "Zugangsdaten speichern" : "Zugang anlegen"}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={cancelEdit} disabled={Boolean(busy)}>
                    Abbrechen
                  </button>
                </div>
              </form>
            ) : null}

            {error ? <p className="form-error">{error}</p> : null}
            {ok ? <p className="muted portal-access-ok">{ok}</p> : null}
          </div>
        )}
      </div>
    </section>
  );
}

function FactRow({
  label,
  value,
  href,
  external,
  wide,
}: {
  label: string;
  value: string | null;
  href?: string;
  external?: boolean;
  wide?: boolean;
}) {
  const empty = !value;
  return (
    <div className={`stammdaten-fact${wide ? " is-wide" : ""}${empty ? " is-empty" : ""}`}>
      <dt>{label}</dt>
      <dd>
        {empty ? (
          <span className="stammdaten-fact-blank" aria-hidden>
            —
          </span>
        ) : href ? (
          <a href={href} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

function normalizeWebsite(raw?: string | null): string | null {
  const value = raw?.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function displayWebsite(raw: string): string {
  return raw.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}
