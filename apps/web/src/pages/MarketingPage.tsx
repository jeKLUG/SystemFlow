import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
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

const emptyLead = { email: "", company: "", contactPerson: "" };
const emptyTpl = {
  name: "",
  kind: "first" as MarketingTemplateKind,
  subject: "",
  body: "",
  ctaUrl: "",
  ctaLabel: "",
};

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
  const [leadForm, setLeadForm] = useState(emptyLead);
  const [tplForm, setTplForm] = useState(emptyTpl);
  const [editingTpl, setEditingTpl] = useState<string | null>(null);
  const [signatureHtml, setSignatureHtml] = useState("");
  const [signatureDirty, setSignatureDirty] = useState(false);

  const [replyLead, setReplyLead] = useState<MarketingLead | null>(null);
  const [replyNote, setReplyNote] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [sendKind, setSendKind] = useState<MarketingTemplateKind>("first");
  const [sendTemplateId, setSendTemplateId] = useState("");
  const [preview, setPreview] = useState<MarketingPreview | null>(null);
  const [sending, setSending] = useState(false);

  const selectedList = lists.find((l) => l.id === listId) ?? null;
  const dueCount = selectedList?.dueCount ?? 0;

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
          setSignatureDirty(false);
        }),
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

  const previewLead = leads[0] ?? { company: "Muster GmbH", contactPerson: "Max Mustermann" };
  const sendPreviewTpl = templates.find((t) => t.id === sendTemplateId) ?? null;

  async function onCreateList(e: FormEvent) {
    e.preventDefault();
    const name = listName.trim();
    if (!name) return;
    setError("");
    try {
      const created = await api.createMarketingList(name);
      setListName("");
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
      setSignatureDirty(false);
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

  return (
    <div className="page mkt-page">
      <header className="page-head">
        <div className="page-head-title">
          <div>
            <p className="eyebrow">Akquise</p>
            <h2>Marketing</h2>
          </div>
        </div>
        <p className="muted">
          Eigene Leads, Textbausteine und Versand — getrennt von Kontakten.
        </p>
      </header>

      <div className="mkt-tabs" role="tablist" aria-label="Marketing">
        {(
          [
            ["leads", "Leads / Listen", leads.length],
            ["templates", "Textbausteine", templates.length],
            ["send", "Versand", preview?.sendCount ?? 0],
          ] as const
        ).map(([id, label, count]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`mkt-tab${tab === id ? " is-active" : ""}${
              id === "send" && dueCount > 0 ? " is-warn" : ""
            }`}
            onClick={() => setTab(id)}
          >
            {label}
            <em>{count}</em>
          </button>
        ))}
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {msg ? <p className="mkt-msg">{msg}</p> : null}

      {tab === "leads" ? (
        <div className="mkt-grid">
          <section className="panel mkt-side">
            <p className="eyebrow">Listen</p>
            <form className="mkt-inline" onSubmit={onCreateList}>
              <input
                value={listName}
                onChange={(e) => setListName(e.target.value)}
                placeholder="Neue Liste…"
                aria-label="Listenname"
              />
              <button type="submit" className="btn btn-primary" disabled={!listName.trim()}>
                Anlegen
              </button>
            </form>
            {lists.length === 0 ? (
              <p className="empty">Noch keine Liste.</p>
            ) : (
              <ul className="mkt-list-pick">
                {lists.map((list) => (
                  <li key={list.id}>
                    <button
                      type="button"
                      className={`mkt-list-btn${list.id === listId ? " is-active" : ""}`}
                      onClick={() => setListId(list.id)}
                    >
                      <strong>{list.name}</strong>
                      <span>
                        {list.leadCount} Leads
                        {list.dueCount ? ` · ${list.dueCount} fällig` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {listId ? (
              <button type="button" className="btn btn-ghost mkt-danger" onClick={() => void onDeleteList()}>
                Liste löschen
              </button>
            ) : null}
          </section>

          <section className="panel">
            <div className="mkt-section-head">
              <div>
                <p className="eyebrow">Empfänger</p>
                <h3>{selectedList?.name ?? "Keine Liste"}</h3>
              </div>
              <div className="mkt-pills" aria-label="Status">
                {(
                  [
                    ["new", statusCounts.new],
                    ["sent", statusCounts.sent],
                    ["reminder_due", statusCounts.reminder_due],
                    ["replied", statusCounts.replied],
                  ] as const
                ).map(([key, n]) =>
                  n ? (
                    <span key={key} className={`mkt-status is-${key}`}>
                      {marketingStatusLabel[key]} {n}
                    </span>
                  ) : null,
                )}
              </div>
            </div>

            <form className="mkt-lead-form" onSubmit={onAddLead}>
              <label className="field">
                <span>E-Mail</span>
                <input
                  type="email"
                  required
                  value={leadForm.email}
                  onChange={(e) => setLeadForm({ ...leadForm, email: e.target.value })}
                  disabled={!listId}
                />
              </label>
              <label className="field">
                <span>Firma</span>
                <input
                  required
                  value={leadForm.company}
                  onChange={(e) => setLeadForm({ ...leadForm, company: e.target.value })}
                  disabled={!listId}
                />
              </label>
              <label className="field">
                <span>Ansprechpartner</span>
                <input
                  value={leadForm.contactPerson}
                  onChange={(e) => setLeadForm({ ...leadForm, contactPerson: e.target.value })}
                  placeholder="optional"
                  disabled={!listId}
                />
              </label>
              <button type="submit" className="btn btn-primary" disabled={!listId}>
                Lead anlegen
              </button>
            </form>

            {loading ? (
              <p className="empty">Lade…</p>
            ) : leads.length === 0 ? (
              <p className="empty">Noch keine Leads in dieser Liste.</p>
            ) : (
              <div className="mkt-table-wrap">
                <table className="mkt-table">
                  <thead>
                    <tr>
                      <th>Firma</th>
                      <th>E-Mail</th>
                      <th>Ansprechpartner</th>
                      <th>Status</th>
                      <th>Gesendet</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((lead) => (
                      <tr key={lead.id}>
                        <td>
                          <strong>{lead.company}</strong>
                          {lead.replyNote ? <div className="muted">{lead.replyNote}</div> : null}
                        </td>
                        <td>{lead.email}</td>
                        <td>{lead.contactPerson || "—"}</td>
                        <td>
                          <span className={`mkt-status is-${lead.status}`}>
                            {marketingStatusLabel[lead.status]}
                          </span>
                        </td>
                        <td className="muted">
                          {formatSentAt(lead.firstSentAt)}
                          {lead.reminderSentAt ? (
                            <>
                              <br />
                              Erinnerung {formatSentAt(lead.reminderSentAt)}
                            </>
                          ) : null}
                        </td>
                        <td className="mkt-actions">
                          {lead.status !== "contact" ? (
                            <button
                              type="button"
                              className="btn btn-ghost"
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
                              className="btn btn-primary"
                              disabled={busyId === lead.id}
                              onClick={() => void withLead(lead.id, () => api.convertMarketingLead(lead.id))}
                            >
                              Als Kontakt
                            </button>
                          ) : null}
                          {lead.customerId ? (
                            <Link className="btn btn-ghost" to={`/customers/${lead.customerId}`}>
                              Kontakt öffnen
                            </Link>
                          ) : null}
                          {!lead.doNotContact ? (
                            <button
                              type="button"
                              className="btn btn-ghost"
                              disabled={busyId === lead.id}
                              onClick={() =>
                                void withLead(lead.id, () => api.setMarketingDoNotContact(lead.id, true))
                              }
                            >
                              Abmelden
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="btn btn-ghost"
                            disabled={busyId === lead.id}
                            onClick={() => {
                              if (!window.confirm("Lead löschen?")) return;
                              void withLead(lead.id, () => api.deleteMarketingLead(lead.id));
                            }}
                          >
                            Löschen
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      ) : null}

      {tab === "templates" ? (
        <>
        <div className="mkt-grid">
          <section className="panel">
            <p className="eyebrow">{editingTpl ? "Bearbeiten" : "Neu"}</p>
            <h3>Textbaustein</h3>
            <form className="mkt-tpl-form" onSubmit={onSaveTemplate}>
              <label className="field">
                <span>Name</span>
                <input
                  required
                  value={tplForm.name}
                  onChange={(e) => setTplForm({ ...tplForm, name: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Typ</span>
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
                  rows={8}
                  value={tplForm.body}
                  onChange={(e) => setTplForm({ ...tplForm, body: e.target.value })}
                  placeholder="Guten Tag {{ansprechpartner}}, …"
                />
                <small className="muted">Platzhalter: {"{{firma}}"} · {"{{ansprechpartner}}"}</small>
              </label>
              <label className="field">
                <span>CTA-Text</span>
                <input
                  value={tplForm.ctaLabel}
                  onChange={(e) => setTplForm({ ...tplForm, ctaLabel: e.target.value })}
                  placeholder="15-Min-Erstgespräch"
                />
              </label>
              <label className="field">
                <span>CTA-Link oder Telefon</span>
                <input
                  value={tplForm.ctaUrl}
                  onChange={(e) => setTplForm({ ...tplForm, ctaUrl: e.target.value })}
                  placeholder="https://… oder +49…"
                />
              </label>
              <div className="mkt-form-actions">
                {editingTpl ? (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      setEditingTpl(null);
                      setTplForm(emptyTpl);
                    }}
                  >
                    Abbrechen
                  </button>
                ) : null}
                <button type="submit" className="btn btn-primary">
                  Speichern
                </button>
              </div>
            </form>
          </section>

          <section className="panel">
            <p className="eyebrow">Vorhanden</p>
            <h3>Bausteine</h3>
            {templates.length === 0 ? (
              <p className="empty">Noch keine Textbausteine.</p>
            ) : (
              <ul className="mkt-tpl-list">
                {templates.map((tpl) => (
                  <li key={tpl.id}>
                    <div>
                      <strong>{tpl.name}</strong>
                      <span className={`mkt-status is-${tpl.kind === "reminder" ? "reminded" : "sent"}`}>
                        {marketingKindLabel[tpl.kind]}
                      </span>
                      <p className="muted">{tpl.subject}</p>
                    </div>
                    <div className="mkt-actions">
                      <button type="button" className="btn btn-ghost" onClick={() => editTemplate(tpl)}>
                        Bearbeiten
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => {
                          if (!window.confirm("Textbaustein löschen?")) return;
                          void api
                            .deleteMarketingTemplate(tpl.id)
                            .then(() => reloadTemplates())
                            .catch((err) =>
                              setError(err instanceof Error ? err.message : "Löschen fehlgeschlagen"),
                            );
                        }}
                      >
                        Löschen
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {tplForm.body || tplForm.subject ? (
              <div className="mkt-preview">
                <p className="eyebrow">Vorschau</p>
                <strong>{interpolatePreview(tplForm.subject || "Betreff", previewLead)}</strong>
                <p>{interpolatePreview(tplForm.body || "", previewLead)}</p>
              </div>
            ) : null}
          </section>
        </div>
        <section className="panel mkt-sig">
          <p className="eyebrow">Unter jeder Mail</p>
          <h3>HTML-Signatur</h3>
          <p className="muted">
            Outlook- oder HTML-Signatur einfügen. Sie steht unter dem Text (heller Block), der rechtliche
            Footer bleibt darunter.
          </p>
          <form className="mkt-sig-form" onSubmit={onSaveSignature}>
            <label className="field">
              <span>HTML</span>
              <textarea
                rows={8}
                value={signatureHtml}
                onChange={(e) => {
                  setSignatureHtml(e.target.value);
                  setSignatureDirty(true);
                }}
                placeholder={'<p>Mit freundlichen Grüßen<br>Max Mustermann<br>Systemhaus-Ess</p>'}
                spellCheck={false}
              />
            </label>
            {signatureHtml.trim() ? (
              <iframe
                className="mkt-sig-frame"
                title="Signatur-Vorschau"
                sandbox=""
                srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:12px;background:#fff;color:#1f2937;font:13px/1.45 Segoe UI,Roboto,sans-serif}</style></head><body>${signatureHtml}</body></html>`}
              />
            ) : (
              <p className="empty">Noch keine Signatur.</p>
            )}
            <div className="mkt-form-actions">
              <button type="submit" className="btn btn-primary" disabled={!signatureDirty}>
                Signatur speichern
              </button>
            </div>
          </form>
        </section>
        </>
      ) : null}

      {tab === "send" ? (
        <div className="mkt-grid">
          <section className="panel">
            <p className="eyebrow">Kampagne</p>
            <h3>Versand</h3>
            <label className="field">
              <span>Liste</span>
              <select value={listId} onChange={(e) => setListId(e.target.value)}>
                {lists.length === 0 ? <option value="">Keine Liste</option> : null}
                {lists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name} ({list.leadCount})
                  </option>
                ))}
              </select>
            </label>
            <div className="mkt-kind-switch" role="tablist" aria-label="Versandart">
              <button
                type="button"
                className={`mkt-tab${sendKind === "first" ? " is-active" : ""}`}
                onClick={() => setSendKind("first")}
              >
                Erstmail
              </button>
              <button
                type="button"
                className={`mkt-tab${sendKind === "reminder" ? " is-active" : ""}`}
                onClick={() => setSendKind("reminder")}
              >
                Erinnerung {dueCount ? `(${dueCount})` : ""}
              </button>
            </div>
            <label className="field">
              <span>Textbaustein</span>
              <select value={sendTemplateId} onChange={(e) => setSendTemplateId(e.target.value)}>
                {sendTemplates.length === 0 ? (
                  <option value="">Kein {marketingKindLabel[sendKind]}-Baustein</option>
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
                  <span>wird gesendet</span>
                </div>
                <div>
                  <strong>{preview.skipCount}</strong>
                  <span>übersprungen</span>
                </div>
              </div>
            ) : null}
            {preview && preview.skip.length > 0 ? (
              <p className="muted mkt-skip-summary">
                Übersprungen:{" "}
                {Object.entries(
                  preview.skip.reduce<Record<string, number>>((acc, row) => {
                    acc[row.reasonLabel] = (acc[row.reasonLabel] ?? 0) + 1;
                    return acc;
                  }, {}),
                )
                  .map(([label, n]) => `${n} ${label}`)
                  .join(" · ")}
              </p>
            ) : null}
            <div className="mkt-form-actions">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={sending || !sendTemplateId}
                onClick={() => void onTest()}
              >
                Testmail
              </button>
              {sendKind === "first" ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={sending || !listId || !sendTemplateId || !preview?.sendCount}
                  onClick={() => void onSend("first")}
                >
                  {sending ? "Sende…" : "Erstmail senden"}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={sending || !listId || !sendTemplateId || !preview?.sendCount}
                  onClick={() => void onSend("reminder")}
                >
                  {sending ? "Sende…" : "Erinnerung senden"}
                </button>
              )}
            </div>
          </section>

          <section className="panel">
            <p className="eyebrow">Inhalt</p>
            <h3>Vorschau</h3>
            {sendPreviewTpl ? (
              <div className="mkt-preview">
                <span className="mkt-status is-sent">{marketingKindLabel[sendPreviewTpl.kind]}</span>
                <strong>{interpolatePreview(sendPreviewTpl.subject, previewLead)}</strong>
                <p>{interpolatePreview(sendPreviewTpl.body, previewLead)}</p>
                {sendPreviewTpl.ctaLabel ? (
                  <p className="muted">Button: {sendPreviewTpl.ctaLabel}</p>
                ) : null}
                {signatureHtml.trim() ? (
                  <iframe
                    className="mkt-sig-frame"
                    title="Signatur"
                    sandbox=""
                    srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:10px;background:#fff;color:#1f2937;font:13px/1.45 Segoe UI,Roboto,sans-serif}</style></head><body>${signatureHtml}</body></html>`}
                  />
                ) : null}
              </div>
            ) : (
              <p className="empty">Zuerst einen Textbaustein anlegen.</p>
            )}
          </section>
        </div>
      ) : null}

      <Modal
        open={Boolean(replyLead)}
        title="Geantwortet"
        onClose={() => setReplyLead(null)}
      >
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
