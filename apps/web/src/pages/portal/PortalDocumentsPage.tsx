import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../api";
import { fileKind, fileKindLabel, formatBytes } from "../../lib/files";
import { documentTypeLabel, formatDate } from "../../lib/labels";
import type { AttachmentItem, DocumentItem, DocumentType } from "../../types";

const wikiTypes: DocumentType[] = ["documentation", "article", "protocol", "workflow", "note"];

type DocsTab = "all" | DocumentType | "files";

function parseTab(value: string | null): DocsTab {
  if (value === "files" || wikiTypes.includes(value as DocumentType)) return value as DocsTab;
  return "all";
}

/**
 * Freigegebene Wiki-Seiten und Dateien im Kundenportal.
 */
export function PortalDocumentsPage() {
  const [params, setParams] = useSearchParams();
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [files, setFiles] = useState<AttachmentItem[]>([]);
  const [error, setError] = useState("");
  const [query, setQuery] = useState(params.get("q") ?? "");
  const tab = parseTab(params.get("tab"));

  useEffect(() => {
    void Promise.all([api.portalDocuments(), api.portalFiles()])
      .then(([pages, shared]) => {
        setDocs(pages);
        setFiles(shared);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Laden fehlgeschlagen"));
  }, []);

  function setTab(next: DocsTab) {
    const q = new URLSearchParams(params);
    if (next === "all") q.delete("tab");
    else q.set("tab", next);
    setParams(q, { replace: true });
  }

  const counts = useMemo(() => {
    const map = Object.fromEntries(wikiTypes.map((t) => [t, 0])) as Record<DocumentType, number>;
    for (const d of docs) map[d.type] = (map[d.type] ?? 0) + 1;
    return map;
  }, [docs]);

  const q = query.trim().toLowerCase();
  const visibleDocs = useMemo(() => {
    return docs.filter((d) => {
      if (tab !== "all" && tab !== "files" && d.type !== tab) return false;
      if (tab === "files") return false;
      if (!q) return true;
      return d.title.toLowerCase().includes(q);
    });
  }, [docs, tab, q]);

  const visibleFiles = useMemo(() => {
    if (tab !== "all" && tab !== "files") return [];
    return files.filter((f) => {
      if (!q) return true;
      return (
        f.originalName.toLowerCase().includes(q) || (f.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [files, tab, q]);

  const empty = visibleDocs.length === 0 && visibleFiles.length === 0;
  const typeTabs = wikiTypes.filter((t) => counts[t] > 0);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h2>Dokumente</h2>
          <p className="muted">Freigegebene Seiten und Dateien zum Lesen und Herunterladen.</p>
        </div>
      </header>
      {error ? <p className="form-error">{error}</p> : null}

      <div className="docs-wiki-toolbar panel">
        <input
          className="wiki-search"
          type="search"
          placeholder="Seiten und Dateien durchsuchen…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Dokumente durchsuchen"
        />
        <div className="emails-dir-seg" role="tablist" aria-label="Kategorie">
          <button type="button" className={tab === "all" ? "is-active" : ""} onClick={() => setTab("all")}>
            Alle <em>{docs.length + files.length}</em>
          </button>
          {typeTabs.map((t) => (
            <button
              key={t}
              type="button"
              className={tab === t ? "is-active" : ""}
              onClick={() => setTab(t)}
            >
              {documentTypeLabel[t]} <em>{counts[t]}</em>
            </button>
          ))}
          <button type="button" className={tab === "files" ? "is-active" : ""} onClick={() => setTab("files")}>
            Dateien <em>{files.length}</em>
          </button>
        </div>
      </div>

      {docs.length === 0 && files.length === 0 ? (
        <div className="docs-empty panel">
          <div className="docs-empty-icon" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M7 3h7l5 5v13H7z" strokeLinejoin="round" />
              <path d="M14 3v5h5M9 13h6M9 16h4" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <strong>Noch nichts freigegeben</strong>
            <p className="muted">Ihr Systemhaus legt hier Seiten und Dateien ab, sobald sie für Sie sichtbar sind.</p>
          </div>
        </div>
      ) : empty ? (
        <p className="empty panel">Keine Treffer in dieser Ansicht.</p>
      ) : (
        <div className="portal-docs-board">
          {visibleDocs.length ? (
            <section className="portal-docs-section">
              {tab === "all" && visibleFiles.length ? <h3>Seiten</h3> : null}
              <ul className="portal-docs-list">
                {visibleDocs.map((doc) => (
                  <li key={doc.id}>
                    <Link className="panel portal-doc-card" to={`/portal/documents/${doc.id}`}>
                      <span className={`docs-type-badge type-${doc.type}`}>{documentTypeLabel[doc.type]}</span>
                      <div className="portal-doc-main">
                        <strong>{doc.title}</strong>
                        <span className="muted">Aktualisiert {formatDate(doc.updatedAt)}</span>
                      </div>
                      <span className="portal-doc-cta">Öffnen</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {visibleFiles.length ? (
            <section className="portal-docs-section">
              {tab === "all" && visibleDocs.length ? <h3>Dateien</h3> : null}
              <ul className="portal-docs-list">
                {visibleFiles.map((file) => {
                  const kind = fileKind(file.mimeType, file.originalName);
                  const href = `/api/portal/attachments/${file.id}/download`;
                  const canView = kind === "image" || kind === "pdf" || kind === "text";
                  return (
                    <li key={file.id}>
                      <div className="panel portal-doc-card is-file">
                        <span className={`docs-type-badge type-file kind-${kind}`}>{fileKindLabel[kind]}</span>
                        <div className="portal-doc-main">
                          <strong>{file.originalName}</strong>
                          <span className="muted">
                            {formatBytes(file.size)}
                            {file.description ? ` · ${file.description}` : ""}
                            {" · "}
                            {formatDate(file.updatedAt ?? file.createdAt)}
                          </span>
                        </div>
                        <div className="portal-doc-actions">
                          {canView ? (
                            <a className="btn btn-ghost" href={`${href}?inline=1`} target="_blank" rel="noreferrer">
                              Ansehen
                            </a>
                          ) : null}
                          <a className="btn btn-primary" href={href} download>
                            Download
                          </a>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
