import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { AttachmentPanel } from "../components/AttachmentPanel";
import { CustomerPicker } from "../components/CustomerPicker";
import { DocumentEditor } from "../components/DocumentEditor";
import { documentTypeLabel, formatDate } from "../lib/labels";
import type { DocumentItem, DocumentType } from "../types";

/**
 * Wiki-/Notiz-Editor inkl. optionaler Kundenzuordnung für Schnellnotizen.
 */
export function DocumentPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<DocumentItem | null>(null);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<DocumentType>("note");
  const [content, setContent] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [savedSnapshot, setSavedSnapshot] = useState({
    title: "",
    type: "note" as DocumentType,
    content: "",
    customerId: "",
  });
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    void api
      .document(id)
      .then((d) => {
        setDoc(d);
        setTitle(d.title);
        setType(d.type);
        setContent(d.content);
        setCustomerId(d.customerId ?? "");
        setSavedSnapshot({
          title: d.title,
          type: d.type,
          content: d.content,
          customerId: d.customerId ?? "",
        });
        setSaveState("idle");
        setError("");
      })
      .catch(() => navigate("/quick-note"));
  }, [id, navigate]);

  const dirty = useMemo(() => {
    return (
      title !== savedSnapshot.title ||
      type !== savedSnapshot.type ||
      content !== savedSnapshot.content ||
      customerId !== savedSnapshot.customerId
    );
  }, [title, type, content, customerId, savedSnapshot]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  async function save() {
    if (!doc || !dirty) return;
    setSaveState("saving");
    setError("");
    try {
      const updated = await api.updateDocument(id, {
        title,
        type,
        content,
        customerId: customerId || null,
      });
      setDoc(updated);
      setCustomerId(updated.customerId ?? "");
      setSavedSnapshot({
        title,
        type,
        content,
        customerId: updated.customerId ?? "",
      });
      setSaveState("saved");
    } catch (err) {
      setSaveState("error");
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    }
  }

  async function remove() {
    if (!confirm("Dokument wirklich löschen?")) return;
    const cid = doc?.customerId;
    await api.deleteDocument(id);
    navigate(cid ? `/customers/${cid}/wiki` : "/quick-note");
  }

  if (!doc) return <div className="boot">Lade Dokument…</div>;

  return (
    <div className="page editor-page">
      <div className="breadcrumb">
        {doc.customerId || customerId ? (
          <>
            <Link to="/customers">Kunden</Link>
            <span>/</span>
            <Link to={`/customers/${customerId || doc.customerId}`}>Kunde</Link>
            <span>/</span>
            <Link to={`/customers/${customerId || doc.customerId}/wiki`}>Dokumente</Link>
          </>
        ) : (
          <>
            <Link to="/quick-note">Schnellnotiz</Link>
            <span>/</span>
            <span>Ohne Kunde</span>
          </>
        )}
        <span>/</span>
        <span>{title || "Seite"}</span>
      </div>

      <div className="editor-meta">
        <input
          className="title-input"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setSaveState("idle");
          }}
          aria-label="Titel"
        />
        <select
          value={type}
          onChange={(e) => {
            setType(e.target.value as DocumentType);
            setSaveState("idle");
          }}
          aria-label="Dokumenttyp"
        >
          <option value="article">Artikel</option>
          <option value="documentation">Dokumentation</option>
          <option value="note">Notiz</option>
          <option value="workflow">Workflow</option>
          <option value="protocol">Protokoll</option>
        </select>
        <span className="save-state">
          {saveState === "saving" && "Speichert…"}
          {saveState === "saved" && !dirty && `Gespeichert · ${formatDate(doc.updatedAt)}`}
          {saveState === "error" && "Speichern fehlgeschlagen"}
          {dirty && saveState !== "saving" && "Ungespeicherte Änderungen"}
          {!dirty && saveState === "idle" && documentTypeLabel[type]}
        </span>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!dirty || saveState === "saving"}
          onClick={() => void save()}
        >
          {saveState === "saving" ? "Speichert…" : "Speichern"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={pdfBusy || dirty}
          title={dirty ? "Zuerst speichern" : "Als PDF exportieren"}
          onClick={() => {
            setPdfBusy(true);
            void api
              .exportDocumentPdf(id, title)
              .catch((err) =>
                setError(err instanceof Error ? err.message : "PDF-Export fehlgeschlagen"),
              )
              .finally(() => setPdfBusy(false));
          }}
        >
          {pdfBusy ? "PDF…" : "PDF"}
        </button>
        <button type="button" className="btn btn-danger btn-sm" onClick={() => void remove()}>
          Löschen
        </button>
      </div>

      <label className="field editor-customer-field">
        <span>Kunde</span>
        <CustomerPicker
          value={customerId}
          onChange={(next) => {
            setCustomerId(next);
            setSaveState("idle");
          }}
          allowEmpty
          emptyLabel="Ohne Kunde"
          placeholder="Kunde zuordnen…"
        />
      </label>

      {error ? <p className="form-error">{error}</p> : null}

      <DocumentEditor
        content={content}
        onChange={(next) => {
          setContent(next);
          setSaveState("idle");
        }}
        customerId={customerId || undefined}
        documentId={doc.id}
      />

      {customerId ? (
        <section className="section doc-attachments">
          <AttachmentPanel customerId={customerId} documentId={doc.id} />
        </section>
      ) : (
        <p className="muted editor-attach-hint">
          Anhänge und Bild-Upload sind verfügbar, sobald ein Kunde zugeordnet ist.
        </p>
      )}
    </div>
  );
}
