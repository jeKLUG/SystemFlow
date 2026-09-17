import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../api";
import { FileGlyph, FolderGlyph } from "../../components/FileGlyphs";
import { HelpHint } from "../../components/HelpHint";
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
    const nextParams = new URLSearchParams(params);
    if (next === "all") nextParams.delete("tab");
    else nextParams.set("tab", next);
    setParams(nextParams, { replace: true });
  }

  function setFolder(id: string | null) {
    const nextParams = new URLSearchParams(params);
    if (id) {
      nextParams.set("folder", id);
      if (tab !== "all" && tab !== "files") nextParams.set("tab", "files");
    } else nextParams.delete("folder");
    setParams(nextParams, { replace: true });
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
  const showVault = visibleFolders.length > 0 || visibleFiles.length > 0;

  return (
    <div className="page">
      <header className="page-head">
        <div className="page-head-title">
          <h2>Dokumente</h2>
          <HelpHint text="Freigegebene Seiten, Ordner und Dateien zum Lesen und Herunterladen." />
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
              {tab === "all" && showVault ? <h3>Seiten</h3> : null}
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

          {showVault ? (
            <section className="portal-docs-section">
              {tab === "all" && visibleDocs.length ? <h3>Ordner und Dateien</h3> : null}
              <div className="vault-board is-grid">
                {visibleFolders.map((folder) => {
                  const count = folderChildCount(folder.id, folders, files);
                  return (
                    <article key={folder.id} className="vault-card is-folder">
                      <button
                        type="button"
                        className="vault-card-main"
                        onClick={() => setFolder(folder.id)}
                      >
                        <span className="vault-card-preview is-folder" aria-hidden>
                          <span className="vault-card-glyph">
                            <FolderGlyph />
                          </span>
                        </span>
                        <span className="vault-card-meta">
                          <strong title={folder.name}>{folder.name}</strong>
                          <span className="muted">
                            {count} Einträg{count === 1 ? "" : "e"}
                          </span>
                        </span>
                      </button>
                    </article>
                  );
                })}
                {visibleFiles.map((file) => {
                  const kind = fileKind(file.mimeType, file.originalName);
                  const href = `/api/portal/attachments/${file.id}/download`;
                  const canView = kind === "image" || kind === "pdf" || kind === "text";
                  const openHref = canView ? `${href}?inline=1` : href;
                  return (
                    <article key={file.id} className={`vault-card is-file kind-${kind} is-portal`}>
                      <a
                        className="vault-card-main"
                        href={openHref}
                        target={canView ? "_blank" : undefined}
                        rel={canView ? "noreferrer" : undefined}
                        download={canView ? undefined : true}
                      >
                        <span className={`vault-card-preview kind-${kind}`} aria-hidden>
                          {kind === "image" ? (
                            <img src={`${href}?inline=1`} alt="" loading="lazy" />
                          ) : (
                            <span className={`vault-card-glyph kind-${kind}`}>
                              <FileGlyph kind={kind} />
                            </span>
                          )}
                          <span className="vault-card-kind">{fileKindLabel[kind]}</span>
                        </span>
                        <span className="vault-card-meta">
                          <strong title={file.originalName}>{file.originalName}</strong>
                          <span className="muted">
                            {formatBytes(file.size)} · {formatDate(file.updatedAt ?? file.createdAt)}
                          </span>
                          {file.description ? <span className="vault-card-desc">{file.description}</span> : null}
                        </span>
                      </a>
                      <div className="vault-card-toolbar">
                        {canView ? (
                          <a
                            className="vault-card-menu-btn"
                            href={`${href}?inline=1`}
                            target="_blank"
                            rel="noreferrer"
                            aria-label="Ansehen"
                            title="Ansehen"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                              <path
                                d="M2.42 12.71C2.28 12.5 2.22 12.39 2.18 12.22C2.15 12.1 2.15 11.9 2.18 11.78C2.22 11.61 2.28 11.5 2.42 11.29C3.55 9.5 6.9 5 12 5C17.11 5 20.46 9.5 21.58 11.29C21.72 11.5 21.79 11.61 21.82 11.78C21.85 11.9 21.85 12.1 21.82 12.22C21.79 12.39 21.72 12.5 21.58 12.71C20.46 14.5 17.11 19 12 19C6.9 19 3.55 14.5 2.42 12.71Z"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                              <path
                                d="M12 15C13.66 15 15 13.66 15 12C15 10.34 13.66 9 12 9C10.34 9 9 10.34 9 12C9 13.66 10.34 15 12 15Z"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </a>
                        ) : null}
                        <a
                          className="vault-card-menu-btn"
                          href={href}
                          download
                          aria-label="Herunterladen"
                          title="Herunterladen"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                            <path d="M12 4v10M8 10l4 4 4-4M5 18h14" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </a>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
