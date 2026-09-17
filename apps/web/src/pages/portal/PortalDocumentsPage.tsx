import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../api";
import { fileKind, fileKindLabel, formatBytes } from "../../lib/files";
import { documentTypeLabel, formatDate } from "../../lib/labels";
import type { AttachmentItem, DocumentItem, DocumentType, FileFolderItem } from "../../types";

const wikiTypes: DocumentType[] = ["documentation", "article", "protocol", "workflow", "note"];

type DocsTab = "all" | DocumentType | "files";

function parseTab(value: string | null): DocsTab {
  if (value === "files" || wikiTypes.includes(value as DocumentType)) return value as DocsTab;
  return "all";
}

/** Pfad vom Share-Root bis zum aktuellen Ordner. */
function folderTrail(folders: FileFolderItem[], folderId: string): FileFolderItem[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const ids = new Set(byId.keys());
  const trail: FileFolderItem[] = [];
  let id: string | null = folderId;
  while (id && ids.has(id)) {
    const folder = byId.get(id);
    if (!folder) break;
    trail.unshift(folder);
    if (!folder.parentId || !ids.has(folder.parentId)) break;
    id = folder.parentId;
  }
  return trail;
}

function folderChildCount(folderId: string, folders: FileFolderItem[], files: AttachmentItem[]) {
  const nested = folders.filter((folder) => folder.parentId === folderId).length;
  const nestedFiles = files.filter((file) => file.folderId === folderId).length;
  return nested + nestedFiles;
}

/**
 * Freigegebene Wiki-Seiten, Ordner und Dateien im Kundenportal.
 */
export function PortalDocumentsPage() {
  const [params, setParams] = useSearchParams();
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [files, setFiles] = useState<AttachmentItem[]>([]);
  const [folders, setFolders] = useState<FileFolderItem[]>([]);
  const [error, setError] = useState("");
  const [query, setQuery] = useState(params.get("q") ?? "");
  const tab = parseTab(params.get("tab"));
  const folderParam = params.get("folder");

  useEffect(() => {
    void Promise.all([api.portalDocuments(), api.portalFiles(), api.portalFolders()])
      .then(([pages, shared, sharedFolders]) => {
        setDocs(pages);
        setFiles(shared);
        setFolders(sharedFolders);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Laden fehlgeschlagen"));
  }, []);

  function setTab(next: DocsTab) {
    const q = new URLSearchParams(params);
    if (next === "all") q.delete("tab");
    else q.set("tab", next);
    setParams(q, { replace: true });
  }

  function setFolder(id: string | null) {
    const q = new URLSearchParams(params);
    if (id) {
      q.set("folder", id);
      if (tab !== "all" && tab !== "files") q.set("tab", "files");
    } else q.delete("folder");
    setParams(q, { replace: true });
  }

  const folderIds = useMemo(() => new Set(folders.map((folder) => folder.id)), [folders]);
  const currentFolder = folders.find((folder) => folder.id === folderParam) ?? null;
  const browsing = Boolean(currentFolder);
  const trail = currentFolder ? folderTrail(folders, currentFolder.id) : [];
  const shareRoots = useMemo(
    () => folders.filter((folder) => !folder.parentId || !folderIds.has(folder.parentId)),
    [folders, folderIds],
  );

  const counts = useMemo(() => {
    const map = Object.fromEntries(wikiTypes.map((t) => [t, 0])) as Record<DocumentType, number>;
    for (const d of docs) map[d.type] = (map[d.type] ?? 0) + 1;
    return map;
  }, [docs]);

  const q = query.trim().toLowerCase();
  const searching = Boolean(q);

  const visibleDocs = useMemo(() => {
    if (browsing && !searching) return [];
    return docs.filter((d) => {
      if (tab !== "all" && tab !== "files" && d.type !== tab) return false;
      if (tab === "files") return false;
      if (!q) return true;
      return d.title.toLowerCase().includes(q);
    });
  }, [docs, tab, q, browsing, searching]);

  const visibleFolders = useMemo(() => {
    if (tab !== "all" && tab !== "files") return [];
    const pool = searching
      ? folders
      : browsing
        ? folders.filter((folder) => folder.parentId === currentFolder!.id)
        : shareRoots;
    if (!q) return pool;
    return pool.filter((folder) => folder.name.toLowerCase().includes(q));
  }, [folders, shareRoots, tab, q, searching, browsing, currentFolder]);

  const visibleFiles = useMemo(() => {
    if (tab !== "all" && tab !== "files") return [];
    const pool = searching
      ? files
      : browsing
        ? files.filter((file) => file.folderId === currentFolder!.id)
        : files.filter((file) => !file.folderId || !folderIds.has(file.folderId));
    if (!q) return pool;
    return pool.filter(
      (f) =>
        f.originalName.toLowerCase().includes(q) || (f.description ?? "").toLowerCase().includes(q),
    );
  }, [files, tab, q, searching, browsing, currentFolder, folderIds]);

  const empty = visibleDocs.length === 0 && visibleFiles.length === 0 && visibleFolders.length === 0;
  const typeTabs = wikiTypes.filter((t) => counts[t] > 0);
  const fileTabCount = files.length + shareRoots.length;
  const nothingShared = docs.length === 0 && files.length === 0 && folders.length === 0;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h2>Dokumente</h2>
          <p className="muted">Freigegebene Seiten, Ordner und Dateien zum Lesen und Herunterladen.</p>
        </div>
      </header>
      {error ? <p className="form-error">{error}</p> : null}

      <div className="docs-wiki-toolbar portal-docs-toolbar panel">
        <input
          className="wiki-search"
          type="search"
          placeholder="Seiten, Ordner und Dateien durchsuchen…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Dokumente durchsuchen"
        />
        <div className="emails-dir-seg" role="tablist" aria-label="Kategorie">
          <button type="button" className={tab === "all" ? "is-active" : ""} onClick={() => setTab("all")}>
            Alle <em>{docs.length + fileTabCount}</em>
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
            Dateien <em>{fileTabCount}</em>
          </button>
        </div>
      </div>

      {currentFolder ? (
        <nav className="portal-docs-crumbs" aria-label="Ordnerpfad">
          <button type="button" onClick={() => setFolder(null)}>
            Dokumente
          </button>
          {trail.map((folder, index) => (
            <span key={folder.id} className="portal-docs-crumb">
              <span className="portal-docs-sep" aria-hidden>
                /
              </span>
              {index === trail.length - 1 ? (
                <span>{folder.name}</span>
              ) : (
                <button type="button" onClick={() => setFolder(folder.id)}>
                  {folder.name}
                </button>
              )}
            </span>
          ))}
        </nav>
      ) : null}

      {nothingShared ? (
        <div className="docs-empty panel">
          <div className="docs-empty-icon" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M7 3h7l5 5v13H7z" strokeLinejoin="round" />
              <path d="M14 3v5h5M9 13h6M9 16h4" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <strong>Noch nichts freigegeben</strong>
            <p className="muted">Ihr Systemhaus legt hier Seiten, Ordner und Dateien ab, sobald sie für Sie sichtbar sind.</p>
          </div>
        </div>
      ) : empty ? (
        <p className="empty panel">
          {browsing && !searching ? "Dieser Ordner ist leer." : "Keine Treffer in dieser Ansicht."}
        </p>
      ) : (
        <div className="portal-docs-board">
          {visibleDocs.length ? (
            <section className="portal-docs-section">
              {tab === "all" && (visibleFiles.length || visibleFolders.length) ? <h3>Seiten</h3> : null}
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
          {visibleFolders.length ? (
            <section className="portal-docs-section">
              {tab === "all" && (visibleDocs.length || visibleFiles.length) ? <h3>Ordner</h3> : null}
              <ul className="portal-docs-list">
                {visibleFolders.map((folder) => {
                  const count = folderChildCount(folder.id, folders, files);
                  return (
                    <li key={folder.id}>
                      <button
                        type="button"
                        className="panel portal-doc-card is-folder"
                        onClick={() => setFolder(folder.id)}
                      >
                        <span className="docs-type-badge type-folder">Ordner</span>
                        <div className="portal-doc-main">
                          <strong>{folder.name}</strong>
                          <span className="muted">
                            {count} Einträg{count === 1 ? "" : "e"}
                          </span>
                        </div>
                        <span className="portal-doc-cta">Öffnen</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
          {visibleFiles.length ? (
            <section className="portal-docs-section">
              {tab === "all" && (visibleDocs.length || visibleFolders.length) ? <h3>Dateien</h3> : null}
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
