import type { Db } from "../db/index.js";
import { todayIso } from "./dates.js";
import { archiveDueMonitoringMonthReports } from "./monitoring-month-report-store.js";
import { evaluateOfflineAgents, pruneMonitoringSamples } from "./monitoring.js";

const LOOP_MS = 30_000;
const PRUNE_EVERY_MS = 60 * 60 * 1000;

/**
 * Prüft im API-Prozess regelmäßig Offline-Geräte und räumt alte Samples weg.
 * Speichert Monitoring-Monatsreports einmal pro Kalendertag.
 */
export function startMonitoringLoop(db: Db, uploadDir: string): void {
  let lastPrune = 0;
  let lastArchiveDay = "";
  const tick = async () => {
    try {
      await evaluateOfflineAgents(db);
      const now = Date.now();
      if (now - lastPrune >= PRUNE_EVERY_MS) {
        await pruneMonitoringSamples(db);
        lastPrune = now;
      }
      const day = todayIso();
      if (day !== lastArchiveDay) {
        await archiveDueMonitoringMonthReports(db, uploadDir);
        lastArchiveDay = day;
      }
    } catch (err) {
      console.error("Monitoring-Loop:", err);
    }
  };
  void tick();
  setInterval(() => void tick(), LOOP_MS);
}
