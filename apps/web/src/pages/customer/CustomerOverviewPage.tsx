import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { api } from "../../api";
import { Checkbox } from "../../components/Checkbox";
import { CustomerFields } from "../../components/CustomerFields";
import { customerAddressLine } from "../../lib/customer";
import { emptyCustomerForm, type Customer } from "../../types";

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

function PortalAccessPanel({ customerId, email }: { customerId: string; email: string | null }) {
  const [username, setUsername] = useState(email?.split("@")[0] ?? "");
  const [password, setPassword] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [exists, setExists] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api.portalUser(customerId).then((res) => {
      if (res.portalUser) {
        setExists(true);
        setUsername(res.portalUser.username);
        setEnabled(res.portalUser.enabled);
      } else {
        setExists(false);
        setUsername(email?.split("@")[0] ?? "");
        setEnabled(true);
      }
    });
  }, [customerId, email]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setOk("");
    try {
      const body: Record<string, unknown> = { username, enabled };
      if (password) body.password = password;
      await api.upsertPortalUser(customerId, body);
      setExists(true);
      setPassword("");
      setOk(password ? "Zugang gespeichert. Passwort dem Kunden mitteilen." : "Zugang gespeichert.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section">
      <div className="panel">
        <h2>Portal-Zugang</h2>
        <p className="muted">
          Login unter <code>/portal/login</code>. Ein Benutzer pro Kunde. Passwort nur hier setzen, nicht per
          E-Mail.
        </p>
        <form className="stack-form" onSubmit={(e) => void save(e)}>
          <label className="field">
            <span>Benutzername</span>
            <input required value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>
          <label className="field">
            <span>{exists ? "Neues Passwort (leer = unverändert)" : "Passwort (mind. 8 Zeichen)"}</span>
            <input
              type="password"
              minLength={exists ? undefined : 8}
              required={!exists}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          <Checkbox label="Zugang aktiv" checked={enabled} onChange={setEnabled} />
          {error ? <p className="form-error">{error}</p> : null}
          {ok ? <p className="muted">{ok}</p> : null}
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Speichern…" : exists ? "Zugang aktualisieren" : "Zugang anlegen"}
          </button>
        </form>
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
