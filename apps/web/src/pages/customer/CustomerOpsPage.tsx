import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../api";
import { CustomerSlaPanel } from "../../components/CustomerSlaPanel";
import { Modal } from "../../components/Modal";
import {
  activityKindMeta,
  detectActivityKind,
  groupActivitiesByDay,
  polishActivityText,
  type ActivityKind,
} from "../../lib/activity";
import { formatDate } from "../../lib/labels";
import type { Activity } from "../../types";

function ActivityIcon({ kind }: { kind: ActivityKind }) {
  const props = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    "aria-hidden": true as const,
  };
  const icons: Record<ActivityKind, ReactNode> = {
    time: (
      <svg {...props}>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v4l2.5 1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    wiki: (
      <svg {...props}>
        <path d="M6 4h9l3 3v13H6z" strokeLinejoin="round" />
        <path d="M15 4v3h3M9 12h6M9 16h4" strokeLinecap="round" />
      </svg>
    ),
    appointment: (
      <svg {...props}>
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M8 3v4M16 3v4M4 10h16" strokeLinecap="round" />
      </svg>
    ),
    project: (
      <svg {...props}>
        <path d="M4 8h16v11H4zM8 8V6a2 2 0 012-2h4a2 2 0 012 2v2" strokeLinejoin="round" />
      </svg>
    ),
    asset: (
      <svg {...props}>
        <rect x="3" y="5" width="18" height="12" rx="2" />
        <path d="M8 21h8M12 17v4" strokeLinecap="round" />
      </svg>
    ),
    manual: (
      <svg {...props}>
        <path d="M12 4v10M8 10l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 18h14" strokeLinecap="round" />
      </svg>
    ),
  };
  return icons[kind];
}

function activityClock(value: string): string {
  try {
    return new Intl.DateTimeFormat("de-DE", { timeStyle: "short" }).format(new Date(value));
  } catch {
    return formatDate(value);
  }
}

/**
 * Betrieb: SLAs, Historie und Anhänge (Aufgaben liegen unter eigenem Tab).
 */
export function CustomerOpsPage() {
  const { id = "" } = useParams();
  const [activityList, setActivityList] = useState<Activity[]>([]);
  const [contractList, setContractList] = useState<Awaited<ReturnType<typeof api.contracts>>>([]);
  const [activityForm, setActivityForm] = useState({ title: "", description: "" });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyError, setHistoryError] = useState("");

  async function reload() {
    const [h, contracts] = await Promise.all([api.activities(id), api.contracts(id)]);
    setActivityList(h);
    setContractList(contracts);
  }

  useEffect(() => {
    void reload();
  }, [id]);

  const historyDays = useMemo(() => groupActivitiesByDay(activityList), [activityList]);

  function openHistoryModal() {
    setActivityForm({ title: "", description: "" });
    setHistoryError("");
    setHistoryOpen(true);
  }

  async function createActivity(e: FormEvent) {
    e.preventDefault();
    setHistoryError("");
    try {
      await api.createActivity(id, activityForm);
      setActivityForm({ title: "", description: "" });
      setHistoryOpen(false);
      await reload();
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    }
  }

  return (
    <>
      <CustomerSlaPanel customerId={id} contracts={contractList} onChanged={reload} />

      <section className="section history-section">
        <div className="history-hero panel">
          <div className="history-hero-top">
            <div>
              <p className="eyebrow">Protokoll</p>
              <h2>Einsatz-Historie</h2>
              <p className="muted">
                {activityList.length} Einträg{activityList.length === 1 ? "" : "e"} · manuell und
                automatisch bei Wiki, Projekten und Zeiten
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-icon-lg"
              onClick={openHistoryModal}
              aria-label="Manuellen Einsatz eintragen"
              title="Einsatz eintragen"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {historyDays.length === 0 ? (
          <div className="history-empty panel">
            <div className="history-empty-icon" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                <path d="M12 4v10M8 10l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5 18h14" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <strong>Noch keine Historie</strong>
              <p className="muted">Automatische Einträge entstehen bei Zeiten, Wiki und Projekten.</p>
            </div>
            <button type="button" className="btn btn-primary" onClick={openHistoryModal}>
              Einsatz eintragen
            </button>
          </div>
        ) : (
          <div className="history-feed">
            {historyDays.map((day) => (
              <section key={day.dayKey} className="history-day">
                <div className="history-day-head">
                  <h3 className="history-day-label">{day.label}</h3>
                  <span>{day.items.length}</span>
                </div>
                <ol className="timeline">
                  {day.items.map((item) => {
                    const kind = detectActivityKind(item.title);
                    const meta = activityKindMeta(kind);
                    return (
                      <li key={item.id} className={`timeline-item ${meta.className}`}>
                        <div className={`timeline-marker ${meta.className}`} aria-hidden>
                          <ActivityIcon kind={kind} />
                        </div>
                        <article className={`timeline-body ${meta.className}`}>
                          <div className="timeline-card-head">
                            <div className="timeline-card-main">
                              <span className={`timeline-kind ${meta.className}`}>{meta.label}</span>
                              <strong>{polishActivityText(item.title)}</strong>
                              {item.description ? (
                                <p className="timeline-desc">
                                  {polishActivityText(item.description)}
                                </p>
                              ) : null}
                            </div>
                            <div className="timeline-card-side">
                              <time className="timeline-time" dateTime={item.occurredAt}>
                                {activityClock(item.occurredAt)}
                              </time>
                              <button
                                type="button"
                                className="btn btn-ghost btn-icon"
                                aria-label="Eintrag entfernen"
                                onClick={() => {
                                  if (confirm("Historie-Eintrag entfernen?")) {
                                    void api.deleteActivity(item.id).then(() => reload());
                                  }
                                }}
                              >
                                <svg
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  aria-hidden
                                >
                                  <path
                                    d="M5 7h14M10 7V5h4v2M8 7l.8 12h6.4L16 7"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              </button>
                            </div>
                          </div>
                        </article>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
        )}
      </section>

      <Modal
        open={historyOpen}
        title="Einsatz eintragen"
        onClose={() => setHistoryOpen(false)}
      >
        <form className="form-grid" onSubmit={createActivity}>
          <label className="field full">
            <span>Titel *</span>
            <input
              required
              value={activityForm.title}
              onChange={(e) => setActivityForm({ ...activityForm, title: e.target.value })}
              placeholder="z. B. Vor-Ort-Termin / Abstimmung"
            />
          </label>
          <label className="field full">
            <span>Kurzbeschreibung</span>
            <textarea
              rows={3}
              value={activityForm.description}
              onChange={(e) => setActivityForm({ ...activityForm, description: e.target.value })}
              placeholder="Optional: Ergebnis, Teilnehmer, nächste Schritte…"
            />
          </label>
          {historyError ? <p className="form-error full">{historyError}</p> : null}
          <div className="full form-actions modal-actions">
            <button className="btn btn-primary" type="submit">
              Speichern
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setHistoryOpen(false)}>
              Abbrechen
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
