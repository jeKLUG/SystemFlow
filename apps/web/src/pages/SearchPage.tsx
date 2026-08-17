import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { contactKindLabel, customerDisplayName } from "../lib/customer";
import { formatBytes } from "../lib/files";
import { assetKindLabel, documentTypeLabel, formatDate } from "../lib/labels";
import type { SearchResult } from "../types";

type SearchFilter =
  | "all"
  | "contact"
  | "customer"
  | "wiki"
  | "file"
  | "asset"
  | "activity";

const FILTERS: Array<{ key: SearchFilter; label: string }> = [
  { key: "all", label: "Alle" },
  { key: "contact", label: "Kontakte" },
  { key: "customer", label: "Kunden" },
  { key: "wiki", label: "Wiki" },
  { key: "file", label: "Dateien" },
  { key: "asset", label: "Anlagen" },
  { key: "activity", label: "Historie" },
];

/**
 * Globale Suche mit Typ-Filter und Kontextzeilen.
 */
export function SearchPage() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<SearchFilter>("all");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function runSearch(query: string, typeFilter: SearchFilter) {
    if (!query.trim()) return;
    setBusy(true);
    setError("");
    try {
      const types = typeFilter === "all" ? undefined : [typeFilter];
      setResult(await api.search(query.trim(), { types }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Suche fehlgeschlagen");
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    await runSearch(q, filter);
  }

  function onFilter(next: SearchFilter) {
    setFilter(next);
    if (q.trim()) void runSearch(q, next);
  }

  const total =
    (result?.customers.length ?? 0) +
    (result?.documents.length ?? 0) +
    (result?.attachments.length ?? 0) +
    (result?.folders.length ?? 0) +
    (result?.assets.length ?? 0) +
    (result?.activities.length ?? 0);

  const showCustomers = filter === "all" || filter === "contact" || filter === "customer";
  const showWiki = filter === "all" || filter === "wiki";
  const showFiles = filter === "all" || filter === "file";
  const showAssets = filter === "all" || filter === "asset";
  const showActivities = filter === "all" || filter === "activity";

  return (
    <div className="page">
      <div className="section-head">
        <h2>Suche</h2>
        <p>
          Tipptolerant über Kontakte, Kunden, Wiki, Dateien, Anlagen und Historie – mit Kontextzeile.
        </p>
      </div>

      <form className="search-bar" onSubmit={onSearch}>
        <input
          autoFocus
          placeholder="z. B. Lizenz, Protokoll, Seriennummer…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Suche…" : "Suchen"}
        </button>
      </form>

      <div className="filter-chips" role="group" aria-label="Suchfilter">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={filter === f.key ? "chip chip-active" : "chip"}
            onClick={() => onFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      {result ? (
        <>
          <p className="muted">
            {total} Treffer für „{result.q}“
            {filter !== "all" ? ` · Filter ${FILTERS.find((f) => f.key === filter)?.label}` : ""}
          </p>

          {showCustomers ? (
            <ResultBlock title="Kontakte & Kunden" empty={result.customers.length === 0}>
              <ul className="list">
                {result.customers.map((c) => (
                  <li key={c.id}>
                    <Link className="list-row" to={`/customers/${c.id}`}>
                      <div>
                        <strong>{customerDisplayName({ ...c, kind: c.kind })}</strong>
                        <span className="muted">
                          {[
                            contactKindLabel(c.kind),
                            c.city,
                            c.email,
                            c.phone,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                        {c.snippet ? <span className="search-snippet">{c.snippet}</span> : null}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </ResultBlock>
          ) : null}

          {showWiki ? (
            <ResultBlock title="Wiki-Seiten" empty={result.documents.length === 0}>
              <ul className="list">
                {result.documents.map((d) => (
                  <li key={d.id}>
                    <Link className="list-row" to={`/documents/${d.id}`}>
                      <div>
                        <strong>{d.title}</strong>
                        <span className="muted">
                          {d.customerName} · {documentTypeLabel[d.type]}
                        </span>
                        {d.snippet ? <span className="search-snippet">{d.snippet}</span> : null}
                      </div>
                      <time className="muted">{formatDate(d.updatedAt)}</time>
                    </Link>
                  </li>
                ))}
              </ul>
            </ResultBlock>
          ) : null}

          {showFiles ? (
            <ResultBlock title="Dateien" empty={(result.attachments?.length ?? 0) === 0}>
              <ul className="list">
                {(result.attachments ?? []).map((a) => (
                  <li key={a.id}>
                    <div className="list-row">
                      <div>
                        <a
                          className="link-accent"
                          href={`/api/attachments/${a.id}/download`}
                          download
                        >
                          <strong>{a.originalName}</strong>
                        </a>
                        <span className="muted">
                          {a.customerName}
                          {" · "}
                          {formatBytes(a.size)}
                        </span>
                        {a.snippet ? <span className="search-snippet">{a.snippet}</span> : null}
                      </div>
                      <Link
                        className="btn btn-ghost btn-sm"
                        to={
                          a.documentId
                            ? `/documents/${a.documentId}`
                            : `/customers/${a.customerId}/wiki?view=files`
                        }
                      >
                        Öffnen
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </ResultBlock>
          ) : null}

          {showFiles ? (
            <ResultBlock title="Ordner" empty={(result.folders?.length ?? 0) === 0}>
              <ul className="list">
                {(result.folders ?? []).map((f) => (
                  <li key={f.id}>
                    <Link
                      className="list-row"
                      to={`/customers/${f.customerId}/wiki?view=files`}
                    >
                      <div>
                        <strong>{f.name}</strong>
                        <span className="muted">{f.customerName} · Ordner</span>
                        {f.snippet ? <span className="search-snippet">{f.snippet}</span> : null}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </ResultBlock>
          ) : null}

          {showAssets ? (
            <ResultBlock title="Anlagen" empty={result.assets.length === 0}>
              <ul className="list">
                {result.assets.map((a) => (
                  <li key={a.id}>
                    <Link className="list-row" to={`/customers/${a.customerId}/assets`}>
                      <div>
                        <strong>{a.name}</strong>
                        <span className="muted">
                          {a.customerName} · {assetKindLabel[a.kind]}
                          {a.serialNumber ? ` · S/N ${a.serialNumber}` : ""}
                        </span>
                        {a.snippet ? <span className="search-snippet">{a.snippet}</span> : null}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </ResultBlock>
          ) : null}

          {showActivities ? (
            <ResultBlock title="Historie" empty={result.activities.length === 0}>
              <ul className="list">
                {result.activities.map((a) => (
                  <li key={a.id}>
                    <Link className="list-row" to={`/customers/${a.customerId}/ops`}>
                      <div>
                        <strong>{a.title}</strong>
                        <span className="muted">{a.customerName}</span>
                        {a.snippet ? <span className="search-snippet">{a.snippet}</span> : null}
                      </div>
                      <time className="muted">{formatDate(a.occurredAt)}</time>
                    </Link>
                  </li>
                ))}
              </ul>
            </ResultBlock>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function ResultBlock({
  title,
  empty,
  children,
}: {
  title: string;
  empty: boolean;
  children: ReactNode;
}) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
      </div>
      {empty ? <p className="empty">Keine Treffer.</p> : children}
    </section>
  );
}
