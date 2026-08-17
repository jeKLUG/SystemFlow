import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Systemhaus-Ess",
        short_name: "Systemhaus",
        description: "Kontakte, Wiki, Kalender und Betrieb – auch offline lesbar",
        theme_color: "#080d16",
        background_color: "#080d16",
        display: "standalone",
        start_url: "/",
        lang: "de",
        icons: [
          {
            src: "/icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.pathname.startsWith("/api/customers") ||
              url.pathname.startsWith("/api/appointments") ||
              url.pathname === "/api/stats" ||
              url.pathname === "/api/tasks/open" ||
              url.pathname.startsWith("/api/reminders"),
            handler: "NetworkFirst",
            options: {
              cacheName: "systemhaus-api-read",
              networkTimeoutSeconds: 4,
              expiration: {
                maxEntries: 64,
                maxAgeSeconds: 60 * 60 * 24 * 7,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts",
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
