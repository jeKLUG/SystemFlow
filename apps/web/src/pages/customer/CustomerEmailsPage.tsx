import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../api";
import { Modal } from "../../components/Modal";
import { localTodayIso } from "../../lib/dates";
import { emailDirectionLabel, formatDateOnly } from "../../lib/labels";
import type { AttachmentItem, CustomerEmailItem, EmailDirection } from "../../types";

const emptyForm = {
  subject: "",
  fromAddress: "",
  toAddress: "",
  ccAddress: "",
  direction: "inbound" as EmailDirection,
  sentAt: "",
  bodyText: "",
  notes: "",
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Kunden-E-Mail-Archiv: Mailverkehr ablegen, durchsuchen und mit Anhängen versehen.
 * @param embedded Ohne eigenen Hero – für Einbettung im Dokumente-Hub.
 */
export function CustomerEmailsPage({ embedded = false }: { embedded?: boolean }) {
  const { id = "" } = useParams();
  const [emails, setEmails] = useState<CustomerEmailItem[]>([]);
  const [query, setQuery] = useState("");
  const [directionFilter, setDirectionFilter] = useState<"" | EmailDirection>("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CustomerEmailItem | null>(null);
  const [files, setFiles] = useState<AttachmentItem[]>([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [error, setError] = useState("");

  async function reload() {
    const rows = await api.emails(id, {
      q: query.trim() || undefined,
      direction: directionFilter || undefined,
    });
    setEmails(rows);
  }

  useEffect(() => {
    void reload().catch(() => setEmails([]));
  }, [id, query, directionFilter]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setFiles([]);
      return;
    }
    void api
      .email(selectedId)
      .then((row) => {
        setDetail(row);
        setFiles(row.attachments ?? []);
      })
      .catch(() => {
        setDetail(null);
        setFiles([]);
      });
  }, [selectedId]);

  const summary = useMemo(() => {
    const inbound = emails.filter((e) => e.direction === "inbound").length;
    const outbound = emails.filter((e) => e.direction === "outbound").length;
    return { total: emails.length, inbound, outbound };
  }, [emails]);

  function openCreate() {
    setEditingId(null);
    setForm({ ...emptyForm, sentAt: localTodayIso() });
    setError("");
    setOpen(true);
  }

  function startEdit(email: CustomerEmailItem) {
    setEditingId(email.id);
    setForm({
      subject: email.subject,
      fromAddress: email.fromAddress ?? "",
      toAddress: email.toAddress ?? "",
      ccAddress: email.ccAddress ?? "",
      direction: email.direction,
      sentAt: email.sentAt,
      bodyText: email.bodyText ?? "",
      notes: email.notes ?? "",
    });
    setError("");
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    setEditingId(null);
    setForm(emptyForm);
    setError("");
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    const body = {
      subject: form.subject,
      fromAddress: form.fromAddress,
      toAddress: form.toAddress,
      ccAddress: form.ccAddress,
      direction: form.direction,
      sentAt: form.sentAt,
      bodyText: form.bodyText,
      notes: form.notes,
    };
    try {
      if (editingId) {
        await api.updateEmail(editingId, body);
        if (selectedId === editingId) {
          const refreshed = await api.email(editingId);
          setDetail(refreshed);
          setFiles(refreshed.attachments ?? []);
        }
      } else {
        const created = await api.createEmail(id, body);
        setSelectedId(created.id);
      }
      closeModal();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    }
  }

  async function removeEmail(email: CustomerEmailItem) {
    if (!confirm(`E-Mail „${email.subject}“ inkl. Anhänge löschen?`)) return;
    await api.deleteEmail(email.id);
    if (selectedId === email.id) setSelectedId(null);
    await reload();
  }

  async function onUpload(fileList: FileList | null) {
    if (!fileList?.length || !selectedId) return;
    setUploadBusy(true);
    try {
      for (const file of Array.from(fileList)) {
        await api.uploadAttachment(id, file, { emailId: selectedId });
      }
      const refreshed = await api.email(selectedId);
      setDetail(refreshed);
      setFiles(refreshed.attachments ?? []);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload fehlgeschlagen");
    } finally {
      setUploadBusy(false);
    }
  }

  async function removeFile(att: AttachmentItem) {
    if (!confirm(`Anhang „${att.originalName}“ löschen?`)) return;
    await api.deleteAttachment(att.id);
    setFiles((prev) => prev.filter((f) => f.id !== att.id));
    await reload();
  }

  return (
    <section className={`section emails-page${embedded ? " is-embedded" : ""}`}>
      {embedded ? (
        <div className="emails-toolbar panel docs-emails-toolbar">
          <input
            className="emails-search"
            type="search"
            placeholder="Suche in Betreff, Absender, Text…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            value={directionFilter}
            onChange={(e) => setDirectionFilter(e.target.value as "" | EmailDirection)}
            aria-label="Richtung filtern"
          >
            <option value="">Alle Richtungen</option>
            <option value="inbound">Eingang</option>
            <option value="outbound">Ausgang</option>
            <option value="internal">Intern</option>
          </select>
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            + E-Mail
          </button>
        </div>
      ) : (
        <div className="emails-hero panel">
          <div className="emails-hero-top">
            <div>
              <p className="eyebrow">Archiv</p>
              <h2>E-Mails</h2>
              <p className="muted">
                {summary.total} abgelegt
                {summary.inbound ? ` · ${summary.inbound} Eingang` : ""}
                {summary.outbound ? ` · ${summary.outbound} Ausgang` : ""}
              </p>
            </div>
            <button type="button" className="btn btn-primary" onClick={openCreate}>
              + E-Mail
            </button>
          </div>
          <div className="emails-toolbar">
            <input
              className="emails-search"
              type="search"
              placeholder="Suche in Betreff, Absender, Text…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              value={directionFilter}
              onChange={(e) => setDirectionFilter(e.target.value as "" | EmailDirection)}
              aria-label="Richtung filtern"
            >
              <option value="">Alle Richtungen</option>
              <option value="inbound">Eingang</option>
              <option value="outbound">Ausgang</option>
              <option value="internal">Intern</option>
            </select>
          </div>
        </div>
      )}

      {emails.length === 0 ? (
        <div className="emails-empty panel">
          <strong>Noch keine E-Mails</strong>
          <p className="muted">
            Lege wichtige Korrespondenz hier ab – mit Betreff, Absender, Datum und optionalen Anhängen
            (.eml, PDF, …).
          </p>
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            Erste E-Mail ablegen
          </button>
        </div>
      ) : (
        <div className="emails-layout">
          <ul className="email-list">
            {emails.map((email) => (
              <li key={email.id}>
                <button
                  type="button"
                  className={`email-row${selectedId === email.id ? " is-active" : ""}`}
                  onClick={() => setSelectedId(email.id)}
                >
                  <span className={`email-dir is-${email.direction}`}>
                    {emailDirectionLabel[email.direction]}
                  </span>
                  <span className="email-row-main">
                    <strong>{email.subject}</strong>
                    <span className="muted">
                      {email.direction === "outbound"
                        ? `An ${email.toAddress || "–"}`
                        : `Von ${email.fromAddress || "–"}`}
                      {(email.attachmentCount ?? 0) > 0
                        ? ` · ${email.attachmentCount} Anhang`
                        : ""}
                    </span>
                  </span>
                  <span className="email-row-when">{formatDateOnly(email.sentAt)}</span>
                </button>
              </li>
            ))}
          </ul>

          <aside className="panel email-detail">
            {!detail ? (
              <p className="empty">E-Mail in der Liste wählen.</p>
            ) : (
              <>
                <div className="email-detail-head">
                  <div>
                    <span className={`email-dir is-${detail.direction}`}>
                      {emailDirectionLabel[detail.direction]}
                    </span>
                    <h3>{detail.subject}</h3>
                    <p className="muted">{formatDateOnly(detail.sentAt)}</p>
                  </div>
                  <div className="cta-row">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => startEdit(detail)}
                    >
                      Bearbeiten
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => void removeEmail(detail)}
                    >
                      Löschen
                    </button>
                  </div>
                </div>

                <dl className="email-meta">
                  <div>
                    <dt>Von</dt>
                    <dd>{detail.fromAddress || "–"}</dd>
                  </div>
                  <div>
                    <dt>An</dt>
                    <dd>{detail.toAddress || "–"}</dd>
                  </div>
                  {detail.ccAddress ? (
                    <div>
                      <dt>Cc</dt>
                      <dd>{detail.ccAddress}</dd>
                    </div>
                  ) : null}
                </dl>

                <div className="email-body">
                  {detail.bodyText ? (
                    <pre>{detail.bodyText}</pre>
                  ) : (
                    <p className="muted">Kein Text hinterlegt.</p>
                  )}
                </div>

                {detail.notes ? (
                  <p className="email-notes muted">
                    <strong>Notiz: </strong>
                    {detail.notes}
                  </p>
                ) : null}

                <div className="email-attachments">
                  <div className="row-between">
                    <h4>Anhänge</h4>
                    <label className="btn btn-ghost btn-sm">
                      {uploadBusy ? "Lädt…" : "+ Datei"}
                      <input
                        type="file"
                        hidden
                        multiple
                        disabled={uploadBusy}
                        onChange={(e) => {
                          void onUpload(e.target.files);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                  {files.length === 0 ? (
                    <p className="muted">Keine Anhänge – z. B. .eml oder PDF hochladen.</p>
                  ) : (
                    <ul className="email-file-list">
                      {files.map((f) => (
                        <li key={f.id}>
                          <a href={`/api/attachments/${f.id}/download`} download>
                            {f.originalName}
                          </a>
                          <span className="muted">{formatBytes(f.size)}</span>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => void removeFile(f)}
                          >
                            Entfernen
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </aside>
        </div>
      )}

      <Modal
        open={open}
        title={editingId ? "E-Mail bearbeiten" : "E-Mail ablegen"}
        onClose={closeModal}
        className="modal-wide"
      >
        <form className="form-grid" onSubmit={save}>
          <label className="field full">
            <span>Betreff *</span>
            <input
              required
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              placeholder="z. B. Angebot Serverwartung"
            />
          </label>
          <label className="field">
            <span>Richtung</span>
            <select
              value={form.direction}
              onChange={(e) =>
                setForm({ ...form, direction: e.target.value as EmailDirection })
              }
            >
              <option value="inbound">Eingang</option>
              <option value="outbound">Ausgang</option>
              <option value="internal">Intern</option>
            </select>
          </label>
          <label className="field">
            <span>Datum *</span>
            <input
              type="date"
              required
              value={form.sentAt}
              onChange={(e) => setForm({ ...form, sentAt: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Von</span>
            <input
              value={form.fromAddress}
              onChange={(e) => setForm({ ...form, fromAddress: e.target.value })}
              placeholder="name@firma.de"
            />
          </label>
          <label className="field">
            <span>An</span>
            <input
              value={form.toAddress}
              onChange={(e) => setForm({ ...form, toAddress: e.target.value })}
              placeholder="kunde@beispiel.de"
            />
          </label>
          <label className="field full">
            <span>Cc</span>
            <input
              value={form.ccAddress}
              onChange={(e) => setForm({ ...form, ccAddress: e.target.value })}
            />
          </label>
          <label className="field full">
            <span>Text</span>
            <textarea
              rows={10}
              value={form.bodyText}
              onChange={(e) => setForm({ ...form, bodyText: e.target.value })}
              placeholder="Mailtext einfügen oder Kurzfassung…"
            />
          </label>
          <label className="field full">
            <span>Interne Notiz</span>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>
          {error ? <p className="form-error full">{error}</p> : null}
          <div className="full cta-row">
            <button type="submit" className="btn btn-primary">
              Speichern
            </button>
            <button type="button" className="btn btn-ghost" onClick={closeModal}>
              Abbrechen
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
