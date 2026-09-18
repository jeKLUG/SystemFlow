import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { MonitoringAssignableAsset } from "../types";

type Props = {
  assets: MonitoringAssignableAsset[];
  value: string;
  onChange: (assetId: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

/**
 * Durchsuchbare Inventar-Auswahl, gruppiert nach Kunde.
 */
export function InventoryPicker({
  assets,
  value,
  onChange,
  placeholder = "Inventar suchen…",
  disabled = false,
  className = "",
}: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const controlRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [listStyle, setListStyle] = useState<CSSProperties>({});

  const selected = assets.find((a) => a.id === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return assets;
    return assets.filter((a) =>
      [a.name, a.hostname, a.customerName].some((v) => (v || "").toLowerCase().includes(q)),
    );
  }, [assets, query]);

  const groups = useMemo(() => {
    const map = new Map<string, MonitoringAssignableAsset[]>();
    for (const asset of filtered) {
      const key = asset.customerName || "Kunde";
      const list = map.get(key) ?? [];
      list.push(asset);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "de"));
  }, [filtered]);

  const flat = useMemo(() => groups.flatMap(([, items]) => items), [groups]);

  useEffect(() => {
    if (!open) return;
    setHighlight(0);
  }, [open, query]);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const el = controlRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const gap = 6;
      const maxH = 320;
      const pad = 8;
      const below = window.innerHeight - r.bottom - gap - pad;
      const above = r.top - gap - pad;
      const openUp = below < 160 && above > below;
      const height = Math.min(maxH, Math.max(140, openUp ? above : below));
      const width = Math.max(r.width, 280);
      setListStyle(
        openUp
          ? {
              left: Math.min(r.left, window.innerWidth - width - pad),
              width,
              bottom: window.innerHeight - r.top + gap,
              maxHeight: height,
            }
          : {
              left: Math.min(r.left, window.innerWidth - width - pad),
              width,
              top: r.bottom + gap,
              maxHeight: height,
            },
      );
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, filtered.length]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function choose(asset: MonitoringAssignableAsset | null) {
    onChange(asset?.id ?? "");
    setQuery("");
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (disabled) return;
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === "Escape") {
      setOpen(false);
      e.preventDefault();
      return;
    }
    if (e.key === "ArrowDown") {
      setHighlight((h) => Math.min(h + 1, Math.max(flat.length - 1, 0)));
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      setHighlight((h) => Math.max(h - 1, 0));
      e.preventDefault();
    } else if (e.key === "Enter") {
      choose(flat[highlight] ?? null);
      e.preventDefault();
    }
  }

  const display = selected ? `${selected.customerName} — ${selected.name}` : "";
  const emptyHint = assets.length === 0 ? "Kein freies Inventar" : placeholder;

  return (
    <div
      className={`customer-picker inventory-picker is-compact${selected && !open ? " has-value" : ""}${className ? ` ${className}` : ""}`}
      ref={rootRef}
    >
      <div className="customer-picker-control" ref={controlRef}>
        <input
          className="customer-picker-input"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          disabled={disabled || assets.length === 0}
          placeholder={selected ? display : emptyHint}
          title={selected && !open ? display : undefined}
          value={open ? query : display}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (disabled || assets.length === 0) return;
            setOpen(true);
            setQuery("");
          }}
          onKeyDown={onKeyDown}
        />
        {value ? (
          <button
            type="button"
            className="customer-picker-clear"
            aria-label="Auswahl löschen"
            disabled={disabled}
            onClick={() => choose(null)}
          >
            ×
          </button>
        ) : null}
      </div>

      {open && assets.length > 0
        ? createPortal(
            <ul
              id={listId}
              ref={listRef}
              className="customer-picker-list is-floating inventory-picker-list"
              role="listbox"
              style={listStyle}
            >
              {flat.length === 0 ? <li className="customer-picker-empty">Keine Treffer</li> : null}
              {groups.map(([customerName, items]) => (
                <li key={customerName} className="inventory-picker-group">
                  <span className="inventory-picker-group-label">{customerName}</span>
                  <ul>
                    {items.map((item) => {
                      const index = flat.findIndex((a) => a.id === item.id);
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={value === item.id}
                            className={[
                              "customer-picker-option",
                              highlight === index ? "is-active" : "",
                              value === item.id ? "is-selected" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            onMouseEnter={() => setHighlight(index)}
                            onClick={() => choose(item)}
                          >
                            <strong>{item.name}</strong>
                            <span>{item.hostname || "ohne Hostname"}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}
