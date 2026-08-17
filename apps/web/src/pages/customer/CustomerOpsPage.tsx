import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../api";
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
    strokeWidth: 1.85,
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
    email: (
      <svg {...props}>
        <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
        <path d="M4 7l8 6 8-6" strokeLinecap="round" strokeLinejoin="round" />
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

const kindFilters: { id: "all" | ActivityKind; label: string }[] = [
  { id: "all", label: "Alle" },
  { id: "time", label: "Zeit" },
  { id: "wiki", label: "Wiki" },
  { id: "appointment", label: "Termin" },
  { id: "project", label: "Projekt" },
  { id: "email", label: "E-Mail" },
  { id: "manual", label: "Einsatz" },
];

/**
 * Protokoll: Einsatz-Historie (Verträge/SLA unter Dokumente, Aufgaben eigener Tab).
 */
export function CustomerOpsPage() {
  const { id = "" } = useParams();
  const [activityList, setActivityList] = useState<Activity[]>([]);
  const [activityForm, setActivityForm] = useState({ title: "", description: "" });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | ActivityKind>("all");

  async function reload() {
    setActivityList(await api.activities(id));
  }

  useEffect(() => {
    void reload();
  }, [id]);

  const kindCounts = useMemo(() => {
    const map: Record<ActivityKind, number> = {
      time: 0,
      wiki: 0,
      appointment: 0,
      project: 0,
      asset: 0,
      email: 0,
      manual: 0,
    };
    for (const item of activityList) {
      map[detectActivityKind(item.title)] += 1;
    }
    return map;
  }, [activityList]);

  const filtered = useMemo(() => {
    if (kindFilter === "all") return activityList;
    return activityList.filter((item) => detectActivityKind(item.title) === kindFilter);
  }, [activityList, kindFilter]);

  const historyDays = useMemo(() => groupActivitiesByDay(filtered), [filtered]);

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

  async function removeActivity(item: Activity) {
    if (!confirm("Historie-Eintrag entfernen?")) return;
    await api.deleteActivity(item.id);
    await reload();
  }

  return (
    <>
      <section className="section history-section">
        <div className="history-hero panel">
          <div className="history-hero-top">
            <div>
              <p className="eyebrow">Protokoll</p>
              <h2>Einsatz-Historie</h2>
              <p className="muted">
                {activityList.length} Einträg{activityList.length === 1 ? "" : "e"} · automatisch und
                manuell
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={openHistoryModal}
              title="Einsatz eintragen"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
              Eintrag
            </button>
          </div>

          {activityList.length > 0 ? (
            <div className="history-filters" role="tablist" aria-label="Nach Art filtern">
              {kindFilters.map((tab) => {
                const count = tab.id === "all" ? activityList.length : kindCounts[tab.id];
                if (tab.id !== "all" && count === 0) return null;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={kindFilter === tab.id}
                    className={`history-filter${kindFilter === tab.id ? " is-active" : ""}${
                      tab.id !== "all" ? ` ${activityKindMeta(tab.id).className}` : ""
                    }`}
                    onClick={() => setKindFilter(tab.id)}
                  >
                    {tab.id !== "all" ? (
                      <span className="history-filter-icon" aria-hidden>
                        <ActivityIcon kind={tab.id} />
                      </span>
                    ) : null}
                    <span>{tab.label}</span>
                    <em>{count}</em>
                  </button>
                );
              })}
            </div>
          ) : null}
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
              <strong>
                {activityList.length === 0 ? "Noch keine Historie" : "Keine Treffer"}
              </strong>
              <p className="muted">
                {activityList.length === 0
                  ? "Automatische Einträge entstehen bei Zeiten, Wiki und Projekten."
                  : "Für diesen Filter gibt es keine Einträge."}
              </p>
            </div>
            {activityList.length === 0 ? (
              <button type="button" className="btn btn-primary" onClick={openHistoryModal}>
                Einsatz eintragen
              </button>
            ) : (
              <button type="button" className="btn btn-ghost" onClick={() => setKindFilter("all")}>
                Filter zurücksetzen
              </button>
            )}
          </div>
        ) : (
          <div className="history-feed panel">
            {historyDays.map((day) => (
              <section key={day.dayKey} className="history-day">
                <div className="history-day-head">
                  <h3 className="history-day-label">{day.label}</h3>
                  <span className="history-day-count">{day.items.length}</span>
                  <i className="history-day-rule" aria-hidden />
                </div>
                <ol className="timeline">
                  {day.items.map((item) => {
                    const kind = detectActivityKind(item.title);
                    const meta = activityKindMeta(kind);
                    const title = polishActivityText(item.title);
                    const desc = item.description ? polishActivityText(item.description) : "";
                    return (
                      <li key={item.id} className={`timeline-item ${meta.className}`}>
                        <div className={`timeline-marker ${meta.className}`} aria-hidden>
                          <ActivityIcon kind={kind} />
                        </div>
                        <article className={`timeline-body ${meta.className}`}>
                          <div className="timeline-row">
                            <div className="timeline-main">
                              <div className="timeline-topline">
                                <span className={`timeline-kind ${meta.className}`}>{meta.label}</span>
                                <time className="timeline-time" dateTime={item.occurredAt}>
                                  {activityClock(item.occurredAt)}
                                </time>
                              </div>
                              <strong className="timeline-title">{title}</strong>
                              {desc ? <p className="timeline-desc">{desc}</p> : null}
                            </div>
                            <button
                              type="button"
                              className="btn btn-ghost btn-icon timeline-delete"
                              aria-label="Eintrag entfernen"
                              title="Entfernen"
                              onClick={() => void removeActivity(item)}
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

      <Modal open={historyOpen} title="Einsatz eintragen" onClose={() => setHistoryOpen(false)}>
        <form className="form-grid" onSubmit={createActivity}>
          <label className="field full">
            <span>Titel *</span>
            <input
              required
              value={activityForm.title}
              onChange={(e) => setActivityForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="z. B. Vor-Ort-Termin / Abstimmung"
            />
          </label>
          <label className="field full">
            <span>Kurzbeschreibung</span>
            <textarea
              rows={3}
              value={activityForm.description}
              onChange={(e) => setActivityForm((f) => ({ ...f, description: e.target.value }))}
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
