import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { AttachmentPanel } from "../components/AttachmentPanel";
import { CustomerFields } from "../components/CustomerFields";
import { customerAddressLine, customerDisplayName } from "../lib/customer";
import { assetKindLabel, documentTypeLabel, formatDate, formatDateOnly } from "../lib/labels";
import {
  emptyCustomerForm,
  type Activity,
  type Asset,
  type AssetKind,
  type ContractItem,
  type Customer,
  type DocumentItem,
  type DocumentType,
  type TaskItem,
  type TemplateMeta,
} from "../types";

const emptyAsset = {
  name: "",
  kind: "pc" as AssetKind,
  manufacturer: "",
  model: "",
  serialNumber: "",
  warrantyUntil: "",
  notes: "",
};

export function CustomerDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [assetList, setAssetList] = useState<Asset[]>([]);
  const [activityList, setActivityList] = useState<Activity[]>([]);
  const [taskList, setTaskList] = useState<TaskItem[]>([]);
  const [contractList, setContractList] = useState<ContractItem[]>([]);
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(emptyCustomerForm);
  const [newDoc, setNewDoc] = useState({
    title: "",
    type: "note" as DocumentType,
    templateId: "",
  });
  const [assetForm, setAssetForm] = useState(emptyAsset);
  const [showAssetForm, setShowAssetForm] = useState(false);
  const [activityForm, setActivityForm] = useState({ title: "", description: "" });
  const [taskForm, setTaskForm] = useState({ title: "", description: "", dueDate: "" });
  const [contractForm, setContractForm] = useState({
    title: "",
    startDate: "",
    endDate: "",
    slaResponseHours: "",
    contactPerson: "",
    notes: "",
  });
  const [error, setError] = useState("");

  async function reload() {
    const [c, d, a, h, t, tasks, contracts] = await Promise.all([
      api.customer(id),
      api.documents(id),
      api.assets(id),
      api.activities(id),
      api.templates(),
      api.tasks(id),
      api.contracts(id),
    ]);
    setCustomer(c);
    setDocs(d);
    setAssetList(a);
    setActivityList(h);
    setTemplates(t);
    setTaskList(tasks);
    setContractList(contracts);
    setForm({
      name: c.name,
      company: c.company ?? "",
      contactPerson: c.contactPerson ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      mobile: c.mobile ?? "",
      address: c.address ?? "",
      zip: c.zip ?? "",
      city: c.city ?? "",
      country: c.country ?? "Deutschland",
      vatId: c.vatId ?? "",
      website: c.website ?? "",
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
    const body: Record<string, unknown> = {
      customerId: id,
    };
    if (newDoc.templateId) {
      body.templateId = newDoc.templateId;
      if (newDoc.title.trim()) body.title = newDoc.title.trim();
    } else {
      body.title = newDoc.title || "Unbenannt";
      body.type = newDoc.type;
    }
    const doc = await api.createDocument(body);
    navigate(`/documents/${doc.id}`);
  }

  async function createAsset(e: FormEvent) {
    e.preventDefault();
    await api.createAsset(id, assetForm);
    setAssetForm(emptyAsset);
    setShowAssetForm(false);
    await reload();
  }

  async function createActivity(e: FormEvent) {
    e.preventDefault();
    await api.createActivity(id, activityForm);
    setActivityForm({ title: "", description: "" });
    await reload();
  }

  async function createTask(e: FormEvent) {
    e.preventDefault();
    await api.createTask(id, taskForm);
    setTaskForm({ title: "", description: "", dueDate: "" });
    await reload();
  }

  async function createContract(e: FormEvent) {
    e.preventDefault();
    await api.createContract(id, {
      title: contractForm.title,
      startDate: contractForm.startDate,
      endDate: contractForm.endDate,
      slaResponseHours: contractForm.slaResponseHours
        ? Number(contractForm.slaResponseHours)
        : null,
      contactPerson: contractForm.contactPerson,
      notes: contractForm.notes,
    });
    setContractForm({
      title: "",
      startDate: "",
      endDate: "",
      slaResponseHours: "",
      contactPerson: "",
      notes: "",
    });
    await reload();
  }

  async function removeCustomer() {
    if (!confirm("Kunde und alle zugehörigen Daten wirklich löschen?")) return;
    await api.deleteCustomer(id);
    navigate("/customers");
  }

  if (!customer) return <div className="boot">Lade Kunde…</div>;

  return (
    <div className="page">
      <div className="breadcrumb">
        <Link to="/customers">Kunden</Link>
        <span>/</span>
        <span>{customerDisplayName(customer)}</span>
      </div>

      <div className="section-head row-between">
        <div>
          <h2>{customerDisplayName(customer)}</h2>
          <p>
            <span className={`badge badge-${customer.status}`}>
              {customer.status === "active" ? "Aktiv" : "Inaktiv"}
            </span>
            {customer.contactPerson ? (
              <span className="muted"> · {customer.contactPerson}</span>
            ) : null}
          </p>
        </div>
        <div className="cta-row">
          <Link className="btn btn-primary" to={`/quick-note?customerId=${id}`}>
            + Notiz
          </Link>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void api.exportCustomer(id)}
          >
            Export ZIP
          </button>
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
          <CustomerFields form={form} onChange={setForm} showStatus />
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
            <span className="label">Firma</span>
            <p>{customer.company || "–"}</p>
          </div>
          <div>
            <span className="label">Kurzname</span>
            <p>{customer.name || "–"}</p>
          </div>
          <div>
            <span className="label">Ansprechpartner</span>
            <p>{customer.contactPerson || "–"}</p>
          </div>
          <div>
            <span className="label">USt-IdNr.</span>
            <p>{customer.vatId || "–"}</p>
          </div>
          <div>
            <span className="label">E-Mail</span>
            <p>{customer.email || "–"}</p>
          </div>
          <div>
            <span className="label">Website</span>
            <p>
              {customer.website ? (
                <a href={customer.website} target="_blank" rel="noreferrer">
                  {customer.website}
                </a>
              ) : (
                "–"
              )}
            </p>
          </div>
          <div>
            <span className="label">Telefon</span>
            <p>{customer.phone || "–"}</p>
          </div>
          <div>
            <span className="label">Mobil</span>
            <p>{customer.mobile || "–"}</p>
          </div>
          <div className="full">
            <span className="label">Adresse</span>
            <p>{customerAddressLine(customer)}</p>
          </div>
          <div className="full">
            <span className="label">Kurznotiz</span>
            <p>{customer.notes || "–"}</p>
          </div>
        </div>
      )}

      <section className="section">
        <div className="section-head row-between">
          <div>
            <h2>Anlagen</h2>
            <p>PCs, Server, Firewalls, Lizenzen und weitere Geräte.</p>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setShowAssetForm((v) => !v)}
          >
            {showAssetForm ? "Abbrechen" : "Anlage hinzufügen"}
          </button>
        </div>

        {showAssetForm ? (
          <form className="panel form-grid" onSubmit={createAsset}>
            <label className="field">
              <span>Name *</span>
              <input
                required
                value={assetForm.name}
                onChange={(e) => setAssetForm({ ...assetForm, name: e.target.value })}
                placeholder="z. B. Firewall Standort A"
              />
            </label>
            <label className="field">
              <span>Typ</span>
              <select
                value={assetForm.kind}
                onChange={(e) =>
                  setAssetForm({ ...assetForm, kind: e.target.value as AssetKind })
                }
              >
                {Object.entries(assetKindLabel).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Hersteller</span>
              <input
                value={assetForm.manufacturer}
                onChange={(e) => setAssetForm({ ...assetForm, manufacturer: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Modell</span>
              <input
                value={assetForm.model}
                onChange={(e) => setAssetForm({ ...assetForm, model: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Seriennummer</span>
              <input
                value={assetForm.serialNumber}
                onChange={(e) => setAssetForm({ ...assetForm, serialNumber: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Garantie bis</span>
              <input
                type="date"
                value={assetForm.warrantyUntil}
                onChange={(e) => setAssetForm({ ...assetForm, warrantyUntil: e.target.value })}
              />
            </label>
            <label className="field full">
              <span>Notizen</span>
              <textarea
                rows={2}
                value={assetForm.notes}
                onChange={(e) => setAssetForm({ ...assetForm, notes: e.target.value })}
              />
            </label>
            <div className="full">
              <button className="btn btn-primary" type="submit">
                Speichern
              </button>
            </div>
          </form>
        ) : null}

        {assetList.length === 0 ? (
          <p className="empty">Noch keine Anlagen.</p>
        ) : (
          <ul className="list">
            {assetList.map((asset) => (
              <li key={asset.id} className="list-row asset-row">
                <div>
                  <strong>{asset.name}</strong>
                  <span className="muted">
                    {assetKindLabel[asset.kind]}
                    {asset.manufacturer || asset.model
                      ? ` · ${[asset.manufacturer, asset.model].filter(Boolean).join(" ")}`
                      : ""}
                    {asset.serialNumber ? ` · S/N ${asset.serialNumber}` : ""}
                  </span>
                  <span className="muted">Garantie: {formatDateOnly(asset.warrantyUntil)}</span>
                </div>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() =>
                    void api.deleteAsset(asset.id).then(() => reload())
                  }
                >
                  Löschen
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Einsatz-Historie</h2>
          <p>Was wurde wann gemacht – manuell oder automatisch bei Dokumenten/Anlagen.</p>
        </div>

        <form className="panel inline-form" onSubmit={createActivity}>
          <input
            placeholder="Titel des Einsatzes"
            value={activityForm.title}
            onChange={(e) => setActivityForm({ ...activityForm, title: e.target.value })}
            required
          />
          <input
            placeholder="Kurzbeschreibung (optional)"
            value={activityForm.description}
            onChange={(e) => setActivityForm({ ...activityForm, description: e.target.value })}
          />
          <button className="btn btn-primary" type="submit">
            Eintrag
          </button>
        </form>

        {activityList.length === 0 ? (
          <p className="empty">Noch keine Historie.</p>
        ) : (
          <ol className="timeline">
            {activityList.map((item) => (
              <li key={item.id} className="timeline-item">
                <div className="timeline-dot" aria-hidden="true" />
                <div className="timeline-body">
                  <div className="row-between">
                    <strong>{item.title}</strong>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() =>
                        void api.deleteActivity(item.id).then(() => reload())
                      }
                    >
                      Entfernen
                    </button>
                  </div>
                  {item.description ? <p className="muted">{item.description}</p> : null}
                  <time className="muted">{formatDate(item.occurredAt)}</time>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Aufgaben</h2>
          <p>Offene Punkte mit optionaler Fälligkeit.</p>
        </div>
        <form className="panel inline-form" onSubmit={createTask}>
          <input
            placeholder="Aufgabe"
            value={taskForm.title}
            onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
            required
          />
          <input
            type="date"
            value={taskForm.dueDate}
            onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })}
          />
          <button className="btn btn-primary" type="submit">
            Hinzufügen
          </button>
        </form>
        {taskList.length === 0 ? (
          <p className="empty">Keine Aufgaben.</p>
        ) : (
          <ul className="list">
            {taskList.map((task) => (
              <li key={task.id} className="list-row">
                <label className="task-check">
                  <input
                    type="checkbox"
                    checked={task.done}
                    onChange={() =>
                      void api
                        .updateTask(task.id, {
                          title: task.title,
                          description: task.description ?? "",
                          dueDate: task.dueDate ?? "",
                          done: !task.done,
                        })
                        .then(() => reload())
                    }
                  />
                  <div>
                    <strong className={task.done ? "done" : undefined}>{task.title}</strong>
                    <span className="muted">
                      Fällig: {formatDateOnly(task.dueDate)}
                    </span>
                  </div>
                </label>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => void api.deleteTask(task.id).then(() => reload())}
                >
                  Löschen
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Verträge / SLA</h2>
          <p>Laufzeiten und Reaktionszeiten – keine Rechnungen (Lexware).</p>
        </div>
        <form className="panel form-grid" onSubmit={createContract}>
          <label className="field">
            <span>Titel *</span>
            <input
              required
              value={contractForm.title}
              onChange={(e) => setContractForm({ ...contractForm, title: e.target.value })}
            />
          </label>
          <label className="field">
            <span>SLA (Stunden)</span>
            <input
              type="number"
              min={1}
              value={contractForm.slaResponseHours}
              onChange={(e) =>
                setContractForm({ ...contractForm, slaResponseHours: e.target.value })
              }
            />
          </label>
          <label className="field">
            <span>Beginn</span>
            <input
              type="date"
              value={contractForm.startDate}
              onChange={(e) => setContractForm({ ...contractForm, startDate: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Ende</span>
            <input
              type="date"
              value={contractForm.endDate}
              onChange={(e) => setContractForm({ ...contractForm, endDate: e.target.value })}
            />
          </label>
          <label className="field full">
            <span>Ansprechpartner Vertrag</span>
            <input
              value={contractForm.contactPerson}
              onChange={(e) =>
                setContractForm({ ...contractForm, contactPerson: e.target.value })
              }
            />
          </label>
          <div className="full">
            <button className="btn btn-primary" type="submit">
              Vertrag speichern
            </button>
          </div>
        </form>
        {contractList.length === 0 ? (
          <p className="empty">Keine Verträge.</p>
        ) : (
          <ul className="list">
            {contractList.map((c) => (
              <li key={c.id} className="list-row">
                <div>
                  <strong>{c.title}</strong>
                  <span className="muted">
                    {formatDateOnly(c.startDate)} – {formatDateOnly(c.endDate)}
                    {c.slaResponseHours ? ` · SLA ${c.slaResponseHours}h` : ""}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => void api.deleteContract(c.id).then(() => reload())}
                >
                  Löschen
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Anhänge</h2>
          <p>PDFs, Fotos und Lizenzscheine zu diesem Kunden.</p>
        </div>
        <div className="panel">
          <AttachmentPanel customerId={id} />
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Dokumente</h2>
          <p>Notizen, Protokolle und Vorlagen für diesen Kunden.</p>
        </div>

        <form className="panel form-grid" onSubmit={createDoc}>
          <label className="field">
            <span>Titel</span>
            <input
              placeholder={newDoc.templateId ? "Optional – sonst Vorlagentitel" : "Titel"}
              value={newDoc.title}
              onChange={(e) => setNewDoc({ ...newDoc, title: e.target.value })}
              required={!newDoc.templateId}
            />
          </label>
          <label className="field">
            <span>Typ</span>
            <select
              value={newDoc.type}
              disabled={Boolean(newDoc.templateId)}
              onChange={(e) => setNewDoc({ ...newDoc, type: e.target.value as DocumentType })}
            >
              <option value="note">Notiz</option>
              <option value="protocol">Protokoll</option>
              <option value="documentation">Dokumentation</option>
            </select>
          </label>
          <label className="field full">
            <span>Vorlage</span>
            <select
              value={newDoc.templateId}
              onChange={(e) => setNewDoc({ ...newDoc, templateId: e.target.value })}
            >
              <option value="">Ohne Vorlage (leer starten)</option>
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name} – {tpl.description}
                </option>
              ))}
            </select>
          </label>
          <div className="full">
            <button className="btn btn-primary" type="submit">
              Dokument erstellen
            </button>
          </div>
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
