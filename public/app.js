/**
 * SystemFlow – lokale Flow-Verwaltung im Browser (localStorage).
 * @module app
 */

const STORAGE_KEY = "systemflow.flows.v1";

/** @typedef {"running"|"healthy"|"degraded"|"stopped"} FlowStatus */

/**
 * @typedef {object} Flow
 * @property {string} id
 * @property {string} name
 * @property {FlowStatus} status
 * @property {string} createdAt ISO-Zeitstempel
 */

const form = document.getElementById("flow-form");
const nameInput = /** @type {HTMLInputElement} */ (document.getElementById("flow-name"));
const statusSelect = /** @type {HTMLSelectElement} */ (document.getElementById("flow-status"));
const listEl = document.getElementById("flow-list");
const emptyEl = document.getElementById("empty-state");
const demoBtn = document.getElementById("btn-demo");

/**
 * Lädt Flows aus localStorage.
 * @returns {Flow[]}
 */
function loadFlows() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Speichert Flows in localStorage.
 * @param {Flow[]} flows
 */
function saveFlows(flows) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(flows));
}

/**
 * Erzeugt eine kurze ID.
 * @returns {string}
 */
function createId() {
  return `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Formatiert einen ISO-Zeitstempel für die Anzeige.
 * @param {string} iso
 * @returns {string}
 */
function formatTime(iso) {
  try {
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/**
 * Rendert die Flow-Liste.
 * @param {Flow[]} flows
 */
function render(flows) {
  if (!listEl || !emptyEl) return;

  listEl.replaceChildren();
  emptyEl.classList.toggle("is-hidden", flows.length > 0);

  for (const flow of flows) {
    const li = document.createElement("li");
    li.className = "flow-item";
    li.dataset.id = flow.id;

    const meta = document.createElement("div");
    meta.className = "flow-meta";

    const title = document.createElement("strong");
    title.textContent = flow.name;

    const time = document.createElement("time");
    time.dateTime = flow.createdAt;
    time.textContent = formatTime(flow.createdAt);

    meta.append(title, time);

    const status = document.createElement("span");
    status.className = `status status-${flow.status}`;
    status.textContent = flow.status;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "icon-btn";
    remove.setAttribute("aria-label", `${flow.name} entfernen`);
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      const next = loadFlows().filter((f) => f.id !== flow.id);
      saveFlows(next);
      render(next);
    });

    li.append(meta, status, remove);
    listEl.append(li);
  }
}

/**
 * Demo-Daten für einen schnellen Start.
 * @returns {Flow[]}
 */
function demoFlows() {
  const now = Date.now();
  return [
    {
      id: createId(),
      name: "API Gateway Health",
      status: "healthy",
      createdAt: new Date(now - 3600_000).toISOString(),
    },
    {
      id: createId(),
      name: "Nightly Backup",
      status: "running",
      createdAt: new Date(now - 1800_000).toISOString(),
    },
    {
      id: createId(),
      name: "Queue Worker",
      status: "degraded",
      createdAt: new Date(now - 600_000).toISOString(),
    },
  ];
}

form?.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name) return;

  /** @type {Flow} */
  const flow = {
    id: createId(),
    name,
    status: /** @type {FlowStatus} */ (statusSelect.value),
    createdAt: new Date().toISOString(),
  };

  const next = [flow, ...loadFlows()];
  saveFlows(next);
  render(next);
  form.reset();
  statusSelect.value = "running";
  nameInput.focus();
});

demoBtn?.addEventListener("click", () => {
  const next = demoFlows();
  saveFlows(next);
  render(next);
  document.getElementById("flows")?.scrollIntoView({ behavior: "smooth" });
});

render(loadFlows());
