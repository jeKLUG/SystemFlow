import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { documentTypeLabel, formatDate } from "../lib/labels";
import type { Customer, DocumentItem, DocumentType } from "../types";

export function CustomerDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    notes: "",
    status: "active" as "active" | "inactive",
  });
  const [newDoc, setNewDoc] = useState({ title: "", type: "note" as DocumentType });
  const [error, setError] = useState("");

  async function reload() {
    const [c, d] = await Promise.all([api.customer(id), api.documents(id)]);
    setCustomer(c);
    setDocs(d);
    setForm({
      name: c.name,
      email: c.email ?? "",
      phone: c.phone ?? "",
      address: c.address ?? "",
      notes: c.notes ?? "",
      status: c.status,
    });
  }

  useEffect(() => {
    void reload().catch(() => navigate("/customers"));
  }, [id]);

  async function saveCustomer(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api.updateCustomer(id, form);
      setEditing(false);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    }
  }

  async function createDoc(e: FormEvent) {
    e.preventDefault();
    const doc = await api.createDocument({
      customerId: id,
      title: newDoc.title || "Unbenannt",
      type: newDoc.type,
    });
    navigate(`/documents/${doc.id}`);
  }

  async function removeCustomer() {
    if (!confirm("Kunde und alle Dokumente wirklich löschen?")) return;
    await api.deleteCustomer(id);
    navigate("/customers");
  }

  if (!customer) return <div className="boot">Lade Kunde…</div>;

  return (
    <div className="page">
      <div className="breadcrumb">
        <Link to="/customers">Kunden</Link>
        <span>/</span>
        <span>{customer.name}</span>
      </div>

      <div className="section-head row-between">
        <div>
          <h2>{customer.name}</h2>
          <p>
            <span className={`badge badge-${customer.status}`}>
              {customer.status === "active" ? "Aktiv" : "Inaktiv"}
            </span>
          </p>
        </div>
        <div className="cta-row">
          <button type="button" className="btn btn-ghost" onClick={() => setEditing((v) => !v)}>
            {editing ? "Schließen" : "Bearbeiten"}
          </button>
          <button type="button" className="btn btn-danger" onClick={() => void removeCustomer()}>
            Löschen
          </button>
        </div>
      </div>

      {editing ? (
        <form className="panel form-grid" onSubmit={saveCustomer}>
          <label className="field">
            <span>Name *</span>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Status</span>
            <select
              value={form.status}
              onChange={(e) =>
                setForm({ ...form, status: e.target.value as "active" | "inactive" })
              }
            >
              <option value="active">Aktiv</option>
              <option value="inactive">Inaktiv</option>
            </select>
          </label>
          <label className="field">
            <span>E-Mail</span>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Telefon</span>
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </label>
          <label className="field full">
            <span>Adresse</span>
            <input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </label>
          <label className="field full">
            <span>Kurznotiz</span>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>
          {error ? <p className="form-error full">{error}</p> : null}
          <div className="full">
            <button className="btn btn-primary" type="submit">
              Speichern
            </button>
          </div>
        </form>
      ) : (
        <div className="detail-grid">
          <div>
            <span className="label">E-Mail</span>
            <p>{customer.email || "–"}</p>
          </div>
          <div>
            <span className="label">Telefon</span>
            <p>{customer.phone || "–"}</p>
          </div>
          <div className="full">
            <span className="label">Adresse</span>
            <p>{customer.address || "–"}</p>
          </div>
          <div className="full">
            <span className="label">Kurznotiz</span>
            <p>{customer.notes || "–"}</p>
          </div>
        </div>
      )}

      <section className="section">
        <div className="section-head">
          <h2>Dokumente</h2>
          <p>Notizen, Protokolle und Dokumentationen für diesen Kunden.</p>
        </div>

        <form className="panel inline-form" onSubmit={createDoc}>
          <input
            placeholder="Titel des neuen Dokuments"
            value={newDoc.title}
            onChange={(e) => setNewDoc({ ...newDoc, title: e.target.value })}
            required
          />
          <select
            value={newDoc.type}
            onChange={(e) => setNewDoc({ ...newDoc, type: e.target.value as DocumentType })}
          >
            <option value="note">Notiz</option>
            <option value="protocol">Protokoll</option>
            <option value="documentation">Dokumentation</option>
          </select>
          <button className="btn btn-primary" type="submit">
            Erstellen
          </button>
        </form>

        {docs.length === 0 ? (
          <p className="empty">Noch keine Dokumente.</p>
        ) : (
          <ul className="list">
            {docs.map((doc) => (
              <li key={doc.id}>
                <Link className="list-row" to={`/documents/${doc.id}`}>
                  <div>
                    <strong>{doc.title}</strong>
                    <span className="muted">{documentTypeLabel[doc.type]}</span>
                  </div>
                  <time className="muted">{formatDate(doc.updatedAt)}</time>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
