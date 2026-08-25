import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { CustomerPicker } from "../components/CustomerPicker";
import { formatDate } from "../lib/labels";
import { pushRecentCustomer } from "../lib/recentCustomers";
import type { DocumentItem } from "../types";

/**
 * Große, mobilfreundliche Schnellnotiz – auch ohne bestehenden Kunden (Anruf-Inbox).
 */
export function QuickNotePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [customerId, setCustomerId] = useState(params.get("customerId") ?? "");
  const [title, setTitle] = useState("Schnellnotiz");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [unassigned, setUnassigned] = useState<DocumentItem[]>([]);

  useEffect(() => {
    const preset = params.get("customerId");
    if (preset) setCustomerId(preset);
  }, [params]);

  useEffect(() => {
    void api
      .documents(undefined, { unassigned: true, limit: 8 })
      .then(setUnassigned)
      .catch(() => setUnassigned([]));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError("");
    try {
      const content = JSON.stringify({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: text.trim() }],
          },
        ],
      });
      if (customerId) pushRecentCustomer(customerId);
      const doc = await api.createDocument({
        ...(customerId ? { customerId } : {}),
        type: "note",
        title: title.trim() || "Schnellnotiz",
        content,
      });
      navigate(`/documents/${doc.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page quick-page">
      <div className="section-head">
        <h2>Schnellnotiz</h2>
        <p className="muted">Kunde optional – z. B. bei neuen Anrufern später zuordnen.</p>
      </div>

      <form className="panel quick-form" onSubmit={onSubmit}>
        <label className="field">
          <span>Kunde (optional)</span>
          <CustomerPicker
            value={customerId}
            onChange={setCustomerId}
            allowEmpty
            emptyLabel="Ohne Kunde / neuer Anrufer"
            required={false}
            placeholder="Kunde tippen zum Suchen…"
            className="touch-picker"
          />
        </label>
        <label className="field">
          <span>Titel</span>
          <input
            className="touch-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Notiz</span>
          <textarea
            className="touch-input touch-area"
            rows={8}
            value={text}
            onChange={(e) => setText(e.target.value)}
            required
            placeholder="Was ist zu notieren?"
          />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button className="btn btn-primary btn-xl" type="submit" disabled={busy || !text.trim()}>
          {busy ? "Speichert…" : "Notiz speichern"}
        </button>
      </form>

      {unassigned.length > 0 ? (
        <section className="panel quick-unassigned">
          <h3>Offen ohne Kunde</h3>
          <ul className="quick-unassigned-list">
            {unassigned.map((doc) => (
              <li key={doc.id}>
                <Link to={`/documents/${doc.id}`}>
                  <strong>{doc.title}</strong>
                  <span className="muted">{formatDate(doc.updatedAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
