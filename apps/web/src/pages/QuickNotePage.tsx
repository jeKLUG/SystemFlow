import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { CustomerPicker } from "../components/CustomerPicker";
import { pushRecentCustomer } from "../lib/recentCustomers";

/**
 * Große, mobilfreundliche Schnellnotiz-Erfassung.
 */
export function QuickNotePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [customerId, setCustomerId] = useState(params.get("customerId") ?? "");
  const [title, setTitle] = useState("Schnellnotiz");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const preset = params.get("customerId");
    if (preset) setCustomerId(preset);
  }, [params]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!customerId || !text.trim()) return;
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
      pushRecentCustomer(customerId);
      const doc = await api.createDocument({
        customerId,
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
        <p>Groß und schnell – ideal unterwegs am Handy.</p>
      </div>

      <form className="panel quick-form" onSubmit={onSubmit}>
        <label className="field">
          <span>Kunde *</span>
          <CustomerPicker
            value={customerId}
            onChange={setCustomerId}
            allowEmpty={false}
            required
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
        <button className="btn btn-primary btn-xl" type="submit" disabled={busy || !customerId}>
          {busy ? "Speichert…" : "Notiz speichern"}
        </button>
      </form>
    </div>
  );
}
