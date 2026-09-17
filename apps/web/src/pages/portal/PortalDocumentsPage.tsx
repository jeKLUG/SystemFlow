import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { documentTypeLabel, formatDate } from "../../lib/labels";
import type { DocumentItem } from "../../types";

/**
 * Opt-in Wiki-Seiten im Portal.
 */
export function PortalDocumentsPage() {
  const [rows, setRows] = useState<DocumentItem[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void api
      .portalDocuments()
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : "Laden fehlgeschlagen"));
  }, []);

  return (
    <div className="page">
      <header className="page-head">
        <h2>Dokumente</h2>
      </header>
      {error ? <p className="form-error">{error}</p> : null}
      {rows.length === 0 ? (
        <p className="empty panel">Keine freigegebenen Dokumente.</p>
      ) : (
        <ul className="docs-page-list">
          {rows.map((doc) => (
            <li key={doc.id}>
              <Link className="docs-page-row" to={`/portal/documents/${doc.id}`}>
                <span className={`docs-type-badge type-${doc.type}`}>{documentTypeLabel[doc.type]}</span>
                <span className="docs-page-main">
                  <strong>{doc.title}</strong>
                </span>
                <time className="muted">{formatDate(doc.updatedAt)}</time>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
