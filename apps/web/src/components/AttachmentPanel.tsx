import { useEffect, useState } from "react";
import { api } from "../api";
import { formatDate } from "../lib/labels";
import type { AttachmentItem } from "../types";

interface Props {
  customerId: string;
  documentId?: string;
  assetId?: string;
}

/**
 * Upload und Liste von Dateianhängen.
 */
export function AttachmentPanel({ customerId, documentId, assetId }: Props) {
  const [items, setItems] = useState<AttachmentItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function reload() {
    setItems(await api.attachments(customerId, { documentId, assetId }));
  }

  useEffect(() => {
    void reload();
  }, [customerId, documentId, assetId]);

  async function onUpload(fileList: FileList | null) {
    if (!fileList?.length) return;
    setBusy(true);
    setError("");
    try {
      for (const file of Array.from(fileList)) {
        await api.uploadAttachment(customerId, file, { documentId, assetId });
      }
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="attachment-panel">
      <label className="btn btn-ghost file-btn">
        {busy ? "Lädt hoch…" : "Datei hochladen"}
        <input
          type="file"
          multiple
          hidden
          disabled={busy}
          onChange={(e) => void onUpload(e.target.files)}
        />
      </label>
      {error ? <p className="form-error">{error}</p> : null}
      {items.length === 0 ? (
        <p className="empty">Keine Anhänge.</p>
      ) : (
        <ul className="list">
          {items.map((att) => (
            <li key={att.id} className="list-row">
              <div>
                <a href={`/api/attachments/${att.id}/download`} className="link-accent">
                  <strong>{att.originalName}</strong>
                </a>
                <span className="muted">
                  {(att.size / 1024).toFixed(0)} KB · {formatDate(att.createdAt)}
                </span>
              </div>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => void api.deleteAttachment(att.id).then(() => reload())}
              >
                Löschen
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
