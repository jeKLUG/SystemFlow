import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { DeleteIcon } from "../components/Icons";
import { HelpHint } from "../components/HelpHint";
import { Modal } from "../components/Modal";
import {
  formatSentDay,
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

/** Kurzzeile für Versanddatum und Stückzahl einer Liste. */
function listHistoryLabel(list: MarketingList): string {
  const parts: string[] = [];
  if (list.firstSentAt) {
    parts.push(`Erstmail ${formatSentDay(list.firstSentAt)}${list.sentCount ? ` · ${list.sentCount}` : ""}`);
  }
  if (list.reminderSentAt) {
    parts.push(
      `Erinnerung ${formatSentDay(list.reminderSentAt)}${list.reminderCount ? ` · ${list.reminderCount}` : ""}`,
    );
  }
  return parts.join(" · ");
}

/** Dropdown-Einträge: aktive Listen zuerst, Archiv mit Versanddatum. */
function listMenuItems(lists: MarketingList[]) {
  const hasArchive = lists.some((list) => list.archivedAt);
  return lists.map((list) => {
    const archived = Boolean(list.archivedAt);
    return {
      id: list.id,
      label: list.name,
      hint: archived ? formatSentDay(list.lastSentAt ?? list.archivedAt) : String(list.leadCount),
      detail: archived
        ? [`${list.leadCount} Empfänger`, list.sentCount ? `${list.sentCount} Erstmail` : "", list.reminderCount ? `${list.reminderCount} Erinnerung` : ""]
            .filter(Boolean)
            .join(" · ")
        : list.dueCount
          ? `${list.dueCount} fällig`
          : undefined,
      group: hasArchive ? (archived ? "Archiv" : "Aktiv") : undefined,
    };
  });
}

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
  const [leadQuery, setLeadQuery] = useState("");
  const [tplForm, setTplForm] = useState(emptyTpl);
  const [editingTpl, setEditingTpl] = useState<string | null>(null);
  const [selectedTplId, setSelectedTplId] = useState("");
  const [tplEditing, setTplEditing] = useState(false);
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

  const dueCount = lists.reduce((n, l) => n + l.dueCount, 0);
  const leadTotal = lists.reduce((n, l) => n + l.leadCount, 0);

  async function reloadLists(preferId?: string) {
    const next = await api.marketingLists();
    setLists(next);
    const keep =
      preferId && next.some((l) => l.id === preferId)
        ? preferId
        : next.find((l) => !l.archivedAt)?.id ?? next[0]?.id ?? "";
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
    setLeadQuery("");
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
    if (!templates.some((t) => t.id === selectedTplId)) {
      setSelectedTplId(templates[0]?.id ?? "");
    }
  }, [templates, selectedTplId]);

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

  const visibleLeads = useMemo(() => {
    const needle = leadQuery.trim().toLowerCase();
    return leads.filter((lead) => {
      if (leadFilter !== "all" && lead.status !== leadFilter) return false;
      if (!needle) return true;
      return [lead.company, lead.contactPerson, lead.email, lead.replyNote].some((part) =>
        part?.toLowerCase().includes(needle),
      );
    });
  }, [leads, leadFilter, leadQuery]);

  const previewLead = leads[0] ?? { company: "Muster GmbH", contactPerson: "Max Mustermann" };
  const sendPreviewTpl = templates.find((t) => t.id === sendTemplateId) ?? null;
  const selectedTpl = templates.find((t) => t.id === selectedTplId) ?? null;
  const selectedList = lists.find((l) => l.id === listId) ?? null;
  const listLocked = Boolean(selectedList?.hasSends || selectedList?.archivedAt);

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
    if (!listId || selectedList?.hasSends || selectedList?.archivedAt) return;
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

  async function onArchiveList() {
    if (!listId) return;
    setError("");
    try {
      await api.archiveMarketingList(listId);
      await reloadLists(listId);
      setMsg("Liste archiviert");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Archivieren fehlgeschlagen");
    }
  }

  async function onUnarchiveList() {
    if (!listId) return;
    setError("");
    try {
      await api.unarchiveMarketingList(listId);
      await reloadLists(listId);
      setMsg("Liste wieder aktiv");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Aktivieren fehlgeschlagen");
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
      const saved = editingTpl
        ? await api.updateMarketingTemplate(editingTpl, body)
        : await api.createMarketingTemplate(body);
      const wasEdit = Boolean(editingTpl);
      setTplForm(emptyTpl);
      setEditingTpl(null);
      setTplEditing(false);
      setSelectedTplId(saved.id);
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

  function selectTemplate(tpl: MarketingTemplate) {
    setSelectedTplId(tpl.id);
    setTplEditing(false);
    setEditingTpl(null);
    setTplForm(emptyTpl);
  }

  function editTemplate(tpl: MarketingTemplate) {
    setSelectedTplId(tpl.id);
    setEditingTpl(tpl.id);
    setTplEditing(true);
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
    setTplEditing(true);
    setTplForm(emptyTpl);
  }

  function cancelTemplate() {
    setTplEditing(false);
    setEditingTpl(null);
    setTplForm(emptyTpl);
  }

  async function deleteTemplate(id: string) {
    if (!window.confirm("Textbaustein löschen?")) return;
    setError("");
    try {
      await api.deleteMarketingTemplate(id);
      if (editingTpl === id) cancelTemplate();
      await reloadTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Löschen fehlgeschlagen");
    }
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

  function mailPreview(tpl: { subject: string; body: string; ctaLabel?: string | null }) {
    return (
      <div className="mkt-letter mkt-letter-full">
        <p className="mkt-letter-brand">{orgName}</p>
        <strong>{interpolatePreview(tpl.subject || "Betreff", previewLead)}</strong>
        <p>{interpolatePreview(tpl.body || "", previewLead)}</p>
        {tpl.ctaLabel ? <span className="mkt-letter-cta">{tpl.ctaLabel}</span> : null}
        {signatureHtml.trim() ? (
          <iframe
            className="mkt-sig-frame"
            title="Signatur"
            sandbox=""
            srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:10px 0 0;background:#fff;color:#1f2937;font:13px/1.45 Segoe UI,Roboto,sans-serif}</style></head><body>${signatureHtml}</body></html>`}
          />
        ) : null}
        <p className="mkt-letter-unsub">Abmelden</p>
      </div>
    );
  }

  return (
    <div className="page mkt-page">
      <section className="mkt-hero panel">
        <div className="mkt-hero-top">
          <div>
            <p className="eyebrow">Akquise</p>
            <div className="page-head-title">
              <h2>Marketing</h2>
              <HelpHint text="Empfänger listen, Texte pflegen, Erstmail und Erinnerung senden — getrennt von Kontakten." />
            </div>
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
            <div className="mkt-board-lead">
              {lists.length > 0 ? (
                <MktTitleMenu
                  ariaLabel="Liste"
                  value={listId}
                  onChange={setListId}
                  items={listMenuItems(lists)}
                />
              ) : (
                <h3>Liste wählen</h3>
              )}
              {listId ? (
                <div className="mkt-filters" role="tablist" aria-label="Status">
                  {leadFilters.map((f) => {
                    const n = f.id === "all" ? leads.length : statusCounts[f.id];
                    if (f.id !== "all" && f.id !== leadFilter && n === 0) return null;
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
              ) : null}
            </div>
            <div className="mkt-board-tools">
              {listCreateOpen || lists.length === 0 ? (
                <form className="mkt-inline" onSubmit={onCreateList}>
                  <input
                    value={listName}
                    onChange={(e) => setListName(e.target.value)}
                    placeholder="Name der Liste"
                    aria-label="Listenname"
                    autoFocus
                  />
                  <button type="submit" className="btn btn-primary btn-sm" disabled={!listName.trim()}>
                    Anlegen
                  </button>
                  {lists.length > 0 ? (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setListCreateOpen(false)}>
                      Abbrechen
                    </button>
                  ) : null}
                </form>
              ) : (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setListCreateOpen(true)}>
                  Neue Liste
                </button>
              )}
              {selectedList?.archivedAt ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void onUnarchiveList()}>
                  Aktivieren
                </button>
              ) : selectedList?.hasSends ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void onArchiveList()}>
                  Archivieren
                </button>
              ) : null}
              {listId && lists.length > 0 && !listLocked ? (
                <button type="button" className="btn btn-ghost btn-icon" title="Liste löschen" onClick={() => void onDeleteList()}>
                  <DeleteIcon />
                </button>
              ) : null}
            </div>
          </div>
          {selectedList && (selectedList.hasSends || selectedList.archivedAt) ? (
            <p className="mkt-list-history">
              {selectedList.archivedAt ? "Archiv" : "Versendet"}
              {listHistoryLabel(selectedList) ? ` · ${listHistoryLabel(selectedList)}` : ""}
            </p>
          ) : null}

          {listId ? (
            <>
              {!selectedList?.archivedAt ? (
              <form className="mkt-quick" onSubmit={onAddLead}>
                <input
                  type="email"
                  required
                  value={leadForm.email}
                  onChange={(e) => setLeadForm({ ...leadForm, email: e.target.value })}
                  placeholder="E-Mail"
                  aria-label="E-Mail"
                />
                <input
                  required
                  value={leadForm.company}
                  onChange={(e) => setLeadForm({ ...leadForm, company: e.target.value })}
                  placeholder="Firma"
                  aria-label="Firma"
                />
                <input
                  value={leadForm.contactPerson}
                  onChange={(e) => setLeadForm({ ...leadForm, contactPerson: e.target.value })}
                  placeholder="Ansprechpartner"
                  aria-label="Ansprechpartner"
                />
                <button type="submit" className="btn btn-primary btn-sm">
                  Hinzufügen
                </button>
              </form>
              ) : null}

              {loading ? (
                <p className="empty">Lade…</p>
              ) : leads.length === 0 ? (
                <div className="mkt-empty">
                  <strong>Noch keine Empfänger</strong>
                  <p className="muted">E-Mail, Firma und optional den Ansprechpartner eintragen.</p>
                </div>
              ) : (
                <>
                  <div className="mkt-lead-toolbar">
                    <input
                      className="mkt-lead-search"
                      value={leadQuery}
                      onChange={(e) => setLeadQuery(e.target.value)}
                      placeholder="Suchen…"
                      aria-label="Empfänger suchen"
                    />
                    {leadQuery.trim() ? (
                      <span className="muted">
                        {visibleLeads.length} von{" "}
                        {leadFilter === "all" ? leads.length : statusCounts[leadFilter]}
                      </span>
                    ) : null}
                  </div>
                  {visibleLeads.length === 0 ? (
                    <div className="mkt-empty">
                      <strong>Keine Treffer</strong>
                      <p className="muted">
                        {leadQuery.trim()
                          ? "Suche anpassen oder Filter auf „Alle“."
                          : "Anderen Status wählen oder Filter auf „Alle“."}
                      </p>
                    </div>
                  ) : (
                    <div className="mkt-rows-pane">
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
                          {lead.contactPerson ? <span className="mkt-row-who">{lead.contactPerson}</span> : null}
                          <a className="mkt-row-mail" href={`mailto:${lead.email}`}>
                            {lead.email}
                          </a>
                          <span className={`mkt-status is-${lead.status}`}>
                            {marketingStatusLabel[lead.status]}
                          </span>
                          {lead.firstSentAt ? (
                            <span className="mkt-row-when">
                              {formatSentDay(lead.firstSentAt)}
                              {lead.reminderSentAt ? ` · ${formatSentDay(lead.reminderSentAt)}` : ""}
                            </span>
                          ) : null}
                          {lead.replyNote ? <p className="muted mkt-row-note">{lead.replyNote}</p> : null}
                        </div>
                        <div className="mkt-row-actions">
                          {lead.status !== "contact" && lead.status !== "unsubscribed" ? (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              disabled={busyId === lead.id}
                              onClick={() => {
                                setReplyLead(lead);
                                setReplyNote(lead.replyNote ?? "");
                              }}
                            >
                              {lead.repliedAt ? "Notiz" : "Antwort"}
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
                              className="btn btn-ghost btn-sm"
                              title="Nicht mehr anschreiben"
                              disabled={busyId === lead.id}
                              onClick={() =>
                                void withLead(lead.id, () => api.setMarketingDoNotContact(lead.id, true))
                              }
                            >
                              Abmelden
                            </button>
                          ) : null}
                          {!lead.firstSentAt ? (
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
                          ) : null}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
                    </div>
                  )}
                </>
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
          <section className="panel mkt-board">
            <div className="mkt-board-head">
              <div className="mkt-board-lead">
                {templates.length > 0 ? (
                  <MktTitleMenu
                    ariaLabel="Textbaustein"
                    value={selectedTplId}
                    onChange={(id) => {
                      const tpl = templates.find((t) => t.id === id);
                      if (tpl) selectTemplate(tpl);
                    }}
                    items={[...templates]
                      .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, "de"))
                      .map((tpl) => ({
                        id: tpl.id,
                        label: tpl.name,
                        hint: marketingKindLabel[tpl.kind],
                        detail: tpl.subject,
                        group: marketingKindLabel[tpl.kind],
                      }))}
                  />
                ) : (
                  <h3>Textbausteine</h3>
                )}
              </div>
              <div className="mkt-board-tools">
                {selectedTpl && !tplEditing ? (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => editTemplate(selectedTpl)}>
                    Bearbeiten
                  </button>
                ) : null}
                <button type="button" className="btn btn-ghost btn-sm" onClick={newTemplate}>
                  Neu
                </button>
                {selectedTpl ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon"
                    title="Textbaustein löschen"
                    onClick={() => void deleteTemplate(selectedTpl.id)}
                  >
                    <DeleteIcon />
                  </button>
                ) : null}
              </div>
            </div>

            {tplEditing ? (
              <form className="mkt-tpl-form" onSubmit={onSaveTemplate}>
                <div className="mkt-board-head full">
                  <div>
                    <p className="eyebrow">{editingTpl ? "Bearbeiten" : "Neu"}</p>
                    <h3>{editingTpl ? selectedTpl?.name ?? "Text anpassen" : "Neuer Textbaustein"}</h3>
                  </div>
                </div>
                <label className="field">
                  <span>Name</span>
                  <input
                    required
                    value={tplForm.name}
                    onChange={(e) => setTplForm({ ...tplForm, name: e.target.value })}
                    placeholder="z. B. Kaltakquise"
                    autoFocus
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
                  <button type="button" className="btn btn-ghost" onClick={cancelTemplate}>
                    Abbrechen
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Speichern
                  </button>
                </div>
              </form>
            ) : selectedTpl ? (
              <div className="mkt-letter-stage is-plain">{mailPreview(selectedTpl)}</div>
            ) : (
              <div className="mkt-empty">
                <strong>Noch kein Text</strong>
                <p className="muted">Mit Neu eine Erstmail oder Erinnerung anlegen.</p>
              </div>
            )}
          </section>

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
            ) : null}
          </section>
        </>
      ) : null}

      {tab === "send" ? (
        <section className="panel mkt-board">
          <div className="mkt-send-bar">
            <MktTitleMenu
              compact
              ariaLabel="Liste"
              value={listId}
              onChange={setListId}
              placeholder="Keine Liste"
              items={listMenuItems(lists)}
            />
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
                Erinnerung{dueCount ? ` ${dueCount}` : ""}
              </button>
            </div>
            <MktTitleMenu
              compact
              ariaLabel="Textbaustein"
              value={sendTemplateId}
              onChange={setSendTemplateId}
              placeholder={`Kein ${marketingKindLabel[sendKind]}-Text`}
              items={sendTemplates.map((tpl) => ({
                id: tpl.id,
                label: tpl.name,
                hint: marketingKindLabel[tpl.kind],
                detail: tpl.subject,
              }))}
            />
            {preview ? (
              <p className="mkt-send-meta">
                <strong>{preview.sendCount}</strong>
                {preview.sendCount === 1 ? " geht raus" : " gehen raus"}
                {preview.skipCount > 0 ? ` · ${preview.skipCount} draußen` : ""}
              </p>
            ) : null}
            <div className="mkt-send-actions">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={sending || !sendTemplateId}
                onClick={() => void onTest()}
              >
                Test
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={sending || !listId || !sendTemplateId || !preview?.sendCount}
                onClick={() => void onSend(sendKind)}
              >
                {sending ? "Sende…" : "Senden"}
              </button>
            </div>
          </div>
          {skipSummary ? <p className="muted mkt-skip-summary">{skipSummary}</p> : null}
          {!sendTemplateId ? (
            <p className="muted mkt-skip-summary">
              Unter Texte zuerst einen {marketingKindLabel[sendKind]}-Baustein anlegen.
            </p>
          ) : null}

          {sendPreviewTpl ? (
            <div className="mkt-letter-stage">{mailPreview(sendPreviewTpl)}</div>
          ) : (
            <div className="mkt-empty">
              <strong>Kein Text gewählt</strong>
              <p className="muted">Lege unter Texte einen Baustein an.</p>
            </div>
          )}
        </section>
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

type MktTitleMenuItem = {
  id: string;
  label: string;
  hint?: string;
  detail?: string;
  group?: string;
};

/**
 * Dunkles Titel-Dropdown: geschlossener Titel plus scannbare Liste (Name · Meta, optional Betreff).
 */
function MktTitleMenu({
  items,
  value,
  onChange,
  ariaLabel,
  placeholder = "Wählen",
  compact = false,
}: {
  items: MktTitleMenuItem[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel: string;
  placeholder?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = items.find((item) => item.id === value);
  const hasDetail = items.some((item) => item.detail);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const grouped: { title: string | null; items: MktTitleMenuItem[] }[] = [];
  for (const item of items) {
    const title = item.group ?? null;
    const last = grouped[grouped.length - 1];
    if (!last || last.title !== title) grouped.push({ title, items: [item] });
    else last.items.push(item);
  }
  const showGroups = grouped.length > 1 && grouped.some((group) => group.title);

  return (
    <div className={`mkt-title-menu${compact ? " is-compact" : ""}${open ? " is-open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="mkt-title-menu-btn"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={items.length === 0}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="mkt-title-menu-value">{selected?.label ?? placeholder}</span>
        {selected?.hint ? <span className="mkt-title-menu-btn-meta">{selected.hint}</span> : null}
        <svg className="mkt-title-menu-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && items.length > 0 ? (
        <ul
          className={`mkt-title-menu-list${hasDetail ? " is-detailed" : ""}`}
          role="listbox"
          aria-label={ariaLabel}
        >
          {grouped.map((group) => (
            <Fragment key={group.title ?? group.items[0]?.id}>
              {showGroups && group.title ? (
                <li className="mkt-title-menu-group-label" aria-hidden>
                  {group.title}
                  <span>{group.items.length}</span>
                </li>
              ) : null}
              {group.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={item.id === value}
                    title={item.detail || undefined}
                    className={`mkt-title-menu-item${item.id === value ? " is-active" : ""}`}
                    onClick={() => {
                      onChange(item.id);
                      setOpen(false);
                    }}
                  >
                    <span className="mkt-title-menu-item-top">
                      <strong>{item.label}</strong>
                      {item.hint ? <span className="mkt-title-menu-hint">· {item.hint}</span> : null}
                    </span>
                    {item.detail ? <span className="mkt-title-menu-detail">{item.detail}</span> : null}
                  </button>
                </li>
              ))}
            </Fragment>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
