import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../../api";
import { AttachmentPanel } from "../../components/AttachmentPanel";
import { Modal } from "../../components/Modal";
import { formatBytes } from "../../lib/files";
import { documentTypeLabel, formatDate } from "../../lib/labels";
import type { AttachmentItem, DocumentItem, DocumentType, ProjectItem, TemplateMeta } from "../../types";

const wikiTypes: DocumentType[] = ["article", "documentation", "note", "workflow", "protocol"];

type DocsView = "wiki" | "files";

/**
 * Einheitlicher Dokumente-Bereich: Wiki-Seiten und Dateiablage.
 */
export function CustomerWikiPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const view: DocsView = searchParams.get("view") === "files" ? "files" : "wiki";

  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [files, setFiles] = useState<AttachmentItem[]>([]);
  const [folderCount, setFolderCount] = useState(0);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [filter, setFilter] = useState<"all" | DocumentType>("all");
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [form, setForm] = useState({
    title: "",
    type: "article" as DocumentType,
    templateId: "",
    projectId: "",
  });

  async function reload() {
    const [d, p, t, attachments, folders] = await Promise.all([
      api.documents(id),
      api.projects(id),
      api.templates(),
      api.attachments(id),
      api.folders(id),
    ]);
    setDocs(d);
    setProjects(p);
    setTemplates(t);
    setFiles(attachments.filter((f) => !f.documentId && !f.assetId));
    setFolderCount(folders.length);
  }

  useEffect(() => {
    void reload();
  }, [id]);

  function setView(next: DocsView) {
    const params = new URLSearchParams(searchParams);
    if (next === "files") params.set("view", "files");
    else params.delete("view");
    setSearchParams(params, { replace: true });
  }

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = docs.filter((d) => {
      if (filter !== "all" && d.type !== filter) return false;
      if (!q) return true;
      return d.title.toLowerCase().includes(q);
    });
    return wikiTypes
      .map((type) => ({
        type,
        items: filtered.filter((d) => d.type === type),
      }))
      .filter((g) => g.items.length > 0);
  }, [docs, filter, query]);

  const counts = useMemo(() => {
    const map = Object.fromEntries(wikiTypes.map((t) => [t, 0])) as Record<DocumentType, number>;
    for (const d of docs) map[d.type] = (map[d.type] ?? 0) + 1;
    return map;
  }, [docs]);

  const storageBytes = useMemo(() => files.reduce((s, f) => s + (f.size || 0), 0), [files]);

  async function createPage(e: FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = { customerId: id };
    if (form.templateId) {
      body.templateId = form.templateId;
      if (form.title.trim()) body.title = form.title.trim();
    } else {
      body.title = form.title || "Unbenannt";
      body.type = form.type;
    }
    if (form.projectId) body.projectId = form.projectId;
    const doc = await api.createDocument(body);
    setCreateOpen(false);
    navigate(`/documents/${doc.id}`);
  }

  return (
    <section className="section docs-hub">
      <div className="docs-hero panel">
        <div className="docs-hero-top">
          <div>
            <p className="eyebrow">Wissen</p>
            <h2>Dokumente</h2>
            <p className="muted">
              Wiki-Seiten schreiben und Dateien ablegen – alles an einem Ort, auffindbar über die
              globale Suche.
            </p>
          </div>
          <div className="docs-hero-actions">
            {view === "wiki" ? (
              <>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={docs.length === 0 || pdfBusy}
                  onClick={() => {
                    setPdfBusy(true);
                    void api
                      .exportWikiPdf(id)
                      .catch((err) =>
                        alert(err instanceof Error ? err.message : "PDF-Export fehlgeschlagen"),
                      )
                      .finally(() => setPdfBusy(false));
                  }}
                >
                  {pdfBusy ? "PDF…" : "Alle als PDF"}
                </button>
                <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
                  + Wiki-Seite
                </button>
              </>
            ) : (
              <Link className="btn btn-ghost" to="/search">
                Globale Suche
              </Link>
            )}
          </div>
        </div>

        <div className="stat-strip docs-stats">
          <button
            type="button"
            className={`stat-chip${view === "wiki" ? " is-active" : ""}`}
            onClick={() => setView("wiki")}
          >
            <strong>{docs.length}</strong>
            <span>Wiki-Seiten</span>
          </button>
          <button
            type="button"
            className={`stat-chip${view === "files" ? " is-active" : ""}`}
            onClick={() => setView("files")}
          >
            <strong>{files.length}</strong>
            <span>Dateien</span>
          </button>
          <button type="button" className="stat-chip" onClick={() => setView("files")}>
            <strong>{folderCount}</strong>
            <span>Ordner</span>
          </button>
          <div className="stat-chip">
            <strong>{formatBytes(storageBytes)}</strong>
            <span>Speicher</span>
          </div>
        </div>

        <div className="docs-views" role="tablist" aria-label="Dokumentenbereich">
          <button
            type="button"
            role="tab"
            aria-selected={view === "wiki"}
            className={`cal-seg${view === "wiki" ? " is-active" : ""}`}
            onClick={() => setView("wiki")}
          >
            Wiki
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "files"}
            className={`cal-seg${view === "files" ? " is-active" : ""}`}
            onClick={() => setView("files")}
          >
            Dateiablage
          </button>
        </div>
      </div>

      {view === "wiki" ? (
        <>
          <div className="wiki-toolbar docs-wiki-toolbar panel">
            <input
              className="wiki-search"
              placeholder="Wiki-Seiten durchsuchen…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Wiki durchsuchen"
            />
            <div className="filter-chips">
              <button
                type="button"
                className={filter === "all" ? "chip chip-active" : "chip"}
                onClick={() => setFilter("all")}
              >
                Alle ({docs.length})
              </button>
              {wikiTypes.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={filter === t ? "chip chip-active" : "chip"}
                  onClick={() => setFilter(t)}
                >
                  {documentTypeLabel[t]} ({counts[t]})
                </button>
              ))}
            </div>
          </div>

          {docs.length === 0 ? (
            <div className="docs-empty panel">
              <div className="docs-empty-icon" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <path d="M7 3h7l5 5v13H7z" strokeLinejoin="round" />
                  <path d="M14 3v5h5M9 13h6M9 16h4" strokeLinecap="round" />
                </svg>
              </div>
              <div>
                <strong>Noch keine Wiki-Seiten</strong>
                <p className="muted">
                  Artikel, Dokumentation, Notizen, Workflows oder Protokolle anlegen.
                </p>
              </div>
              <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
                Erste Seite
              </button>
            </div>
          ) : grouped.length === 0 ? (
            <p className="empty panel">Keine Treffer für diesen Filter.</p>
          ) : (
            <div className="wiki-layout">
              <aside className="wiki-nav panel">
                <h3>Inhalte</h3>
                {grouped.map((g) => (
                  <div key={g.type} className="wiki-nav-group">
                    <span className="label">{documentTypeLabel[g.type]}</span>
                    <ul>
                      {g.items.map((doc) => (
                        <li key={doc.id}>
                          <Link to={`/documents/${doc.id}`}>{doc.title}</Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </aside>
              <div className="wiki-list">
                {grouped.map((g) => (
                  <div key={g.type} className="wiki-group">
                    <h3 className="docs-group-title">
                      {documentTypeLabel[g.type]}
                      <span>{g.items.length}</span>
                    </h3>
                    <ul className="docs-page-list">
                      {g.items.map((doc) => (
                        <li key={doc.id}>
                          <Link className="docs-page-card" to={`/documents/${doc.id}`}>
                            <span className={`docs-type-badge type-${doc.type}`}>
                              {documentTypeLabel[doc.type]}
                            </span>
                            <strong>{doc.title}</strong>
                            <span className="muted">
                              {doc.projectId
                                ? projects.find((p) => p.id === doc.projectId)?.name ?? "Projekt"
                                : "Kein Projekt"}
                              {" · "}
                              {formatDate(doc.updatedAt)}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="panel vault-panel docs-vault">
          <AttachmentPanel customerId={id} embedded />
        </div>
      )}

      <Modal open={createOpen} title="Wiki-Seite anlegen" onClose={() => setCreateOpen(false)}>
        <form className="form-grid" onSubmit={createPage}>
          <label className="field full">
            <span>Titel</span>
            <input
              autoFocus
              placeholder={form.templateId ? "Optional – sonst Vorlagentitel" : "Titel der Seite"}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required={!form.templateId}
            />
          </label>
          <label className="field">
            <span>Typ</span>
            <select
              value={form.type}
              disabled={Boolean(form.templateId)}
              onChange={(e) => setForm({ ...form, type: e.target.value as DocumentType })}
            >
              {wikiTypes.map((t) => (
                <option key={t} value={t}>
                  {documentTypeLabel[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Projekt</span>
            <select
              value={form.projectId}
              onChange={(e) => setForm({ ...form, projectId: e.target.value })}
            >
              <option value="">Kein Projekt</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field full">
            <span>Vorlage</span>
            <select
              value={form.templateId}
              onChange={(e) => setForm({ ...form, templateId: e.target.value })}
            >
              <option value="">Ohne Vorlage</option>
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name}
                </option>
              ))}
            </select>
          </label>
          <div className="full form-actions modal-actions">
            <button className="btn btn-primary" type="submit">
              Anlegen
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setCreateOpen(false)}>
              Abbrechen
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
