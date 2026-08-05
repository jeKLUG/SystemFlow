import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api";
import { documentTypeLabel, formatDate } from "../../lib/labels";
import type { DocumentItem, DocumentType, ProjectItem, TemplateMeta } from "../../types";

const wikiTypes: DocumentType[] = ["article", "documentation", "note", "workflow", "protocol"];

/**
 * Kunden-Wiki: Artikel, Doku, Notizen, Workflows und Protokolle.
 */
export function CustomerWikiPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [filter, setFilter] = useState<"all" | DocumentType>("all");
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: "",
    type: "article" as DocumentType,
    templateId: "",
    projectId: "",
  });

  async function reload() {
    const [d, p, t] = await Promise.all([
      api.documents(id),
      api.projects(id),
      api.templates(),
    ]);
    setDocs(d);
    setProjects(p);
    setTemplates(t);
  }

  useEffect(() => {
    void reload();
  }, [id]);

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
    navigate(`/documents/${doc.id}`);
  }

  const counts = useMemo(() => {
    const map = Object.fromEntries(wikiTypes.map((t) => [t, 0])) as Record<DocumentType, number>;
    for (const d of docs) map[d.type] = (map[d.type] ?? 0) + 1;
    return map;
  }, [docs]);

  return (
    <section className="section">
      <div className="section-head row-between">
        <div>
          <h2>Kunden-Wiki</h2>
          <p>Artikel, Dokumentation, Notizen, Workflows und Protokolle an einem Ort.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Abbrechen" : "+ Seite"}
        </button>
      </div>

      {showForm ? (
        <form className="panel form-grid" onSubmit={createPage}>
          <label className="field">
            <span>Titel</span>
            <input
              placeholder={form.templateId ? "Optional – sonst Vorlagentitel" : "Titel"}
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
            <span>Projekt (optional)</span>
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
          <label className="field">
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
          <div className="full">
            <button className="btn btn-primary" type="submit">
              Seite erstellen
            </button>
          </div>
        </form>
      ) : null}

      <div className="wiki-toolbar">
        <input
          className="wiki-search"
          placeholder="Wiki durchsuchen…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
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
        <p className="empty">Noch keine Wiki-Seiten. Lege Artikel, Doku oder Workflows an.</p>
      ) : grouped.length === 0 ? (
        <p className="empty">Keine Treffer für diesen Filter.</p>
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
                <h3>{documentTypeLabel[g.type]}</h3>
                <ul className="list">
                  {g.items.map((doc) => (
                    <li key={doc.id}>
                      <Link className="list-row" to={`/documents/${doc.id}`}>
                        <div>
                          <strong>{doc.title}</strong>
                          <span className="muted">
                            {documentTypeLabel[doc.type]}
                            {doc.projectId
                              ? ` · ${projects.find((p) => p.id === doc.projectId)?.name ?? "Projekt"}`
                              : ""}
                          </span>
                        </div>
                        <time className="muted">{formatDate(doc.updatedAt)}</time>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
