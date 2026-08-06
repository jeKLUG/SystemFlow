import { useEffect, useRef, useState } from "react";
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
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const timer = useRef<number | null>(null);
  const skipFirst = useRef(true);

  useEffect(() => {
    void api
      .document(id)
      .then((d) => {
        setDoc(d);
        setTitle(d.title);
        setType(d.type);
        setContent(d.content);
        skipFirst.current = true;
      })
      .catch(() => navigate("/customers"));
  }, [id, navigate]);

  useEffect(() => {
    if (!doc) return;
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void (async () => {
        setSaveState("saving");
        try {
          const updated = await api.updateDocument(id, { title, type, content });
          setDoc(updated);
          setSaveState("saved");
        } catch {
          setSaveState("error");
        }
      })();
    }, 700);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [title, type, content, doc, id]);

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
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Titel"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value as DocumentType)}
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
          {saveState === "saved" && `Gespeichert · ${formatDate(doc.updatedAt)}`}
          {saveState === "error" && "Speichern fehlgeschlagen"}
          {saveState === "idle" && documentTypeLabel[type]}
        </span>
        <button type="button" className="btn btn-danger btn-sm" onClick={() => void remove()}>
          Löschen
        </button>
      </div>

      <DocumentEditor
        content={content}
        onChange={setContent}
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
