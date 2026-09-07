import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { AuthProvider } from "./auth";
import "./styles.css";

/** Bei Änderung: einmalig alte PWA-Caches verwerfen (löst steckenbleibende Shell nach Deploy). */
const CACHE_EPOCH = "2026-09-07-inventar-v2";
const CACHE_EPOCH_KEY = "sf-cache-epoch";

async function purgeStaleClientCaches(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    if (localStorage.getItem(CACHE_EPOCH_KEY) === CACHE_EPOCH) return false;
    localStorage.setItem(CACHE_EPOCH_KEY, CACHE_EPOCH);
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * PWA: nach Deploy neue Assets laden und die Seite einmal neu laden.
 */
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    window.setInterval(() => {
      void registration.update();
    }, 60_000);
  },
});

if ("serviceWorker" in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}

void purgeStaleClientCaches().then((purged) => {
  if (purged) {
    window.location.reload();
    return;
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </StrictMode>,
  );
});
