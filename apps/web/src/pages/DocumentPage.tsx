import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { AttachmentPanel } from "../components/AttachmentPanel";
import { DocumentEditor } from "../components/DocumentEditor";
import { documentTypeLabel, formatDate } from "../lib/labels";
import type { DocumentItem, DocumentType } from "../types";

export function DocumentPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<DocumentItem | null>(null);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<DocumentType>("note");
  const [content, setContent] = useState("");
  const [savedSnapshot, setSavedSnapshot] = useState({ title: "", type: "note" as DocumentType, content: "" });
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    void api
      .document(id)
      .then((d) => {
        setDoc(d);
        setTitle(d.title);
        setType(d.type);
        setContent(d.content);
        setSavedSnapshot({ title: d.title, type: d.type, content: d.content });
        setSaveState("idle");
        setError("");
      })
      .catch(() => navigate("/customers"));
  }, [id, navigate]);

  const dirty = useMemo(() => {
    return (
      title !== savedSnapshot.title ||
      type !== savedSnapshot.type ||
      content !== savedSnapshot.content
    );
  }, [title, type, content, savedSnapshot]);

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
      const updated = await api.updateDocument(id, { title, type, content });
      setDoc(updated);
      setSavedSnapshot({ title, type, content });
      setSaveState("saved");
    } catch (err) {
      setSaveState("error");
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    }
  }

  async function remove() {
    if (!confirm("Dokument wirklich löschen?")) return;
    const customerId = doc?.customerId;
    await api.deleteDocument(id);
    navigate(customerId ? `/customers/${customerId}/wiki` : "/customers");
  }

  if (!doc) return <div className="boot">Lade Dokument…</div>;

  return (
    <div className="page editor-page">
      <div className="breadcrumb">
        <Link to="/customers">Kunden</Link>
        <span>/</span>
        <Link to={`/customers/${doc.customerId}`}>Kunde</Link>
        <span>/</span>
        <Link to={`/customers/${doc.customerId}/wiki`}>Dokumente</Link>
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
        <button type="button" className="btn btn-danger btn-sm" onClick={() => void remove()}>
          Löschen
        </button>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <DocumentEditor
        content={content}
        onChange={(next) => {
          setContent(next);
          setSaveState("idle");
        }}
        customerId={doc.customerId}
        documentId={doc.id}
      />

      <section className="section">
        <div className="section-head">
          <h2>Anhänge</h2>
          <p>Dateien zu diesem Dokument.</p>
        </div>
        <div className="panel">
          <AttachmentPanel customerId={doc.customerId} documentId={doc.id} />
        </div>
      </section>
    </div>
  );
}
