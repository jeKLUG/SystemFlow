import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { AttachmentPanel } from "../components/AttachmentPanel";
import { CustomerPicker } from "../components/CustomerPicker";
import { DocumentEditor } from "../components/DocumentEditor";
import { Modal } from "../components/Modal";
import { documentTypeLabel, formatDate } from "../lib/labels";
import type { DocumentItem, DocumentType } from "../types";

/**
 * Wiki-/Notiz-Editor inkl. optionaler Kundenzuordnung für Schnellnotizen.
 */
export function DocumentPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<DocumentItem | null>(null);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<DocumentType>("note");
  const [content, setContent] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [savedSnapshot, setSavedSnapshot] = useState({
    title: "",
    type: "note" as DocumentType,
    content: "",
    customerId: "",
  });
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    void api
      .document(id)
      .then((d) => {
        setDoc(d);
        setTitle(d.title);
        setType(d.type);
        setContent(d.content);
        setCustomerId(d.customerId ?? "");
        setSavedSnapshot({
          title: d.title,
          type: d.type,
          content: d.content,
          customerId: d.customerId ?? "",
        });
        setSaveState("idle");
        setError("");
      })
      .catch(() => navigate("/quick-note"));
  }, [id, navigate]);

  const dirty = useMemo(() => {
    return (
      title !== savedSnapshot.title ||
      type !== savedSnapshot.type ||
      content !== savedSnapshot.content ||
      customerId !== savedSnapshot.customerId
    );
  }, [title, type, content, customerId, savedSnapshot]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  async function save() {
    if (!doc || !dirty) return;
    setSaveState("saving");
    setError("");
    try {
      const updated = await api.updateDocument(id, {
        title,
        type,
        content,
        customerId: customerId || null,
      });
      setDoc(updated);
      setCustomerId(updated.customerId ?? "");
      setSavedSnapshot({
        title,
        type,
        content,
        customerId: updated.customerId ?? "",
      });
      setSaveState("saved");
    } catch (err) {
      setSaveState("error");
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    }
  }

  async function confirmDelete() {
    setDeleteBusy(true);
    setError("");
    try {
      const cid = doc?.customerId;
      await api.deleteDocument(id);
      setDeleteOpen(false);
      navigate(cid ? `/customers/${cid}/wiki` : "/quick-note");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Löschen fehlgeschlagen");
      setDeleteBusy(false);
    }
  }

  if (!doc) return <div className="boot">Lade Dokument…</div>;

  return (
    <div className="page editor-page">
      <div className="breadcrumb">
        {doc.customerId || customerId ? (
          <>
            <Link to="/customers">Kunden</Link>
            <span>/</span>
            <Link to={`/customers/${customerId || doc.customerId}`}>Kunde</Link>
            <span>/</span>
            <Link to={`/customers/${customerId || doc.customerId}/wiki`}>Dokumente</Link>
          </>
        ) : (
          <>
            <Link to="/quick-note">Schnellnotiz</Link>
            <span>/</span>
            <span>Ohne Kunde</span>
          </>
        )}
        <span>/</span>
        <span>{title || "Seite"}</span>
      </div>

      <div className="editor-meta">
        <input
          className="title-input"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setSaveState("idle");
          }}
          aria-label="Titel"
        />
        <select
          value={type}
          onChange={(e) => {
            setType(e.target.value as DocumentType);
            setSaveState("idle");
          }}
          aria-label="Dokumenttyp"
        >
          <option value="article">Artikel</option>
          <option value="documentation">Dokumentation</option>
          <option value="note">Notiz</option>
          <option value="workflow">Workflow</option>
          <option value="protocol">Protokoll</option>
        </select>
        <span className="save-state">
          {saveState === "saving" && "Speichert…"}
          {saveState === "saved" && !dirty && `Gespeichert · ${formatDate(doc.updatedAt)}`}
          {saveState === "error" && "Speichern fehlgeschlagen"}
          {dirty && saveState !== "saving" && "Ungespeicherte Änderungen"}
          {!dirty && saveState === "idle" && documentTypeLabel[type]}
        </span>
      </div>

      <div className="field editor-customer-field">
        <span className="editor-customer-label">Kunde</span>
        <div className="editor-customer-row">
          <CustomerPicker
            value={customerId}
            onChange={(next) => {
              setCustomerId(next);
              setSaveState("idle");
            }}
            allowEmpty
            emptyLabel="Ohne Kunde"
            placeholder="Kunde zuordnen…"
          />
          <div className="editor-customer-actions">
            <button
              type="button"
              className="btn btn-primary btn-icon"
              disabled={!dirty || saveState === "saving"}
              aria-label={saveState === "saving" ? "Speichert…" : "Speichern"}
              title={saveState === "saving" ? "Speichert…" : "Speichern"}
              onClick={() => void save()}
            >
              <IconSave />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              disabled={pdfBusy || dirty}
              aria-label={pdfBusy ? "PDF wird erstellt…" : "Als PDF exportieren"}
              title={dirty ? "Zuerst speichern" : pdfBusy ? "PDF wird erstellt…" : "Als PDF exportieren"}
              onClick={() => {
                setPdfBusy(true);
                void api
                  .exportDocumentPdf(id, title)
                  .catch((err) =>
                    setError(err instanceof Error ? err.message : "PDF-Export fehlgeschlagen"),
                  )
                  .finally(() => setPdfBusy(false));
              }}
            >
              <IconPdf />
            </button>
            <button
              type="button"
              className="btn btn-danger btn-icon"
              aria-label="Löschen"
              title="Löschen"
              onClick={() => setDeleteOpen(true)}
            >
              <IconTrash />
            </button>
          </div>
        </div>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <DocumentEditor
        content={content}
        onChange={(next) => {
          setContent(next);
          setSaveState("idle");
        }}
        customerId={customerId || undefined}
        documentId={doc.id}
      />

      {customerId ? (
        <section className="section doc-attachments">
          <AttachmentPanel customerId={customerId} documentId={doc.id} />
        </section>
      ) : (
        <p className="muted editor-attach-hint">
          Anhänge und Bild-Upload sind verfügbar, sobald ein Kunde zugeordnet ist.
        </p>
      )}

      <Modal
        open={deleteOpen}
        title="Seite löschen?"
        onClose={() => {
          if (!deleteBusy) setDeleteOpen(false);
        }}
        showCloseButton={!deleteBusy}
        className="modal-confirm"
      >
        <div className="confirm-dialog">
          <div className="confirm-dialog-icon" aria-hidden>
            <IconTrash />
          </div>
          <p className="confirm-dialog-lead">
            Die Wiki-Seite <strong>{title || "Ohne Titel"}</strong> wird unwiderruflich gelöscht.
          </p>
          <p className="muted confirm-dialog-hint">
            Anhänge an dieser Seite und der Inhalt gehen verloren. Diese Aktion kann nicht rückgängig
            gemacht werden.
          </p>
          <div className="form-actions modal-actions">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={deleteBusy}
              onClick={() => setDeleteOpen(false)}
            >
              Abbrechen
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={deleteBusy}
              onClick={() => void confirmDelete()}
            >
              <IconTrash />
              {deleteBusy ? "Löscht…" : "Endgültig löschen"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function iconProps() {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    "aria-hidden": true as const,
    className: "btn-icon-svg",
  };
}

function IconSave() {
  return (
    <svg {...iconProps()}>
      <path
        d="M7 3V6.4C7 6.96005 7 7.24008 7.10899 7.45399C7.20487 7.64215 7.35785 7.79513 7.54601 7.89101C7.75992 8 8.03995 8 8.6 8H15.4C15.9601 8 16.2401 8 16.454 7.89101C16.6422 7.79513 16.7951 7.64215 16.891 7.45399C17 7.24008 17 6.96005 17 6.4V4M17 21V14.6C17 14.0399 17 13.7599 16.891 13.546C16.7951 13.3578 16.6422 13.2049 16.454 13.109C16.2401 13 15.9601 13 15.4 13H8.6C8.03995 13 7.75992 13 7.54601 13.109C7.35785 13.2049 7.20487 13.3578 7.10899 13.546C7 13.7599 7 14.0399 7 14.6V21M21 9.32548V16.2C21 17.8802 21 18.7202 20.673 19.362C20.3854 19.9265 19.9265 20.3854 19.362 20.673C18.7202 21 17.8802 21 16.2 21H7.8C6.11984 21 5.27976 21 4.63803 20.673C4.07354 20.3854 3.6146 19.9265 3.32698 19.362C3 18.7202 3 17.8802 3 16.2V7.8C3 6.11984 3 5.27976 3.32698 4.63803C3.6146 4.07354 4.07354 3.6146 4.63803 3.32698C5.27976 3 6.11984 3 7.8 3H14.6745C15.1637 3 15.4083 3 15.6385 3.05526C15.8425 3.10425 16.0376 3.18506 16.2166 3.29472C16.4184 3.4184 16.5914 3.59135 16.9373 3.93726L20.0627 7.06274C20.4086 7.40865 20.5816 7.5816 20.7053 7.78343C20.8149 7.96237 20.8957 8.15746 20.9447 8.36154C21 8.59171 21 8.8363 21 9.32548Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconPdf() {
  return (
    <svg {...iconProps()}>
      <path
        d="M21 15V16.2C21 17.8802 21 18.7202 20.673 19.362C20.3854 19.9265 19.9265 20.3854 19.362 20.673C18.7202 21 17.8802 21 16.2 21H7.8C6.11984 21 5.27976 21 4.63803 20.673C4.07354 20.3854 3.6146 19.9265 3.32698 19.362C3 18.7202 3 17.8802 3 16.2V15M17 10L12 15M12 15L7 10M12 15V3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg {...iconProps()}>
      <path
        d="M16 6V5.2C16 4.0799 16 3.51984 15.782 3.09202C15.5903 2.71569 15.2843 2.40973 14.908 2.21799C14.4802 2 13.9201 2 12.8 2H11.2C10.0799 2 9.51984 2 9.09202 2.21799C8.71569 2.40973 8.40973 2.71569 8.21799 3.09202C8 3.51984 8 4.0799 8 5.2V6M10 11.5V16.5M14 11.5V16.5M3 6H21M19 6V17.2C19 18.8802 19 19.7202 18.673 20.362C18.3854 20.9265 17.9265 21.3854 17.362 21.673C16.7202 22 15.8802 22 14.2 22H9.8C8.11984 22 7.27976 22 6.63803 21.673C6.07354 21.3854 5.6146 20.9265 5.32698 20.362C5 19.7202 5 18.8802 5 17.2V6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
