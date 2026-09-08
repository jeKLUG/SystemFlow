import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api } from "../api";
import { Modal } from "../components/Modal";
import type { OrgSettings, PriceItem, PriceItemKind } from "../types";

const kindLabel: Record<PriceItemKind, string> = {
  hourly: "Stundensatz",
  fixed: "Pauschale",
  unit: "Stückpreis",
};

const kindHint: Record<PriceItemKind, string> = {
  hourly: "pro Stunde",
  fixed: "Paket / Pauschale",
  unit: "pro Einheit",
};

const emptyForm = {
  name: "",
  description: "",
  kind: "hourly" as PriceItemKind,
  unitLabel: "",
  unitPrice: "",
  sku: "",
};

type KindFilter = "all" | PriceItemKind;

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: currency || "EUR",
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Preiskatalog: Stundensätze, Pauschalen und Stückpreise verwalten.
 */
export function PricesPage() {
  const [org, setOrg] = useState<OrgSettings | null>(null);
  const [orgForm, setOrgForm] = useState({
    defaultHourlyRate: "",
    currency: "EUR",
    defaultVatPercent: "19",
    invoiceNote: "",
  });
  const [orgMsg, setOrgMsg] = useState("");
  const [orgOpen, setOrgOpen] = useState(false);

  const [prices, setPrices] = useState<PriceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [showInactive, setShowInactive] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");

  async function load() {
    const [settings, items] = await Promise.all([api.orgSettings(), api.priceItems()]);
    setOrg(settings);
    setOrgForm({
      defaultHourlyRate:
        settings.defaultHourlyRate != null ? String(settings.defaultHourlyRate) : "",
      currency: settings.currency || "EUR",
      defaultVatPercent:
        settings.defaultVatPercent != null ? String(settings.defaultVatPercent) : "",
      invoiceNote: settings.invoiceNote ?? "",
    });
    setPrices(items);
  }

  useEffect(() => {
    setLoading(true);
    void load()
      .catch(() => setPrices([]))
      .finally(() => setLoading(false));
  }, []);

  const currency = org?.currency ?? "EUR";

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return prices
      .filter((item) => (kindFilter === "all" ? true : item.kind === kindFilter))
      .filter((item) => (showInactive ? true : item.active))
      .filter((item) => {
        if (!query) return true;
        return (
          item.name.toLowerCase().includes(query) ||
          (item.description ?? "").toLowerCase().includes(query) ||
          (item.sku ?? "").toLowerCase().includes(query)
        );
      })
      .sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        const kindOrder = { hourly: 0, fixed: 1, unit: 2 } as const;
        return (
          kindOrder[a.kind] - kindOrder[b.kind] ||
          a.sortOrder - b.sortOrder ||
          a.name.localeCompare(b.name, "de")
        );
      });
  }, [prices, q, kindFilter, showInactive]);

  const counts = useMemo(() => {
    const base = showInactive ? prices : prices.filter((p) => p.active);
    return {
      all: base.length,
      hourly: base.filter((p) => p.kind === "hourly").length,
      fixed: base.filter((p) => p.kind === "fixed").length,
      unit: base.filter((p) => p.kind === "unit").length,
    };
  }, [prices, showInactive]);

  function openCreate(kind: PriceItemKind = "hourly") {
    setEditingId(null);
    setForm({ ...emptyForm, kind, unitLabel: kind === "hourly" ? "Stunde" : kind === "unit" ? "Stück" : "Pauschale" });
    setFormError("");
    setFormOpen(true);
  }

  function openEdit(item: PriceItem) {
    setEditingId(item.id);
    setForm({
      name: item.name,
      description: item.description ?? "",
      kind: item.kind,
      unitLabel: item.unitLabel ?? "",
      unitPrice: String(item.unitPrice),
      sku: item.sku ?? "",
    });
    setFormError("");
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm);
    setFormError("");
  }

  async function savePrice(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    const body = {
      name: form.name.trim(),
      description: form.description,
      kind: form.kind,
      unitLabel: form.unitLabel,
      unitPrice: Number(form.unitPrice),
      active: true,
    };
    try {
      if (editingId) await api.updatePriceItem(editingId, body);
      else await api.createPriceItem(body);
      closeForm();
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    }
  }

  async function saveOrg(e: FormEvent) {
    e.preventDefault();
    setOrgMsg("");
    try {
      const updated = await api.updateOrgSettings({
        defaultHourlyRate: orgForm.defaultHourlyRate ? Number(orgForm.defaultHourlyRate) : null,
        currency: orgForm.currency.trim() || "EUR",
        defaultVatPercent: orgForm.defaultVatPercent ? Number(orgForm.defaultVatPercent) : null,
        invoiceNote: orgForm.invoiceNote,
      });
      setOrg(updated);
      setOrgMsg("Gespeichert");
      setOrgOpen(false);
      window.setTimeout(() => setOrgMsg(""), 2000);
    } catch (err) {
      setOrgMsg(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    }
  }

  return (
    <div className="page prices-page">
      <div className="page-header prices-page-header">
        <div>
          <p className="eyebrow">Katalog</p>
          <h2>Preise</h2>
          <p className="muted">Stundensätze, Pauschalen und Stückpreise für die Abrechnungsvorbereitung</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-primary" onClick={() => openCreate()}>
            + Position
          </button>
        </div>
      </div>

      <section className="prices-defaults panel">
        <div className="prices-defaults-main">
          <div className="prices-default">
            <span className="label">Standard-Stundensatz</span>
            <strong>
              {org?.defaultHourlyRate != null ? formatMoney(org.defaultHourlyRate, currency) : "–"}
            </strong>
          </div>
          <div className="prices-default">
            <span className="label">Währung</span>
            <strong>{currency}</strong>
          </div>
          <div className="prices-default">
            <span className="label">MwSt.</span>
            <strong>
              {org?.defaultVatPercent != null ? `${org.defaultVatPercent} %` : "–"}
            </strong>
          </div>
        </div>
        <div className="prices-defaults-actions">
          {orgMsg ? <span className="form-success">{orgMsg}</span> : null}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setOrgMsg("");
              setOrgOpen(true);
            }}
          >
            Standards bearbeiten
          </button>
        </div>
      </section>

      <div className="prices-toolbar">
        <label className="prices-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <circle cx="11" cy="11" r="6.5" />
            <path d="M16.2 16.2 20 20" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Position suchen…"
            aria-label="Preise suchen"
          />
        </label>
        <div className="prices-filters" role="tablist" aria-label="Preisart">
          {(
            [
              ["all", "Alle", counts.all],
              ["hourly", "Stunden", counts.hourly],
              ["fixed", "Pakete", counts.fixed],
              ["unit", "Stück", counts.unit],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={kindFilter === key}
              className={`prices-filter${kindFilter === key ? " is-active" : ""}`}
              onClick={() => setKindFilter(key)}
            >
              {label}
              <em>{count}</em>
            </button>
          ))}
        </div>
        <label className="prices-inactive-toggle">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Inaktive anzeigen
        </label>
      </div>

      {loading ? (
        <p className="muted">Lade Preise…</p>
      ) : filtered.length === 0 ? (
        <div className="prices-empty panel">
          <div className="prices-empty-icon" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M4 7.5h16v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-11Z" />
              <path d="M8 7.5V6a4 4 0 0 1 8 0v1.5" />
              <path d="M9 13h6" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <strong>{prices.length === 0 ? "Noch keine Positionen" : "Keine Treffer"}</strong>
            <p className="muted">
              {prices.length === 0
                ? "Lege z. B. „Remote Support“, „Vor-Ort-Einsatz“ oder ein Wartungspaket an."
                : "Filter oder Suche anpassen."}
            </p>
          </div>
          {prices.length === 0 ? (
            <button type="button" className="btn btn-primary" onClick={() => openCreate()}>
              Erste Position
            </button>
          ) : null}
        </div>
      ) : (
        <ul className="prices-grid">
          {filtered.map((item) => (
            <li
              key={item.id}
              className={`prices-card is-${item.kind}${item.active ? "" : " is-inactive"}`}
            >
              <div className="prices-card-top">
                <span className={`prices-kind is-${item.kind}`}>{kindLabel[item.kind]}</span>
                {!item.active ? <span className="prices-inactive-badge">Inaktiv</span> : null}
              </div>
              <h3>{item.name}</h3>
              <p className="prices-amount">
                <strong>{formatMoney(item.unitPrice, currency)}</strong>
                <span>
                  {item.unitLabel ? `/ ${item.unitLabel}` : kindHint[item.kind]}
                </span>
              </p>
              {item.description ? <p className="prices-desc">{item.description}</p> : null}
              {item.sku ? <p className="prices-sku">Art.-Nr. {item.sku}</p> : null}
              <div className="prices-card-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEdit(item)}>
                  Bearbeiten
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() =>
                    void api
                      .updatePriceItem(item.id, {
                        active: !item.active,
                        name: item.name,
                        unitPrice: item.unitPrice,
                      })
                      .then(() => load())
                  }
                >
                  {item.active ? "Deaktivieren" : "Aktivieren"}
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => {
                    if (!confirm(`„${item.name}“ wirklich löschen?`)) return;
                    void api.deletePriceItem(item.id).then(() => load());
                  }}
                >
                  Löschen
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={formOpen}
        title={editingId ? "Preisposition bearbeiten" : "Neue Preisposition"}
        onClose={closeForm}
        showCloseButton={false}
      >
        <form className="form-grid prices-form" onSubmit={savePrice}>
          <label className="field full">
            <span>Bezeichnung *</span>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="z. B. Remote Support"
              autoFocus
            />
          </label>
          <label className="field">
            <span>Art</span>
            <select
              value={form.kind}
              onChange={(e) => {
                const kind = e.target.value as PriceItemKind;
                setForm({
                  ...form,
                  kind,
                  unitLabel:
                    form.unitLabel ||
                    (kind === "hourly" ? "Stunde" : kind === "unit" ? "Stück" : "Pauschale"),
                });
              }}
            >
              {(Object.keys(kindLabel) as PriceItemKind[]).map((k) => (
                <option key={k} value={k}>
                  {kindLabel[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Preis ({currency})</span>
            <input
              type="number"
              required
              min={0}
              step={0.01}
              value={form.unitPrice}
              onChange={(e) => setForm({ ...form, unitPrice: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Einheit</span>
            <input
              value={form.unitLabel}
              onChange={(e) => setForm({ ...form, unitLabel: e.target.value })}
              placeholder="Stunde / Stück / Pauschale"
            />
          </label>
          <label className="field">
            <span>Artikel-Nr.</span>
            <input
              value={editingId ? form.sku || "–" : "Wird automatisch vergeben"}
              readOnly
              disabled
              title="Artikelnummer wird automatisch vergeben"
            />
          </label>
          <label className="field full">
            <span>Beschreibung</span>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Kurzbeschreibung für die Abrechnung"
            />
          </label>
          {formError ? <p className="form-error full">{formError}</p> : null}
          <div className="full form-actions">
            <button className="btn btn-primary" type="submit">
              {editingId ? "Speichern" : "Anlegen"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={closeForm}>
              Abbrechen
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={orgOpen}
        title="Standardpreise"
        onClose={() => setOrgOpen(false)}
        showCloseButton={false}
      >
        <p className="muted prices-org-lead">
          Satz für neue Zeitbuchungen (Snapshot). Rechnungen schreibst du weiter in Lexware.
        </p>
        <form className="form-grid prices-org-form" onSubmit={saveOrg}>
          <label className="field">
            <span>Stundensatz</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={orgForm.defaultHourlyRate}
              onChange={(e) => setOrgForm({ ...orgForm, defaultHourlyRate: e.target.value })}
              placeholder="z. B. 95"
            />
          </label>
          <label className="field">
            <span>Währung</span>
            <input
              value={orgForm.currency}
              onChange={(e) => setOrgForm({ ...orgForm, currency: e.target.value.toUpperCase() })}
              maxLength={8}
            />
          </label>
          <label className="field">
            <span>MwSt. %</span>
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={orgForm.defaultVatPercent}
              onChange={(e) => setOrgForm({ ...orgForm, defaultVatPercent: e.target.value })}
            />
          </label>
          <label className="field full">
            <span>Hinweistext für Abrechnung</span>
            <textarea
              rows={2}
              value={orgForm.invoiceNote}
              onChange={(e) => setOrgForm({ ...orgForm, invoiceNote: e.target.value })}
              placeholder="z. B. Zahlung innerhalb 14 Tagen …"
            />
          </label>
          {orgMsg && orgOpen ? <p className="form-error full">{orgMsg}</p> : null}
          <div className="full form-actions">
            <button className="btn btn-primary" type="submit">
              Speichern
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setOrgOpen(false)}>
              Abbrechen
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
