import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { DeleteIcon } from "../components/Icons";
import { Modal } from "../components/Modal";
import {
  formatSentAt,
  interpolatePreview,
  marketingKindLabel,
  marketingStatusLabel,
} from "../lib/marketingUi";
import type {
  MarketingLead,
  MarketingLeadStatus,
  MarketingList,
  MarketingPreview,
  MarketingTemplate,
  MarketingTemplateKind,
} from "../types";

type Tab = "leads" | "templates" | "send";
type LeadFilter = "all" | MarketingLeadStatus;

const emptyLead = { email: "", company: "", contactPerson: "" };
const emptyTpl = {
  name: "",
  kind: "first" as MarketingTemplateKind,
  subject: "",
  body: "",
  ctaUrl: "",
  ctaLabel: "",
};

const leadFilters: { id: LeadFilter; label: string }[] = [
  { id: "all", label: "Alle" },
  { id: "new", label: "Neu" },
  { id: "sent", label: "Gesendet" },
  { id: "reminder_due", label: "Fällig" },
  { id: "reminded", label: "Erinnert" },
  { id: "replied", label: "Antwort" },
  { id: "contact", label: "Kontakt" },
  { id: "unsubscribed", label: "Abgemeldet" },
];

/**
 * Staff-Marketing: Listen, Leads, Textbausteine, Versand und Erinnerung.
 */
export function MarketingPage() {
  const [tab, setTab] = useState<Tab>("leads");
  const [lists, setLists] = useState<MarketingList[]>([]);
  const [listId, setListId] = useState("");
  const [leads, setLeads] = useState<MarketingLead[]>([]);
  const [templates, setTemplates] = useState<MarketingTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const [listName, setListName] = useState("");
  const [listCreateOpen, setListCreateOpen] = useState(false);
  const [leadForm, setLeadForm] = useState(emptyLead);
  const [leadFilter, setLeadFilter] = useState<LeadFilter>("all");
  const [tplForm, setTplForm] = useState(emptyTpl);
  const [editingTpl, setEditingTpl] = useState<string | null>(null);
  const [signatureHtml, setSignatureHtml] = useState("");
  const [signatureSaved, setSignatureSaved] = useState("");
  const [signatureEditing, setSignatureEditing] = useState(false);
  const [signatureDirty, setSignatureDirty] = useState(false);
  const [orgName, setOrgName] = useState("Systemhaus-Ess");

  const [replyLead, setReplyLead] = useState<MarketingLead | null>(null);
  const [replyNote, setReplyNote] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [sendKind, setSendKind] = useState<MarketingTemplateKind>("first");
  const [sendTemplateId, setSendTemplateId] = useState("");
  const [preview, setPreview] = useState<MarketingPreview | null>(null);
  const [sending, setSending] = useState(false);

  const selectedList = lists.find((l) => l.id === listId) ?? null;
  const dueCount = lists.reduce((n, l) => n + l.dueCount, 0);
  const leadTotal = lists.reduce((n, l) => n + l.leadCount, 0);

  async function reloadLists(preferId?: string) {
    const next = await api.marketingLists();
    setLists(next);
    const keep = preferId && next.some((l) => l.id === preferId) ? preferId : next[0]?.id ?? "";
    setListId(keep);
    return keep;
  }

  async function reloadLeads(id: string) {
    if (!id) {
      setLeads([]);
      return;
    }
    setLeads(await api.marketingLeads(id));
  }

  async function reloadTemplates() {
    setTemplates(await api.marketingTemplates());
  }

  async function boot() {
    setLoading(true);
    setError("");
    try {
      const id = await reloadLists(listId);
      await Promise.all([
        reloadLeads(id),
        reloadTemplates(),
        api.marketingSignature().then((s) => {
          setSignatureHtml(s.html);
          setSignatureSaved(s.html);
          setSignatureDirty(false);
          setSignatureEditing(false);
        }).catch(() => undefined),
        api.orgSettings().then((s) => {
          setOrgName(s.orgName?.trim() || "Systemhaus-Ess");
        }).catch(() => undefined),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Laden fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!listId) {
      setLeads([]);
      return;
    }
    void reloadLeads(listId).catch((err) =>
      setError(err instanceof Error ? err.message : "Leads konnten nicht geladen werden"),
    );
  }, [listId]);

  useEffect(() => {
    if (!listId) {
      setPreview(null);
      return;
    }
    void api
      .marketingPreview(listId, sendKind)
      .then(setPreview)
      .catch(() => setPreview(null));
  }, [listId, sendKind, leads]);

  const sendTemplates = useMemo(
    () => templates.filter((t) => t.kind === sendKind),
    [templates, sendKind],
  );

  useEffect(() => {
    if (!sendTemplates.some((t) => t.id === sendTemplateId)) {
      setSendTemplateId(sendTemplates[0]?.id ?? "");
    }
  }, [sendTemplates, sendTemplateId]);

  useEffect(() => {
    if (!msg) return;
    const id = window.setTimeout(() => setMsg(""), 4000);
    return () => window.clearTimeout(id);
  }, [msg]);

  const statusCounts = useMemo(() => {
    const counts: Record<MarketingLeadStatus, number> = {
      new: 0,
      sent: 0,
      reminder_due: 0,
      reminded: 0,
      replied: 0,
      contact: 0,
      unsubscribed: 0,
    };
    for (const lead of leads) counts[lead.status] += 1;
    return counts;
  }, [leads]);

  const visibleLeads = useMemo(
    () => (leadFilter === "all" ? leads : leads.filter((l) => l.status === leadFilter)),
    [leads, leadFilter],
  );

  const previewLead = leads[0] ?? { company: "Muster GmbH", contactPerson: "Max Mustermann" };
  const sendPreviewTpl = templates.find((t) => t.id === sendTemplateId) ?? null;

  function go(next: Tab) {
    setTab(next);
    if (next === "send" && dueCount > 0) setSendKind("reminder");
  }

  async function onCreateList(e: FormEvent) {
    e.preventDefault();
    const name = listName.trim();
    if (!name) return;
    setError("");
    try {
      const created = await api.createMarketingList(name);
      setListName("");
      setListCreateOpen(false);
      await reloadLists(created.id);
      setMsg("Liste angelegt");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Liste fehlgeschlagen");
    }
  }

  async function onDeleteList() {
    if (!listId) return;
    if (!window.confirm("Liste und alle Leads darin löschen?")) return;
    setError("");
    try {
      await api.deleteMarketingList(listId);
      const id = await reloadLists();
      await reloadLeads(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Löschen fehlgeschlagen");
    }
  }

  async function onAddLead(e: FormEvent) {
    e.preventDefault();
    if (!listId) return;
    setError("");
    try {
      await api.createMarketingLead({
        listId,
        email: leadForm.email.trim(),
        company: leadForm.company.trim(),
        contactPerson: leadForm.contactPerson.trim(),
      });
      setLeadForm(emptyLead);
      await Promise.all([reloadLeads(listId), reloadLists(listId)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lead fehlgeschlagen");
    }
  }

  async function onSaveTemplate(e: FormEvent) {
    e.preventDefault();
    setError("");
    const body = {
      name: tplForm.name.trim(),
      kind: tplForm.kind,
      subject: tplForm.subject.trim(),
      body: tplForm.body.trim(),
      ctaUrl: tplForm.ctaUrl.trim(),
      ctaLabel: tplForm.ctaLabel.trim(),
    };
    try {
      if (editingTpl) await api.updateMarketingTemplate(editingTpl, body);
      else await api.createMarketingTemplate(body);
      const wasEdit = Boolean(editingTpl);
      setTplForm(emptyTpl);
      setEditingTpl(null);
      await reloadTemplates();
      setMsg(wasEdit ? "Textbaustein gespeichert" : "Textbaustein angelegt");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    }
  }

  async function onSaveSignature(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const saved = await api.saveMarketingSignature(signatureHtml);
      setSignatureHtml(saved.html);
      setSignatureSaved(saved.html);
      setSignatureDirty(false);
      setSignatureEditing(false);
      setMsg("Signatur gespeichert");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signatur fehlgeschlagen");
    }
  }

  function editTemplate(tpl: MarketingTemplate) {
    setEditingTpl(tpl.id);
    setTplForm({
      name: tpl.name,
      kind: tpl.kind,
      subject: tpl.subject,
      body: tpl.body,
      ctaUrl: tpl.ctaUrl ?? "",
      ctaLabel: tpl.ctaLabel ?? "",
    });
    setTab("templates");
  }

  function newTemplate() {
    setEditingTpl(null);
    setTplForm(emptyTpl);
  }

  async function withLead(id: string, fn: () => Promise<unknown>): Promise<boolean> {
    setBusyId(id);
    setError("");
    try {
      await fn();
      await Promise.all([reloadLeads(listId), reloadLists(listId)]);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Aktion fehlgeschlagen");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function onSend(kind: MarketingTemplateKind) {
    if (!listId || !sendTemplateId) return;
    setSending(true);
    setError("");
    setMsg("");
    try {
      const result =
        kind === "first"
          ? await api.sendMarketing(listId, sendTemplateId)
          : await api.remindMarketing(listId, sendTemplateId);
      setMsg(
        `${result.sent} gesendet${result.failed ? ` · ${result.failed} fehlgeschlagen` : ""}${
          result.skipped ? ` · ${result.skipped} übersprungen` : ""
        }`,
      );
      await Promise.all([reloadLeads(listId), reloadLists(listId)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Versand fehlgeschlagen");
    } finally {
      setSending(false);
    }
  }

  async function onTest() {
    if (!sendTemplateId) return;
    setSending(true);
    setError("");
    try {
      const res = await api.testMarketing(sendTemplateId, listId || undefined);
      setMsg(`Testmail an ${res.to}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test fehlgeschlagen");
    } finally {
      setSending(false);
    }
  }

  const skipSummary =
    preview && preview.skip.length > 0
      ? Object.entries(
          preview.skip.reduce<Record<string, number>>((acc, row) => {
            acc[row.reasonLabel] = (acc[row.reasonLabel] ?? 0) + 1;
            return acc;
          }, {}),
        )
          .map(([label, n]) => `${n} ${label}`)
          .join(" · ")
      : "";

  return (
    <div className="page mkt-page">
      <section className="mkt-hero panel">
        <div className="mkt-hero-top">
          <div>
            <p className="eyebrow">Akquise</p>
            <h2>Marketing</h2>
            <p className="muted">Empfänger listen, Texte pflegen, Erstmail und Erinnerung senden — getrennt von Kontakten.</p>
          </div>
          {dueCount > 0 ? (
            <button type="button" className="btn btn-primary" onClick={() => go("send")}>
              {dueCount} Erinnerung{dueCount === 1 ? "" : "en"} senden
            </button>
          ) : null}
        </div>
        <div className="mkt-views" role="tablist" aria-label="Bereich">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "leads"}
            className={`mkt-view${tab === "leads" ? " is-active" : ""}`}
            onClick={() => go("leads")}
          >
            <span className="mkt-view-icon" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                <path d="M16 21v-1.2A3.8 3.8 0 0 0 12.2 16H7.8A3.8 3.8 0 0 0 4 19.8V21" strokeLinecap="round" />
                <circle cx="10" cy="8" r="3.2" />
                <path d="M20 8v6M17 11h6" strokeLinecap="round" />
              </svg>
            </span>
            <span className="mkt-view-label">
              <strong>Empfänger</strong>
              <em>{leadTotal}</em>
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "templates"}
            className={`mkt-view${tab === "templates" ? " is-active" : ""}`}
            onClick={() => go("templates")}
          >
            <span className="mkt-view-icon" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                <path d="M7 3h7l5 5v13H7z" strokeLinejoin="round" />
                <path d="M14 3v5h5M9 13h6M9 17h4" strokeLinecap="round" />
              </svg>
            </span>
            <span className="mkt-view-label">
              <strong>Texte</strong>
              <em>{templates.length}</em>
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "send"}
            className={`mkt-view${tab === "send" ? " is-active" : ""}${dueCount > 0 ? " is-warn" : ""}`}
            onClick={() => go("send")}
          >
            <span className="mkt-view-icon" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                <path d="M4 6h16v12H4z" strokeLinejoin="round" />
                <path d="m4 7 8 6 8-6" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="mkt-view-label">
              <strong>Versand</strong>
              <em>{dueCount > 0 ? `${dueCount} fällig` : preview?.sendCount ?? 0}</em>
            </span>
          </button>
        </div>
      </section>

      {error ? <p className="form-error">{error}</p> : null}
      {msg ? <p className="form-success">{msg}</p> : null}

      {tab === "leads" ? (
        <section className="panel mkt-board">
          <div className="mkt-board-head">
            <div>
              <p className="eyebrow">Empfänger</p>
              <h3>{selectedList?.name ?? "Liste wählen"}</h3>
            </div>
            <div className="mkt-board-tools">
              {lists.length > 0 ? (
                <label className="mkt-list-select">
                  <span>Liste</span>
                  <select value={listId} onChange={(e) => setListId(e.target.value)} aria-label="Liste">
                    {lists.map((list) => (
                      <option key={list.id} value={list.id}>
                        {list.name} ({list.leadCount})
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {listCreateOpen || lists.length === 0 ? (
                <form className="mkt-inline" onSubmit={onCreateList}>
                  <input
                    value={listName}
                    onChange={(e) => setListName(e.target.value)}
                    placeholder="Name der Liste"
                    aria-label="Listenname"
                    autoFocus
                  />
                  <button type="submit" className="btn btn-primary" disabled={!listName.trim()}>
                    Anlegen
                  </button>
                  {lists.length > 0 ? (
                    <button type="button" className="btn btn-ghost" onClick={() => setListCreateOpen(false)}>
                      Abbrechen
                    </button>
                  ) : null}
                </form>
              ) : (
                <button type="button" className="btn btn-ghost" onClick={() => setListCreateOpen(true)}>
                  Neue Liste
                </button>
              )}
              {listId && lists.length > 0 ? (
                <button type="button" className="btn btn-ghost btn-icon" title="Liste löschen" onClick={() => void onDeleteList()}>
                  <DeleteIcon />
                </button>
              ) : null}
            </div>
          </div>

          {listId ? (
            <>
              <div className="mkt-filters" role="tablist" aria-label="Status">
                {leadFilters.map((f) => {
                  const n = f.id === "all" ? leads.length : statusCounts[f.id];
                  return (
                    <button
                      key={f.id}
                      type="button"
                      role="tab"
                      aria-selected={leadFilter === f.id}
                      className={`mkt-filter${leadFilter === f.id ? " is-active" : ""}${
                        f.id === "reminder_due" && n > 0 ? " is-warn" : ""
                      }`}
                      onClick={() => setLeadFilter(f.id)}
                    >
                      {f.label}
                      <em>{n}</em>
                    </button>
                  );
                })}
              </div>

              <form className="mkt-quick panel" onSubmit={onAddLead}>
                <span className="mkt-quick-icon" aria-hidden>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                    <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                  </svg>
                </span>
                <label className="mkt-quick-field">
                  <span>E-Mail</span>
                  <input
                    type="email"
                    required
                    value={leadForm.email}
                    onChange={(e) => setLeadForm({ ...leadForm, email: e.target.value })}
                    placeholder="name@firma.de"
                  />
                </label>
                <label className="mkt-quick-field">
                  <span>Firma</span>
                  <input
                    required
                    value={leadForm.company}
                    onChange={(e) => setLeadForm({ ...leadForm, company: e.target.value })}
                    placeholder="Muster GmbH"
                  />
                </label>
                <label className="mkt-quick-field">
                  <span>Ansprechpartner</span>
                  <input
                    value={leadForm.contactPerson}
                    onChange={(e) => setLeadForm({ ...leadForm, contactPerson: e.target.value })}
                    placeholder="optional"
                  />
                </label>
                <button type="submit" className="btn btn-primary">
                  Hinzufügen
                </button>
              </form>

              {loading ? (
                <p className="empty">Lade…</p>
              ) : visibleLeads.length === 0 ? (
                <div className="mkt-empty">
                  <strong>{leads.length === 0 ? "Noch keine Empfänger" : "Keine Treffer"}</strong>
                  <p className="muted">
                    {leads.length === 0
                      ? "E-Mail, Firma und optional den Ansprechpartner eintragen."
                      : "Anderen Status wählen oder Filter auf „Alle“."}
                  </p>
                </div>
              ) : (
                <ul className="mkt-rows">
                  {visibleLeads.map((lead) => (
                    <li
                      key={lead.id}
                      className={`${busyId === lead.id ? "is-busy" : ""}${
                        lead.status === "unsubscribed" ? " is-muted" : ""
                      }`}
                    >
                      <div className="mkt-row">
                        <div className="mkt-row-main">
                          <strong>{lead.company}</strong>
                          <div className="mkt-row-meta">
                            <span className="mkt-chip">{lead.email}</span>
                            {lead.contactPerson ? <span className="mkt-chip">{lead.contactPerson}</span> : null}
                            <span className={`mkt-status is-${lead.status}`}>
                              {marketingStatusLabel[lead.status]}
                            </span>
                          </div>
                          {lead.replyNote ? <p className="muted mkt-row-note">{lead.replyNote}</p> : null}
                        </div>
                        <span className="mkt-row-when">
                          {formatSentAt(lead.firstSentAt)}
                          {lead.reminderSentAt ? (
                            <em>Erinnerung {formatSentAt(lead.reminderSentAt)}</em>
                          ) : null}
                        </span>
                        <div className="mkt-row-actions">
                          {lead.status !== "contact" ? (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              disabled={busyId === lead.id}
                              onClick={() => {
                                setReplyLead(lead);
                                setReplyNote(lead.replyNote ?? "");
                              }}
                            >
                              {lead.repliedAt ? "Notiz" : "Geantwortet"}
                            </button>
                          ) : null}
                          {lead.status === "replied" && !lead.customerId ? (
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              disabled={busyId === lead.id}
                              onClick={() => void withLead(lead.id, () => api.convertMarketingLead(lead.id))}
                            >
                              Als Kontakt
                            </button>
                          ) : null}
                          {lead.customerId ? (
                            <Link className="btn btn-ghost btn-sm" to={`/customers/${lead.customerId}`}>
                              Öffnen
                            </Link>
                          ) : null}
                          {!lead.doNotContact ? (
                            <button
                              type="button"
                              className="btn btn-ghost btn-icon"
                              title="Abmelden"
                              disabled={busyId === lead.id}
                              onClick={() =>
                                void withLead(lead.id, () => api.setMarketingDoNotContact(lead.id, true))
                              }
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                                <circle cx="12" cy="12" r="8" />
                                <path d="M8 12h8" strokeLinecap="round" />
                              </svg>
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="btn btn-ghost btn-icon"
                            title="Löschen"
                            disabled={busyId === lead.id}
                            onClick={() => {
                              if (!window.confirm("Lead löschen?")) return;
                              void withLead(lead.id, () => api.deleteMarketingLead(lead.id));
                            }}
                          >
                            <DeleteIcon />
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <div className="mkt-empty">
              <strong>Zuerst eine Liste</strong>
              <p className="muted">z. B. „Handwerk September“ oder „Kaltakquise NRW“.</p>
            </div>
          )}
        </section>
      ) : null}

      {tab === "templates" ? (
        <>
          <div className="mkt-split">
            <section className="panel mkt-board">
              <div className="mkt-board-head">
                <div>
                  <p className="eyebrow">Vorlagen</p>
                  <h3>Textbausteine</h3>
                </div>
                <button type="button" className="btn btn-ghost" onClick={newTemplate}>
                  Neu
                </button>
              </div>
              {templates.length === 0 ? (
                <div className="mkt-empty">
                  <strong>Noch kein Text</strong>
                  <p className="muted">Rechts Erstmail oder Erinnerung schreiben.</p>
                </div>
              ) : (
                <ul className="mkt-tpl-cards">
                  {templates.map((tpl) => (
                    <li key={tpl.id}>
                      <button
                        type="button"
                        className={`mkt-tpl-card${editingTpl === tpl.id ? " is-active" : ""}`}
                        onClick={() => editTemplate(tpl)}
                      >
                        <span className={`mkt-status is-${tpl.kind === "reminder" ? "reminded" : "sent"}`}>
                          {marketingKindLabel[tpl.kind]}
                        </span>
                        <strong>{tpl.name}</strong>
                        <span className="muted">{tpl.subject}</span>
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon"
                        title="Löschen"
                        onClick={() => {
                          if (!window.confirm("Textbaustein löschen?")) return;
                          void api
                            .deleteMarketingTemplate(tpl.id)
                            .then(() => {
                              if (editingTpl === tpl.id) newTemplate();
                              return reloadTemplates();
                            })
                            .catch((err) =>
                              setError(err instanceof Error ? err.message : "Löschen fehlgeschlagen"),
                            );
                        }}
                      >
                        <DeleteIcon />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="panel mkt-board">
              <div className="mkt-board-head">
                <div>
                  <p className="eyebrow">{editingTpl ? "Bearbeiten" : "Neu"}</p>
                  <h3>{editingTpl ? "Text anpassen" : "Textbaustein"}</h3>
                </div>
              </div>
              <form className="mkt-tpl-form" onSubmit={onSaveTemplate}>
                <label className="field">
                  <span>Name</span>
                  <input
                    required
                    value={tplForm.name}
                    onChange={(e) => setTplForm({ ...tplForm, name: e.target.value })}
                    placeholder="z. B. Kaltakquise"
                  />
                </label>
                <label className="field">
                  <span>Art</span>
                  <select
                    value={tplForm.kind}
                    onChange={(e) =>
                      setTplForm({ ...tplForm, kind: e.target.value as MarketingTemplateKind })
                    }
                  >
                    <option value="first">Erstmail</option>
                    <option value="reminder">Erinnerung</option>
                  </select>
                </label>
                <label className="field full">
                  <span>Betreff</span>
                  <input
                    required
                    value={tplForm.subject}
                    onChange={(e) => setTplForm({ ...tplForm, subject: e.target.value })}
                    placeholder="IT-Betreuung für {{firma}}"
                  />
                </label>
                <label className="field full">
                  <span>Text</span>
                  <textarea
                    required
                    rows={9}
                    value={tplForm.body}
                    onChange={(e) => setTplForm({ ...tplForm, body: e.target.value })}
                    placeholder="Guten Tag {{ansprechpartner}}, …"
                  />
                  <small className="muted">{"{{firma}}"} und {"{{ansprechpartner}}"} werden ersetzt.</small>
                </label>
                <label className="field">
                  <span>Button-Text</span>
                  <input
                    value={tplForm.ctaLabel}
                    onChange={(e) => setTplForm({ ...tplForm, ctaLabel: e.target.value })}
                    placeholder="15-Min-Gespräch"
                  />
                </label>
                <label className="field">
                  <span>Link oder Telefon</span>
                  <input
                    value={tplForm.ctaUrl}
                    onChange={(e) => setTplForm({ ...tplForm, ctaUrl: e.target.value })}
                    placeholder="https://… oder +49…"
                  />
                </label>
                <div className="mkt-form-actions">
                  {editingTpl ? (
                    <button type="button" className="btn btn-ghost" onClick={newTemplate}>
                      Abbrechen
                    </button>
                  ) : null}
                  <button type="submit" className="btn btn-primary">
                    Speichern
                  </button>
                </div>
              </form>
              {tplForm.body || tplForm.subject ? (
                <div className="mkt-letter">
                  <p className="eyebrow">Vorschau</p>
                  <strong>{interpolatePreview(tplForm.subject || "Betreff", previewLead)}</strong>
                  <p>{interpolatePreview(tplForm.body || "", previewLead)}</p>
                </div>
              ) : null}
            </section>
          </div>

          <section className={`panel mkt-sig${signatureEditing ? " is-editing" : ""}`}>
            <div className="mkt-board-head">
              <div>
                <p className="eyebrow">Unter jeder Mail</p>
                <h3>Signatur</h3>
              </div>
              {!signatureEditing ? (
                <button type="button" className="btn btn-ghost" onClick={() => setSignatureEditing(true)}>
                  {signatureSaved.trim() ? "Bearbeiten" : "Einfügen"}
                </button>
              ) : null}
            </div>
            {signatureEditing ? (
              <form className="mkt-sig-edit" onSubmit={onSaveSignature}>
                <label className="field">
                  <span>HTML aus Outlook oder Editor</span>
                  <textarea
                    rows={8}
                    value={signatureHtml}
                    autoFocus
                    onChange={(e) => {
                      setSignatureHtml(e.target.value);
                      setSignatureDirty(true);
                    }}
                    placeholder="<p>Mit freundlichen Grüßen<br>…</p>"
                    spellCheck={false}
                  />
                </label>
                <div className="mkt-sig-live">
                  <span className="eyebrow">Vorschau</span>
                  {signatureHtml.trim() ? (
                    <iframe
                      className="mkt-sig-frame"
                      title="Signatur-Vorschau"
                      sandbox=""
                      srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:10px;background:#fff;color:#1f2937;font:13px/1.45 Segoe UI,Roboto,sans-serif}</style></head><body>${signatureHtml}</body></html>`}
                    />
                  ) : (
                    <p className="empty">Noch leer.</p>
                  )}
                </div>
                <div className="mkt-form-actions">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      setSignatureHtml(signatureSaved);
                      setSignatureDirty(false);
                      setSignatureEditing(false);
                    }}
                  >
                    Abbrechen
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={!signatureDirty}>
                    Speichern
                  </button>
                </div>
              </form>
            ) : signatureSaved.trim() ? (
              <iframe
                className="mkt-sig-frame"
                title="Signatur"
                sandbox=""
                srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:10px 12px;background:#fff;color:#1f2937;font:13px/1.45 Segoe UI,Roboto,sans-serif}</style></head><body>${signatureSaved}</body></html>`}
              />
            ) : (
              <p className="muted">Noch keine Signatur. Über Einfügen Outlook-HTML einfügen.</p>
            )}
          </section>
        </>
      ) : null}

      {tab === "send" ? (
        <div className="mkt-split mkt-split-send">
          <section className="panel mkt-board">
            <div className="mkt-board-head">
              <div>
                <p className="eyebrow">Kampagne</p>
                <h3>Senden</h3>
              </div>
            </div>
            <div className="mkt-send-stack">
              <label className="field">
                <span>1 · Liste</span>
                <select value={listId} onChange={(e) => setListId(e.target.value)}>
                  {lists.length === 0 ? <option value="">Keine Liste</option> : null}
                  {lists.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.name} · {list.leadCount} Empfänger
                    </option>
                  ))}
                </select>
              </label>
              <div className="field">
                <span>2 · Art</span>
                <div className="mkt-kind" role="tablist" aria-label="Versandart">
                  <button
                    type="button"
                    className={`mkt-kind-btn${sendKind === "first" ? " is-active" : ""}`}
                    onClick={() => setSendKind("first")}
                  >
                    Erstmail
                  </button>
                  <button
                    type="button"
                    className={`mkt-kind-btn${sendKind === "reminder" ? " is-active" : ""}${
                      dueCount > 0 ? " is-warn" : ""
                    }`}
                    onClick={() => setSendKind("reminder")}
                  >
                    Erinnerung{dueCount ? ` · ${dueCount}` : ""}
                  </button>
                </div>
              </div>
              <label className="field">
                <span>3 · Text</span>
                <select value={sendTemplateId} onChange={(e) => setSendTemplateId(e.target.value)}>
                  {sendTemplates.length === 0 ? (
                    <option value="">Kein {marketingKindLabel[sendKind]}-Text</option>
                  ) : null}
                  {sendTemplates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name}
                    </option>
                  ))}
                </select>
              </label>
              {preview ? (
                <div className="mkt-counts">
                  <div>
                    <strong>{preview.sendCount}</strong>
                    <span>gehen raus</span>
                  </div>
                  <div>
                    <strong>{preview.skipCount}</strong>
                    <span>bleiben draußen</span>
                  </div>
                </div>
              ) : null}
              {skipSummary ? <p className="muted mkt-skip-summary">{skipSummary}</p> : null}
              <div className="mkt-send-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={sending || !sendTemplateId}
                  onClick={() => void onTest()}
                >
                  Test an mich
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={sending || !listId || !sendTemplateId || !preview?.sendCount}
                  onClick={() => void onSend(sendKind)}
                >
                  {sending
                    ? "Sende…"
                    : sendKind === "first"
                      ? "Erstmail senden"
                      : "Erinnerung senden"}
                </button>
              </div>
              {!sendTemplateId ? (
                <p className="muted">
                  Unter Texte zuerst einen {marketingKindLabel[sendKind]}-Baustein anlegen.
                </p>
              ) : null}
            </div>
          </section>

          <section className="panel mkt-board">
            <div className="mkt-board-head">
              <div>
                <p className="eyebrow">Empfänger sieht</p>
                <h3>Vorschau</h3>
              </div>
            </div>
            {sendPreviewTpl ? (
              <div className="mkt-letter">
                <p className="mkt-letter-brand">{orgName}</p>
                <strong>{interpolatePreview(sendPreviewTpl.subject, previewLead)}</strong>
                <p>{interpolatePreview(sendPreviewTpl.body, previewLead)}</p>
                {sendPreviewTpl.ctaLabel ? (
                  <span className="mkt-letter-cta">{sendPreviewTpl.ctaLabel}</span>
                ) : null}
                {signatureHtml.trim() ? (
                  <iframe
                    className="mkt-sig-frame"
                    title="Signatur"
                    sandbox=""
                    srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:10px 0 0;background:#fff;color:#1f2937;font:13px/1.45 Segoe UI,Roboto,sans-serif}</style></head><body>${signatureHtml}</body></html>`}
                  />
                ) : null}
              </div>
            ) : (
              <div className="mkt-empty">
                <strong>Kein Text gewählt</strong>
                <p className="muted">Lege unter Texte einen Baustein an.</p>
              </div>
            )}
          </section>
        </div>
      ) : null}

      <Modal open={Boolean(replyLead)} title="Rückmeldung" onClose={() => setReplyLead(null)}>
        {replyLead ? (
          <form
            className="mkt-reply-form"
            onSubmit={(e) => {
              e.preventDefault();
              const id = replyLead.id;
              void withLead(id, () => api.markMarketingReplied(id, replyNote)).then((ok) => {
                if (ok) setReplyLead(null);
              });
            }}
          >
            <p className="muted">
              {replyLead.company} · {replyLead.email}
            </p>
            <label className="field">
              <span>Notiz</span>
              <textarea
                rows={4}
                value={replyNote}
                onChange={(e) => setReplyNote(e.target.value)}
                placeholder="z. B. Anruf 22.9., Interesse Wartung"
              />
            </label>
            <div className="mkt-form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setReplyLead(null)}>
                Abbrechen
              </button>
              <button type="submit" className="btn btn-primary">
                Speichern
              </button>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
