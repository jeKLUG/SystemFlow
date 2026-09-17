import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api";
import { DocumentEditor } from "../../components/DocumentEditor";
import { documentTypeLabel } from "../../lib/labels";
import type { DocumentItem } from "../../types";

/**
 * Read-only Wiki-Seite im Portal.
 */
export function PortalDocumentPage() {
  const { docId = "" } = useParams();
  const [doc, setDoc] = useState<DocumentItem | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void api
      .portalDocument(docId)
      .then(setDoc)
      .catch((err) => setError(err instanceof Error ? err.message : "Nicht gefunden"));
  }, [docId]);

  if (!doc && !error) return <p className="empty">Lade Dokument…</p>;
  if (!doc) {
    return (
      <div className="page">
        <p className="form-error">{error}</p>
        <Link to="/portal/documents">Zurück</Link>
      </div>
    );
  }

  return (
    <div className="page editor-page is-reading">
      <div className="breadcrumb">
        <Link to="/portal/documents">Dokumente</Link>
        <span>/</span>
        <span>{doc.title}</span>
      </div>
      <div className="editor-meta">
        <h1 className="editor-title-read">{doc.title}</h1>
        <span className="editor-type-badge">{documentTypeLabel[doc.type]}</span>
      </div>
      <DocumentEditor content={doc.content} onChange={() => undefined} editable={false} />
    </div>
  );
}
