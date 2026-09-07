import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { AuthProvider } from "./auth";
import "./styles.css";

/**
 * PWA: nach Deploy neue Assets laden und die Seite einmal neu laden,
 * sonst bleibt oft die alte Shell (z. B. veraltete Reiter-Texte) im Cache.
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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
