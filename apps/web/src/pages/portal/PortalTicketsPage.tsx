import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { Modal } from "../../components/Modal";
import { formatDate, ticketPriorityLabel, ticketStatusLabel } from "../../lib/labels";
import type { TicketItem, TicketPriority } from "../../types";

/**
 * Kunden-Ticketliste und Neuanlage.
 */
export function PortalTicketsPage() {
  const [rows, setRows] = useState<TicketItem[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ title: "", description: "", priority: "normal" as TicketPriority });

  async function reload() {
    setRows(await api.portalTickets());
  }

  useEffect(() => {
    void reload().catch((err) => setError(err instanceof Error ? err.message : "Laden fehlgeschlagen"));
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.createPortalTicket(form);
      setForm({ title: "", description: "", priority: "normal" });
      setOpen(false);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Anlegen fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h2>Tickets</h2>
          <p className="muted">Anfragen an Ihr Systemhaus</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
          Ticket erstellen
        </button>
      </header>
      {error ? <p className="form-error">{error}</p> : null}
      {rows.length === 0 ? (
        <p className="empty panel">Noch keine Tickets.</p>
      ) : (
        <ul className="list">
          {rows.map((t) => (
            <li key={t.id}>
              <Link className="list-row ticket-row" to={`/portal/tickets/${t.id}`}>
                <div className="ticket-row-main">
                  <strong>
                    {t.number} · {t.title}
                  </strong>
                  <span className="muted">{formatDate(t.updatedAt)}</span>
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
      <Modal open={open} title="Neues Ticket" onClose={() => setOpen(false)}>
        <form className="stack-form" onSubmit={(e) => void create(e)}>
          <label className="field">
            <span>Betreff</span>
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
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
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Senden…" : "Absenden"}
          </button>
        </form>
      </Modal>
    </div>
  );
}
