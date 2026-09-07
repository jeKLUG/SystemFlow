import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { contactKindLabel, customerDisplayName } from "../lib/customer";
import { assetKindLabel, documentTypeLabel } from "../lib/labels";
import type { SearchResult } from "../types";

type Hit = {
  key: string;
  group: string;
  label: string;
  meta: string;
  to: string;
};

/**
 * Globale Suche in der Topbar – durchsucht Kontakte, Wiki, Dateien, Inventar und Historie.
 */
export function GlobalSearch() {
  const navigate = useNavigate();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [active, setActive] = useState(0);

  const hits = flattenHits(result);
  const total = hits.length;

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setResult(null);
      setError("");
      setBusy(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setBusy(true);
      setError("");
      void api
        .search(query)
        .then((res) => {
          if (cancelled) return;
          setResult(res);
          setActive(0);
          setOpen(true);
        })
        .catch((err) => {
          if (cancelled) return;
          setResult(null);
          setError(err instanceof Error ? err.message : "Suche fehlgeschlagen");
          setOpen(true);
        })
        .finally(() => {
          if (!cancelled) setBusy(false);
        });
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [q]);

  useEffect(() => {
    function onDocPointer(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    }
    document.addEventListener("mousedown", onDocPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const hit = hits[active];
    if (hit) go(hit);
    else if (q.trim().length >= 2) setOpen(true);
  }

  function go(hit: Hit) {
    setOpen(false);
    setQ("");
    setResult(null);
    navigate(hit.to);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open || hits.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % hits.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + hits.length) % hits.length);
    } else if (e.key === "Enter" && hits[active]) {
      e.preventDefault();
      go(hits[active]);
    }
  }

  const showPanel = open && (q.trim().length >= 2 || error);

  return (
    <div className={`global-search${showPanel ? " is-open" : ""}`} ref={rootRef}>
      <form className="global-search-field" role="search" onSubmit={onSubmit}>
        <span className="global-search-icon" aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="11" cy="11" r="6.5" />
            <path d="M16.2 16.2 21 21" />
          </svg>
        </span>
        <input
          ref={inputRef}
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            if (e.target.value.trim().length >= 2) setOpen(true);
          }}
          onFocus={() => {
            if (q.trim().length >= 2) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          placeholder="Suche"
          aria-label="Globale Suche"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={showPanel}
          autoComplete="off"
          enterKeyHint="search"
        />
        {busy ? <span className="global-search-busy muted" aria-hidden>…</span> : null}
      </form>

      {showPanel ? (
        <div className="global-search-panel" id={listId} role="listbox" aria-label="Suchtreffer">
          {error ? <p className="form-error global-search-msg">{error}</p> : null}
          {!error && !busy && total === 0 ? (
            <p className="global-search-msg muted">Keine Treffer für „{q.trim()}“</p>
          ) : null}
          {!error && total > 0
            ? groupHits(hits).map(([group, items]) => (
                <div key={group} className="global-search-group">
                  <p className="global-search-group-label">{group}</p>
                  <ul>
                    {items.map(({ hit, index }) => (
                      <li key={hit.key}>
                        <Link
                          to={hit.to}
                          className={`global-search-hit${index === active ? " is-active" : ""}`}
                          role="option"
                          aria-selected={index === active}
                          onMouseEnter={() => setActive(index)}
                          onClick={(e) => {
                            e.preventDefault();
                            go(hit);
                          }}
                        >
                          <strong>{hit.label}</strong>
                          {hit.meta ? <span className="muted">{hit.meta}</span> : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            : null}
        </div>
      ) : null}
    </div>
  );
}

function flattenHits(result: SearchResult | null): Hit[] {
  if (!result) return [];
  const hits: Hit[] = [];

  for (const c of result.customers) {
    hits.push({
      key: `c-${c.id}`,
      group: "Kontakte & Kunden",
      label: customerDisplayName({ ...c, kind: c.kind }),
      meta: [contactKindLabel(c.kind), c.city, c.email, c.phone].filter(Boolean).join(" · "),
      to: `/customers/${c.id}`,
    });
  }
  for (const d of result.documents) {
    hits.push({
      key: `d-${d.id}`,
      group: "Wiki",
      label: d.title,
      meta: `${d.customerName || "Ohne Kunde"} · ${documentTypeLabel[d.type]}`,
      to: `/documents/${d.id}`,
    });
  }
  for (const a of result.attachments ?? []) {
    hits.push({
      key: `f-${a.id}`,
      group: "Dateien",
      label: a.originalName,
      meta: a.customerName,
      to: a.documentId
        ? `/documents/${a.documentId}`
        : `/customers/${a.customerId}/wiki?view=files`,
    });
  }
  for (const f of result.folders ?? []) {
    hits.push({
      key: `folder-${f.id}`,
      group: "Ordner",
      label: f.name,
      meta: f.customerName,
      to: `/customers/${f.customerId}/wiki?view=files`,
    });
  }
  for (const a of result.assets) {
    hits.push({
      key: `a-${a.id}`,
      group: "Inventar",
      label: a.name,
      meta: [
        a.customerName,
        assetKindLabel[a.kind],
        a.serialNumber ? `S/N ${a.serialNumber}` : "",
      ]
        .filter(Boolean)
        .join(" · "),
      to: `/customers/${a.customerId}/assets`,
    });
  }
  for (const a of result.activities) {
    hits.push({
      key: `act-${a.id}`,
      group: "Historie",
      label: a.title,
      meta: a.customerName,
      to: `/customers/${a.customerId}/ops`,
    });
  }

  return hits;
}

function groupHits(hits: Hit[]): Array<[string, Array<{ hit: Hit; index: number }>]> {
  const map = new Map<string, Array<{ hit: Hit; index: number }>>();
  hits.forEach((hit, index) => {
    const list = map.get(hit.group) ?? [];
    list.push({ hit, index });
    map.set(hit.group, list);
  });
  return [...map.entries()];
}
