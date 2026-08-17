import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { customerDisplayName } from "../lib/customer";
import { formatBytes } from "../lib/files";
import { assetKindLabel, documentTypeLabel, formatDate } from "../lib/labels";
import type { SearchResult } from "../types";

export function SearchPage() {
  const [q, setQ] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    setError("");
    try {
      setResult(await api.search(q.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Suche fehlgeschlagen");
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  const total =
    (result?.customers.length ?? 0) +
    (result?.documents.length ?? 0) +
    (result?.attachments.length ?? 0) +
    (result?.folders.length ?? 0) +
    (result?.assets.length ?? 0) +
    (result?.activities.length ?? 0);

  return (
    <div className="page">
      <div className="section-head">
        <h2>Suche</h2>
        <p>
          Durchsucht Kontakte, Wiki-Seiten, Dateien, Ordner, Anlagen und die Einsatz-Historie.
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

      {error ? <p className="form-error">{error}</p> : null}

      {result ? (
        <>
          <p className="muted">
            {total} Treffer für „{result.q}“
          </p>

          <ResultBlock title="Kontakte" empty={result.customers.length === 0}>
            <ul className="list">
              {result.customers.map((c) => (
                <li key={c.id}>
                  <Link className="list-row" to={`/customers/${c.id}`}>
                    <div>
                      <strong>{customerDisplayName(c)}</strong>
                      <span className="muted">
                        {[c.city, c.email, c.phone].filter(Boolean).join(" · ") || "Kunde"}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </ResultBlock>

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
                    </div>
                    <time className="muted">{formatDate(d.updatedAt)}</time>
                  </Link>
                </li>
              ))}
            </ul>
          </ResultBlock>

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
                        {a.description ? ` · ${a.description}` : ""}
                        {" · "}
                        {formatBytes(a.size)}
                      </span>
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
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </ResultBlock>

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
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </ResultBlock>

          <ResultBlock title="Historie" empty={result.activities.length === 0}>
            <ul className="list">
              {result.activities.map((a) => (
                <li key={a.id}>
                  <Link className="list-row" to={`/customers/${a.customerId}/ops`}>
                    <div>
                      <strong>{a.title}</strong>
                      <span className="muted">
                        {a.customerName}
                        {a.description ? ` · ${a.description}` : ""}
                      </span>
                    </div>
                    <time className="muted">{formatDate(a.occurredAt)}</time>
                  </Link>
                </li>
              ))}
            </ul>
          </ResultBlock>
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
