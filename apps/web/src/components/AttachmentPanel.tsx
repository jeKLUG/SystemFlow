import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
import { api } from "../api";
import { Modal } from "./Modal";
import { fileKind, formatBytes, sortByName, type FileKind, type VaultSort } from "../lib/files";
import { formatDate } from "../lib/labels";
import type { AttachmentItem, FileFolderItem } from "../types";

interface Props {
  customerId: string;
  documentId?: string;
  assetId?: string;
  /** Ohne eigenen Hero – für Einbettung im Dokumente-Hub. */
  embedded?: boolean;
}

type Layout = "grid" | "list";

const VAULT_DRAG_TYPE = "application/x-systemhaus-attachment";

/**
 * Dokumentenablage: Ordner, Drag&Drop-Upload, Suche und Dateikarten.
 * Bei Wiki-/Anlagen-Bezug kompakter ohne Ordnerhierarchie.
 */
export function AttachmentPanel({ customerId, documentId, assetId, embedded = false }: Props) {
  const scoped = Boolean(documentId || assetId);
  const [folders, setFolders] = useState<FileFolderItem[]>([]);
  const [files, setFiles] = useState<AttachmentItem[]>([]);
  const [allFiles, setAllFiles] = useState<AttachmentItem[]>([]);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<VaultSort>("name");
  const [layout, setLayout] = useState<Layout>("grid");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [dragFileId, setDragFileId] = useState<string | null>(null);
  const [dropFolderId, setDropFolderId] = useState<string | null>(null);
  const [folderOpen, setFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [renameTarget, setRenameTarget] = useState<AttachmentItem | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renameDesc, setRenameDesc] = useState("");
  const [moveTarget, setMoveTarget] = useState<AttachmentItem | null>(null);
  const [moveFolderId, setMoveFolderId] = useState("");
  const [preview, setPreview] = useState<AttachmentItem | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function reload() {
    if (scoped) {
      const list = await api.attachments(customerId, { documentId, assetId });
      setFiles(list);
      setAllFiles(list);
      setFolders([]);
      return;
    }
    const [folderList, fileList, vaultFiles] = await Promise.all([
      api.folders(customerId),
      api.attachments(customerId, {
        folderId: folderId ?? "root",
      }),
      api.attachments(customerId),
    ]);
    // Nur Ablage-Dateien (ohne Wiki/Anlage)
    const vaultOnly = vaultFiles.filter((f) => !f.documentId && !f.assetId);
    setFolders(folderList);
    setFiles(fileList.filter((f) => !f.documentId && !f.assetId));
    setAllFiles(vaultOnly);
  }

  useEffect(() => {
    void reload().catch((err) =>
      setError(err instanceof Error ? err.message : "Laden fehlgeschlagen"),
    );
  }, [customerId, documentId, assetId, folderId]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const t = e.target as HTMLElement | null;
      if (!t?.closest(".vault-more")) setMenuId(null);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  const childFolders = useMemo(() => {
    return folders
      .filter((f) => (folderId ? f.parentId === folderId : !f.parentId))
      .sort(sortByName);
  }, [folders, folderId]);

  const breadcrumbs = useMemo(() => {
    const trail: FileFolderItem[] = [];
    let cur = folderId ? folders.find((f) => f.id === folderId) : undefined;
    while (cur) {
      trail.unshift(cur);
      cur = cur.parentId ? folders.find((f) => f.id === cur!.parentId) : undefined;
    }
    return trail;
  }, [folders, folderId]);

  const folderCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of folders) {
      if (!f.parentId) continue;
      map.set(f.parentId, (map.get(f.parentId) ?? 0) + 1);
    }
    for (const file of allFiles) {
      if (!file.folderId) continue;
      map.set(file.folderId, (map.get(file.folderId) ?? 0) + 1);
    }
    return map;
  }, [folders, allFiles]);

  const filteredFiles = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = files;
    if (q) {
      list = list.filter(
        (f) =>
          f.originalName.toLowerCase().includes(q) ||
          (f.description ?? "").toLowerCase().includes(q),
      );
    }
    list = [...list];
    if (sort === "name") list.sort(sortByName);
    else if (sort === "size") list.sort((a, b) => b.size - a.size);
    else list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    return list;
  }, [files, query, sort]);

  const filteredFolders = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return childFolders;
    return childFolders.filter((f) => f.name.toLowerCase().includes(q));
  }, [childFolders, query]);

  const stats = useMemo(() => {
    const totalSize = allFiles.reduce((s, f) => s + (f.size || 0), 0);
    return {
      files: allFiles.length,
      folders: folders.length,
      size: totalSize,
    };
  }, [allFiles, folders]);

  async function onUpload(fileList: FileList | File[] | null) {
    if (!fileList || (Array.isArray(fileList) ? fileList.length === 0 : !fileList.length)) return;
    setBusy(true);
    setError("");
    try {
      const arr = Array.from(fileList as FileList);
      for (const file of arr) {
        await api.uploadAttachment(customerId, file, {
          documentId,
          assetId,
          folderId: scoped ? null : folderId,
        });
      }
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload fehlgeschlagen");
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function isInternalMove(dt: DataTransfer) {
    return [...dt.types].includes(VAULT_DRAG_TYPE);
  }

  function onDropZoneDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    setDropFolderId(null);
    setDragFileId(null);
    const movedId = e.dataTransfer.getData(VAULT_DRAG_TYPE);
    // Interne Verschiebe-Drags nie als Upload interpretieren (sonst Duplikate bei Bildern)
    if (movedId) return;
    if (e.dataTransfer.files?.length) void onUpload(e.dataTransfer.files);
  }

  async function moveFileToFolder(fileId: string, targetFolderId: string | null) {
    setBusy(true);
    setError("");
    setMenuId(null);
    try {
      await api.updateAttachment(fileId, { folderId: targetFolderId });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verschieben fehlgeschlagen");
    } finally {
      setBusy(false);
      setDragFileId(null);
      setDropFolderId(null);
    }
  }

  function onFileDragStart(e: DragEvent, file: AttachmentItem) {
    if (scoped) return;
    e.dataTransfer.setData(VAULT_DRAG_TYPE, file.id);
    e.dataTransfer.setData("text/plain", file.id);
    e.dataTransfer.effectAllowed = "move";
    setDragFileId(file.id);
    setMenuId(null);
  }

  function onFileDragEnd() {
    setDragFileId(null);
    setDropFolderId(null);
  }

  function onFolderDragOver(e: DragEvent, id: string) {
    if (!isInternalMove(e.dataTransfer) && !e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = isInternalMove(e.dataTransfer) ? "move" : "copy";
    setDropFolderId(id);
  }

  function onFolderDrop(e: DragEvent, targetId: string) {
    e.preventDefault();
    e.stopPropagation();
    const movedId = e.dataTransfer.getData(VAULT_DRAG_TYPE);
    setDropFolderId(null);
    setDragOver(false);
    if (movedId) {
      void moveFileToFolder(movedId, targetId);
      return;
    }
    // Externe Dateien: direkt in diesen Ordner hochladen
    if (e.dataTransfer.files?.length) {
      void (async () => {
        setBusy(true);
        setError("");
        try {
          for (const file of Array.from(e.dataTransfer.files)) {
            await api.uploadAttachment(customerId, file, { folderId: targetId });
          }
          await reload();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Upload fehlgeschlagen");
        } finally {
          setBusy(false);
        }
      })();
    }
  }

  async function createFolder(e: FormEvent) {
    e.preventDefault();
    if (!folderName.trim()) return;
    setError("");
    try {
      await api.createFolder(customerId, {
        name: folderName.trim(),
        parentId: folderId,
      });
      setFolderName("");
      setFolderOpen(false);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ordner anlegen fehlgeschlagen");
    }
  }

  async function saveRename(e: FormEvent) {
    e.preventDefault();
    if (!renameTarget || !renameName.trim()) return;
    await api.updateAttachment(renameTarget.id, {
      originalName: renameName.trim(),
      description: renameDesc.trim() || null,
    });
    setRenameTarget(null);
    await reload();
  }

  async function saveMove(e: FormEvent) {
    e.preventDefault();
    if (!moveTarget) return;
    await api.updateAttachment(moveTarget.id, {
      folderId: moveFolderId || null,
    });
    setMoveTarget(null);
    await reload();
  }

  function openRename(file: AttachmentItem) {
    setMenuId(null);
    setRenameTarget(file);
    setRenameName(file.originalName);
    setRenameDesc(file.description ?? "");
  }

  function openMove(file: AttachmentItem) {
    setMenuId(null);
    setMoveTarget(file);
    setMoveFolderId(file.folderId ?? "");
  }

  function kindLabel(kind: FileKind) {
    switch (kind) {
      case "image":
        return "Bild";
      case "pdf":
        return "PDF";
      case "office":
        return "Office";
      case "archive":
        return "Archiv";
      case "text":
        return "Text";
      default:
        return "Datei";
    }
  }

  return (
    <div className={`vault${scoped ? " is-scoped" : ""}${embedded ? " is-embedded" : ""}`}>
      {!scoped && !embedded ? (
        <div className="vault-hero">
          <div className="vault-hero-top">
            <div>
              <p className="eyebrow">Ablage</p>
              <h3>Dokumentenablage</h3>
              <p className="muted">Ordner, Uploads und Kundenunterlagen an einem Ort.</p>
            </div>
            <div className="vault-hero-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setFolderOpen(true)}>
                Ordner
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
              >
                {busy ? "Lädt…" : "Hochladen"}
              </button>
            </div>
          </div>
          <div className="stat-strip vault-stats">
            <div className="stat-chip">
              <strong>{stats.files}</strong>
              <span>Dateien</span>
            </div>
            <div className="stat-chip">
              <strong>{stats.folders}</strong>
              <span>Ordner</span>
            </div>
            <div className="stat-chip">
              <strong>{formatBytes(stats.size)}</strong>
              <span>Speicher</span>
            </div>
            <div className="stat-chip">
              <strong>{filteredFiles.length + filteredFolders.length}</strong>
              <span>Hier sichtbar</span>
            </div>
          </div>
        </div>
      ) : null}

      {embedded && !scoped ? (
        <div className="vault-embedded-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setFolderOpen(true)}>
            Ordner anlegen
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            {busy ? "Lädt…" : "Hochladen"}
          </button>
        </div>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        disabled={busy}
        onChange={(e) => void onUpload(e.target.files)}
      />

      {!scoped ? (
        <div className="vault-toolbar">
          <nav className="vault-crumbs" aria-label="Ordnerpfad">
            <button
              type="button"
              className={`vault-crumb-btn${!folderId ? " is-current" : ""}${dropFolderId === "__root__" ? " is-drop-target" : ""}`}
              onClick={() => setFolderId(null)}
              onDragEnter={(e) => {
                if (!isInternalMove(e.dataTransfer)) return;
                e.preventDefault();
                setDropFolderId("__root__");
              }}
              onDragOver={(e) => {
                if (!isInternalMove(e.dataTransfer)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDropFolderId("__root__");
              }}
              onDragLeave={() => setDropFolderId((cur) => (cur === "__root__" ? null : cur))}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const movedId = e.dataTransfer.getData(VAULT_DRAG_TYPE);
                setDropFolderId(null);
                if (movedId) void moveFileToFolder(movedId, null);
              }}
            >
              Root
            </button>
            {breadcrumbs.map((crumb) => (
              <span key={crumb.id} className="vault-crumb">
                <span aria-hidden>/</span>
                <button
                  type="button"
                  className={`vault-crumb-btn${folderId === crumb.id ? " is-current" : ""}${dropFolderId === crumb.id ? " is-drop-target" : ""}`}
                  onClick={() => setFolderId(crumb.id)}
                  onDragEnter={(e) => onFolderDragOver(e, crumb.id)}
                  onDragOver={(e) => onFolderDragOver(e, crumb.id)}
                  onDragLeave={() =>
                    setDropFolderId((cur) => (cur === crumb.id ? null : cur))
                  }
                  onDrop={(e) => onFolderDrop(e, crumb.id)}
                >
                  {crumb.name}
                </button>
              </span>
            ))}
          </nav>
          <div className="vault-tools">
            <label className="field vault-search">
              <span className="sr-only">Suche</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Dateien & Ordner suchen…"
              />
            </label>
            <label className="field vault-sort">
              <span className="sr-only">Sortierung</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as VaultSort)}>
                <option value="name">Name</option>
                <option value="date">Datum</option>
                <option value="size">Größe</option>
              </select>
            </label>
            <div className="vault-layout" role="group" aria-label="Darstellung">
              <button
                type="button"
                className={layout === "grid" ? "is-active" : undefined}
                aria-pressed={layout === "grid"}
                title="Kacheln"
                onClick={() => setLayout("grid")}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <rect x="3" y="3" width="7" height="7" rx="1.5" />
                  <rect x="14" y="3" width="7" height="7" rx="1.5" />
                  <rect x="3" y="14" width="7" height="7" rx="1.5" />
                  <rect x="14" y="14" width="7" height="7" rx="1.5" />
                </svg>
              </button>
              <button
                type="button"
                className={layout === "list" ? "is-active" : undefined}
                aria-pressed={layout === "list"}
                title="Liste"
                onClick={() => setLayout("list")}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div
        className={`vault-dropzone${dragOver ? " is-over" : ""}${busy ? " is-busy" : ""}${dragFileId ? " is-moving" : ""}`}
        onDragEnter={(e) => {
          e.preventDefault();
          if (isInternalMove(e.dataTransfer)) return;
          setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (isInternalMove(e.dataTransfer)) {
            e.dataTransfer.dropEffect = "move";
            return;
          }
          setDragOver(true);
          e.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          setDragOver(false);
        }}
        onDrop={onDropZoneDrop}
      >
        {error ? <p className="form-error">{error}</p> : null}

        {filteredFolders.length === 0 && filteredFiles.length === 0 ? (
          <div className="vault-empty">
            <div className="vault-empty-icon" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                <path
                  d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div>
              <strong>{scoped ? "Keine Anhänge" : "Ordner ist leer"}</strong>
              <p className="muted">
                Dateien hierher ziehen oder über „Datei wählen“ hinzufügen
                {!scoped ? " – optional zuerst einen Ordner anlegen" : ""}.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            >
              Datei wählen
            </button>
          </div>
        ) : (
          <div className={`vault-board is-${layout}`}>
            {filteredFolders.map((folder) => {
              const count = folderCounts.get(folder.id) ?? 0;
              return (
                <article
                  key={folder.id}
                  className={`vault-card is-folder${dropFolderId === folder.id ? " is-drop-target" : ""}${menuId === folder.id ? " is-menu-open" : ""}`}
                  onDragEnter={(e) => onFolderDragOver(e, folder.id)}
                  onDragOver={(e) => onFolderDragOver(e, folder.id)}
                  onDragLeave={(e) => {
                    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                    setDropFolderId((cur) => (cur === folder.id ? null : cur));
                  }}
                  onDrop={(e) => onFolderDrop(e, folder.id)}
                >
                  <button
                    type="button"
                    className="vault-card-main"
                    onClick={() => setFolderId(folder.id)}
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
                  <div className={`vault-card-toolbar${menuId === folder.id ? " is-open" : ""}`}>
                    <div className={`vault-more${menuId === folder.id ? " is-open" : ""}`}>
                      <button
                        type="button"
                        className="vault-card-menu-btn"
                        aria-label="Ordneraktionen"
                        onClick={() => setMenuId(menuId === folder.id ? null : folder.id)}
                      >
                        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                          <circle cx="12" cy="5" r="1.6" />
                          <circle cx="12" cy="12" r="1.6" />
                          <circle cx="12" cy="19" r="1.6" />
                        </svg>
                      </button>
                      {menuId === folder.id ? (
                        <div className="vault-menu" role="menu">
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              const name = prompt("Ordner umbenennen", folder.name);
                              if (!name?.trim()) return;
                              void api
                                .updateFolder(folder.id, { name: name.trim() })
                                .then(() => reload())
                                .finally(() => setMenuId(null));
                            }}
                          >
                            <MenuIconRename />
                            Umbenennen
                          </button>
                          <div className="vault-menu-sep" role="separator" />
                          <button
                            type="button"
                            role="menuitem"
                            className="is-danger"
                            onClick={() => {
                              if (
                                confirm(
                                  `Ordner „${folder.name}“ löschen? Dateien wandern in den übergeordneten Ordner.`,
                                )
                              ) {
                                void api
                                  .deleteFolder(folder.id)
                                  .then(() => reload())
                                  .catch((err) =>
                                    setError(
                                      err instanceof Error ? err.message : "Löschen fehlgeschlagen",
                                    ),
                                  )
                                  .finally(() => setMenuId(null));
                              }
                            }}
                          >
                            <MenuIconTrash />
                            Löschen
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}

            {filteredFiles.map((file) => {
              const kind = fileKind(file.mimeType, file.originalName);
              const isImage = kind === "image";
              return (
                <article
                  key={file.id}
                  className={`vault-card is-file kind-${kind}${dragFileId === file.id ? " is-dragging" : ""}${menuId === file.id ? " is-menu-open" : ""}`}
                  draggable={!scoped}
                  onDragStart={(e) => onFileDragStart(e, file)}
                  onDragEnd={onFileDragEnd}
                >
                  <button
                    type="button"
                    className="vault-card-main"
                    onClick={() => {
                      if (isImage) setPreview(file);
                      else window.open(`/api/attachments/${file.id}/download?inline=1`, "_blank");
                    }}
                  >
                    <span className={`vault-card-preview kind-${kind}`} aria-hidden>
                      {isImage ? (
                        <img
                          src={`/api/attachments/${file.id}/download?inline=1`}
                          alt=""
                          loading="lazy"
                          draggable={false}
                        />
                      ) : (
                        <span className={`vault-card-glyph kind-${kind}`}>
                          <FileGlyph kind={kind} />
                        </span>
                      )}
                      <span className="vault-card-kind">{kindLabel(kind)}</span>
                    </span>
                    <span className="vault-card-meta">
                      <strong title={file.originalName}>{file.originalName}</strong>
                      <span className="muted">
                        {formatBytes(file.size)} · {formatDate(file.createdAt)}
                      </span>
                      {file.description ? (
                        <span className="vault-card-desc">{file.description}</span>
                      ) : null}
                    </span>
                  </button>
                  <div className={`vault-card-toolbar${menuId === file.id ? " is-open" : ""}`}>
                    <a
                      className="vault-card-menu-btn"
                      href={`/api/attachments/${file.id}/download`}
                      download
                      aria-label="Herunterladen"
                      title="Herunterladen"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <path d="M12 4v10M8 10l4 4 4-4M5 18h14" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </a>
                    <div className={`vault-more${menuId === file.id ? " is-open" : ""}`}>
                      <button
                        type="button"
                        className="vault-card-menu-btn"
                        aria-label="Dateiaktionen"
                        onClick={() => setMenuId(menuId === file.id ? null : file.id)}
                      >
                        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                          <circle cx="12" cy="5" r="1.6" />
                          <circle cx="12" cy="12" r="1.6" />
                          <circle cx="12" cy="19" r="1.6" />
                        </svg>
                      </button>
                      {menuId === file.id ? (
                        <div className="vault-menu" role="menu">
                          <button type="button" role="menuitem" onClick={() => openRename(file)}>
                            <MenuIconEdit />
                            Bearbeiten
                          </button>
                          {!scoped ? (
                            <button type="button" role="menuitem" onClick={() => openMove(file)}>
                              <MenuIconMove />
                              Verschieben…
                            </button>
                          ) : null}
                          <div className="vault-menu-sep" role="separator" />
                          <button
                            type="button"
                            role="menuitem"
                            className="is-danger"
                            onClick={() => {
                              setMenuId(null);
                              if (confirm(`„${file.originalName}“ löschen?`)) {
                                void api.deleteAttachment(file.id).then(() => reload());
                              }
                            }}
                          >
                            <MenuIconTrash />
                            Löschen
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <p className="vault-drop-hint muted">
          {scoped
            ? "Dateien zum Hochladen hierher ziehen"
            : "Dateien hochladen · Dateien auf Ordner ziehen zum Verschieben"}
        </p>
      </div>

      <Modal open={folderOpen} title="Ordner anlegen" onClose={() => setFolderOpen(false)}>
        <form className="form-grid" onSubmit={createFolder}>
          <label className="field full">
            <span>Name *</span>
            <input
              required
              autoFocus
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder="z. B. Verträge, Lizenzen, Fotos"
            />
          </label>
          <p className="muted full">
            Wird angelegt in: {breadcrumbs.map((b) => b.name).join(" / ") || "Root"}
          </p>
          <div className="full form-actions modal-actions">
            <button className="btn btn-primary" type="submit">
              Anlegen
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setFolderOpen(false)}>
              Abbrechen
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(renameTarget)}
        title="Datei bearbeiten"
        onClose={() => setRenameTarget(null)}
      >
        <form className="form-grid" onSubmit={saveRename}>
          <label className="field full">
            <span>Dateiname *</span>
            <input
              required
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
            />
          </label>
          <label className="field full">
            <span>Beschreibung</span>
            <textarea
              rows={3}
              value={renameDesc}
              onChange={(e) => setRenameDesc(e.target.value)}
              placeholder="Optional: Kurznotiz zur Datei"
            />
          </label>
          <div className="full form-actions modal-actions">
            <button className="btn btn-primary" type="submit">
              Speichern
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setRenameTarget(null)}>
              Abbrechen
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(moveTarget)}
        title="Datei verschieben"
        onClose={() => setMoveTarget(null)}
      >
        <form className="form-grid" onSubmit={saveMove}>
          <label className="field full">
            <span>Zielordner</span>
            <select value={moveFolderId} onChange={(e) => setMoveFolderId(e.target.value)}>
              <option value="">Root</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {folderPathLabel(folders, f.id)}
                </option>
              ))}
            </select>
          </label>
          <div className="full form-actions modal-actions">
            <button className="btn btn-primary" type="submit">
              Verschieben
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setMoveTarget(null)}>
              Abbrechen
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(preview)}
        title={preview?.originalName ?? "Vorschau"}
        onClose={() => setPreview(null)}
        className="modal-preview"
      >
        {preview ? (
          <div className="vault-preview">
            <img
              src={`/api/attachments/${preview.id}/download?inline=1`}
              alt={preview.originalName}
            />
            <div className="form-actions modal-actions">
              <a className="btn btn-primary" href={`/api/attachments/${preview.id}/download`} download>
                Download
              </a>
              <button type="button" className="btn btn-ghost" onClick={() => setPreview(null)}>
                Schließen
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function folderPathLabel(folders: FileFolderItem[], id: string): string {
  const parts: string[] = [];
  let cur = folders.find((f) => f.id === id);
  while (cur) {
    parts.unshift(cur.name);
    cur = cur.parentId ? folders.find((f) => f.id === cur!.parentId) : undefined;
  }
  return parts.join(" / ");
}

function menuIconProps() {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    "aria-hidden": true as const,
  };
}

function MenuIconEdit() {
  return (
    <svg {...menuIconProps()}>
      <path d="M4 20h4l10.5-10.5a2.1 2.1 0 00-3-3L5 17v3z" strokeLinejoin="round" />
      <path d="M12.5 5.5l3 3" strokeLinecap="round" />
    </svg>
  );
}

function MenuIconRename() {
  return (
    <svg {...menuIconProps()}>
      <path d="M4 20h4l10.5-10.5a2.1 2.1 0 00-3-3L5 17v3z" strokeLinejoin="round" />
      <path d="M12.5 5.5l3 3" strokeLinecap="round" />
    </svg>
  );
}

function MenuIconMove() {
  return (
    <svg {...menuIconProps()}>
      <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" strokeLinejoin="round" />
      <path d="M12 11v5M9.5 14L12 16.5 14.5 14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MenuIconTrash() {
  return (
    <svg {...menuIconProps()}>
      <path d="M4 7h16M9 7V5h6v2M8 7l1 12h6l1-12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FolderGlyph() {
  return (
    <svg viewBox="0 0 48 40" fill="none" aria-hidden>
      <path
        d="M2 10.5C2 8 4 6 6.5 6h9.2l2.8 3.2H41.5C44 9.2 46 11.2 46 13.7V32c0 2.5-2 4.5-4.5 4.5h-35C4 36.5 2 34.5 2 32V10.5Z"
        fill="#d97706"
        opacity="0.55"
      />
      <path
        d="M2 15h44v17c0 2.5-2 4.5-4.5 4.5h-35C4 36.5 2 34.5 2 32V15Z"
        fill="#f59e0b"
      />
      <path
        d="M2 15h44v2.2H2V15Z"
        fill="#fbbf24"
        opacity="0.7"
      />
    </svg>
  );
}

function FileGlyph({ kind }: { kind: FileKind }) {
  const props = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    "aria-hidden": true as const,
  };
  if (kind === "pdf") {
    return (
      <svg {...props}>
        <path d="M7 3h7l5 5v13H7z" strokeLinejoin="round" />
        <path d="M14 3v5h5M9 14h6M9 17h4" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "office") {
    return (
      <svg {...props}>
        <path d="M7 3h7l5 5v13H7z" strokeLinejoin="round" />
        <path d="M14 3v5h5M9 13h6M9 16h6M9 19h3" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "archive") {
    return (
      <svg {...props}>
        <path d="M4 7h16v12H4zM8 7V5h8v2" strokeLinejoin="round" />
        <path d="M12 11v4" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "text") {
    return (
      <svg {...props}>
        <path d="M7 3h7l5 5v13H7z" strokeLinejoin="round" />
        <path d="M14 3v5h5M9 13h6M9 16h6M9 19h4" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg {...props}>
      <path d="M7 3h7l5 5v13H7z" strokeLinejoin="round" />
      <path d="M14 3v5h5" strokeLinecap="round" />
    </svg>
  );
}
