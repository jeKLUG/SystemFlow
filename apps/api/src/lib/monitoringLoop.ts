import type { Db } from "../db/index.js";
import { evaluateOfflineAgents, pruneMonitoringSamples } from "./monitoring.js";

const LOOP_MS = 30_000;
const PRUNE_EVERY_MS = 60 * 60 * 1000;

/**
 * Prüft im API-Prozess regelmäßig Offline-Geräte und räumt alte Samples weg.
 */
export function startMonitoringLoop(db: Db): void {
  let lastPrune = 0;
  const tick = async () => {
    try {
      await evaluateOfflineAgents(db);
      const now = Date.now();
      if (now - lastPrune >= PRUNE_EVERY_MS) {
        await pruneMonitoringSamples(db);
        lastPrune = now;
      }
    } catch (err) {
      console.error("Monitoring-Loop:", err);
    }
  };
  void tick();
  setInterval(() => void tick(), LOOP_MS);
}
