import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../../api";
import { CustomerPicker } from "../../components/CustomerPicker";
import { Modal } from "../../components/Modal";
import { customerDisplayName } from "../../lib/customer";
import { formatDate, ticketPriorityLabel, ticketStatusLabel } from "../../lib/labels";
import type { TicketItem, TicketPriority } from "../../types";

const statusFilters: { id: string; label: string }[] = [
  { id: "open_any", label: "Offen" },
  { id: "open", label: "Neu" },
  { id: "in_progress", label: "In Bearbeitung" },
  { id: "waiting_customer", label: "Wartet" },
  { id: "resolved", label: "Gelöst" },
  { id: "closed", label: "Geschlossen" },
  { id: "all", label: "Alle" },
];

/**
 * Staff-Ticket-Queue (global oder je Kunde).
 */
export function TicketsPage() {
  const { id: routeCustomerId } = useParams();
  const customerId = routeCustomerId || "";
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState<TicketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    customerId: customerId,
    title: "",
    description: "",
    priority: "normal" as TicketPriority,
  });

  const status = searchParams.get("status") || (customerId ? "all" : "open_any");
  const priority = (searchParams.get("priority") || "") as TicketPriority | "";
  const slaOnly = searchParams.get("sla") === "1";
  const filterCustomer = searchParams.get("customer") || customerId;

  useEffect(() => {
    setForm((f) => ({ ...f, customerId: customerId || f.customerId }));
  }, [customerId]);

  useEffect(() => {
    setLoading(true);
    void api
      .tickets({
        customerId: filterCustomer || undefined,
        status: status === "all" ? undefined : status,
        priority: priority || undefined,
        slaBreached: slaOnly,
        limit: 200,
      })
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : "Laden fehlgeschlagen"))
      .finally(() => setLoading(false));
  }, [filterCustomer, status, priority, slaOnly]);

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  }

  const openCount = useMemo(
    () => rows.filter((t) => t.status === "open" || t.status === "in_progress" || t.status === "waiting_customer").length,
    [rows],
  );

  async function createTicket(e: FormEvent) {
    e.preventDefault();
    if (!form.customerId) {
      setError("Kunde wählen");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const created = await api.createTicket({
        customerId: form.customerId,
        title: form.title,
        description: form.description,
        priority: form.priority,
      });
      setCreateOpen(false);
      setForm({ customerId: customerId || form.customerId, title: "", description: "", priority: "normal" });
      navigate(customerId ? `/customers/${customerId}/tickets` : `/tickets/${created.id}`);
      if (customerId) {
        setRows((prev) => [created, ...prev]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Anlegen fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page tickets-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Helpdesk</p>
          <h2>Tickets</h2>
          <p className="muted">{loading ? "Laden…" : `${openCount} offen in dieser Ansicht`}</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
          Neues Ticket
        </button>
      </header>

      <div className="emails-toolbar tickets-toolbar">
        <div className="emails-dir-seg" role="group" aria-label="Status">
          {statusFilters.map((s) => (
            <button
              key={s.id}
              type="button"
              className={status === s.id ? "is-active" : ""}
              onClick={() => setFilter("status", s.id === "open_any" && !customerId ? "open_any" : s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <select
          value={priority}
          onChange={(e) => setFilter("priority", e.target.value)}
          aria-label="Priorität"
        >
          <option value="">Alle Prioritäten</option>
          {(Object.keys(ticketPriorityLabel) as TicketPriority[]).map((p) => (
            <option key={p} value={p}>
              {ticketPriorityLabel[p]}
            </option>
          ))}
        </select>
        <label className="check tickets-sla-filter">
          <input
            type="checkbox"
            checked={slaOnly}
            onChange={(e) => setFilter("sla", e.target.checked ? "1" : "")}
          />
          <span>Nur SLA überfällig</span>
        </label>
        {!customerId ? (
          <div className="tickets-customer-filter">
            <CustomerPicker
              value={filterCustomer}
              onChange={(id) => setFilter("customer", id)}
              allowEmpty
              emptyLabel="Alle Kunden"
              compact
            />
          </div>
        ) : null}
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      {loading ? (
        <p className="empty">Lade Tickets…</p>
      ) : rows.length === 0 ? (
        <p className="empty panel">Keine Tickets in dieser Ansicht.</p>
      ) : (
        <ul className="list ticket-list">
          {rows.map((t) => (
            <li key={t.id}>
              <Link className="list-row ticket-row" to={customerId ? `/tickets/${t.id}` : `/tickets/${t.id}`}>
                <div className="ticket-row-main">
                  <strong>
                    {t.number} · {t.title}
                  </strong>
                  <span className="muted">
                    {customerDisplayName({
                      name: t.customerName ?? "",
                      company: t.customerCompany ?? null,
                    })}
                    {" · "}
                    {formatDate(t.updatedAt)}
                  </span>
                </div>
                <div className="list-meta">
                  <span className={`badge badge-ticket-${t.status}`}>{ticketStatusLabel[t.status]}</span>
                  <span className={`badge badge-prio-${t.priority}`}>{ticketPriorityLabel[t.priority]}</span>
                  {t.slaBreached ? <span className="badge badge-warn">SLA</span> : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Modal open={createOpen} title="Neues Ticket" onClose={() => setCreateOpen(false)}>
        <form className="stack-form" onSubmit={createTicket}>
          {!customerId ? (
            <label className="field">
              <span>Kunde</span>
              <CustomerPicker
                value={form.customerId}
                onChange={(id) => setForm({ ...form, customerId: id })}
                allowEmpty={false}
                required
              />
            </label>
          ) : null}
          <label className="field">
            <span>Titel</span>
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Beschreibung</span>
            <textarea
              rows={5}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Priorität</span>
            <select
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value as TicketPriority })}
            >
              {(Object.keys(ticketPriorityLabel) as TicketPriority[]).map((p) => (
                <option key={p} value={p}>
                  {ticketPriorityLabel[p]}
                </option>
              ))}
            </select>
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <div className="form-actions">
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? "Anlegen…" : "Ticket anlegen"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setCreateOpen(false)}>
              Abbrechen
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

