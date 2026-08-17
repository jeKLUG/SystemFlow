import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { api } from "../api";
import { customerDisplayName } from "../lib/customer";
import { getRecentCustomerIds, pushRecentCustomer } from "../lib/recentCustomers";
import type { Customer } from "../types";

type Props = {
  value: string;
  onChange: (customerId: string) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
  required?: boolean;
  placeholder?: string;
  className?: string;
  /** Nur aktive Kunden in der Suche (Standard: ja). */
  activeOnly?: boolean;
};

/**
 * Durchsuchbare Kundenauswahl – skaliert für viele Kunden (Server-Suche).
 */
export function CustomerPicker({
  value,
  onChange,
  allowEmpty = true,
  emptyLabel = "Kein Kunde",
  required = false,
  placeholder = "Kontakt suchen…",
  className = "",
  activeOnly = true,
}: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!value) {
      setSelected(null);
      return;
    }
    if (selected?.id === value) return;
    void api.customer(value).then(setSelected).catch(() => setSelected(null));
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        try {
          if (!query.trim()) {
            const ids = getRecentCustomerIds();
            if (ids.length) {
              const res = await api.customers({ ids: ids.join(",") });
              setResults(res.items);
            } else {
              const res = await api.customers({
                limit: 12,
                status: activeOnly ? "active" : "all",
                sort: "updated",
              });
              setResults(res.items);
            }
          } else {
            const res = await api.customers({
              q: query.trim(),
              limit: 20,
              status: activeOnly ? "active" : "all",
              sort: "name",
            });
            setResults(res.items);
          }
          setHighlight(0);
        } finally {
          setLoading(false);
        }
      })();
    }, 220);
    return () => window.clearTimeout(t);
  }, [query, open, activeOnly]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function choose(customer: Customer | null) {
    if (customer) {
      onChange(customer.id);
      setSelected(customer);
      pushRecentCustomer(customer.id);
      setQuery("");
    } else {
      onChange("");
      setSelected(null);
      setQuery("");
    }
    setOpen(false);
  }

  const options: Array<Customer | null> = allowEmpty ? [null, ...results] : results;

  function onKeyDown(e: KeyboardEvent) {
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
      setHighlight((h) => Math.min(h + 1, options.length - 1));
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      setHighlight((h) => Math.max(h - 1, 0));
      e.preventDefault();
    } else if (e.key === "Enter") {
      const pick = options[highlight];
      choose(pick ?? null);
      e.preventDefault();
    }
  }

  return (
    <div className={`customer-picker ${className}`} ref={rootRef}>
      <div className="customer-picker-control">
        <input
          className="customer-picker-input"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          required={required && !value}
          placeholder={selected ? customerDisplayName(selected) : placeholder}
          value={open ? query : selected ? customerDisplayName(selected) : ""}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
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
            onClick={() => choose(null)}
          >
            ×
          </button>
        ) : null}
      </div>

      {selected && !open ? (
        <span className="customer-picker-meta muted">
          {[selected.contactPerson, selected.city, selected.phone].filter(Boolean).join(" · ")}
        </span>
      ) : null}

      {open ? (
        <ul id={listId} className="customer-picker-list" role="listbox">
          {loading ? <li className="customer-picker-empty">Suche…</li> : null}
          {!loading && options.length === 0 ? (
            <li className="customer-picker-empty">Keine Treffer</li>
          ) : null}
          {!loading &&
            options.map((item, index) => {
              if (item === null) {
                return (
                  <li key="__empty">
                    <button
                      type="button"
                      role="option"
                      className={
                        highlight === index
                          ? "customer-picker-option is-active"
                          : "customer-picker-option"
                      }
                      onMouseEnter={() => setHighlight(index)}
                      onClick={() => choose(null)}
                    >
                      {emptyLabel}
                    </button>
                  </li>
                );
              }
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
                    <strong>{customerDisplayName(item)}</strong>
                    <span>
                      {[item.contactPerson, item.city, item.status === "inactive" ? "Inaktiv" : ""]
                        .filter(Boolean)
                        .join(" · ") || item.name}
                    </span>
                  </button>
                </li>
              );
            })}
          {!loading && !query.trim() && getRecentCustomerIds().length > 0 ? (
            <li className="customer-picker-hint">Zuletzt verwendet</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
