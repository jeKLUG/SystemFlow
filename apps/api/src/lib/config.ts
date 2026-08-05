import { createHash, randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";

/**
 * Lädt Laufzeitkonfiguration aus Umgebungsvariablen.
 */
export function loadConfig() {
  const sessionSecret =
    process.env.SESSION_SECRET ??
    createHash("sha256").update(randomBytes(32)).digest("hex");

  const databasePath = process.env.DATABASE_PATH ?? "./data/systemhaus.sqlite";
  const isProd = process.env.NODE_ENV === "production";

  // Secure-Cookies nur bei HTTPS – sonst bleibt Login über HTTP nicht bestehen
  const cookieSecure =
    process.env.COOKIE_SECURE === "true" ||
    process.env.COOKIE_SECURE === "1";

  return {
    port: Number(process.env.PORT ?? "3000"),
    host: process.env.HOST ?? "0.0.0.0",
    databasePath,
    uploadDir: process.env.UPLOAD_DIR ?? resolve(dirname(resolve(databasePath)), "uploads"),
    sessionSecret,
    adminUsername: process.env.ADMIN_USERNAME ?? "admin",
    adminPassword: process.env.ADMIN_PASSWORD ?? "changeme",
    corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
    isProd,
    cookieSecure,
    webDist: process.env.WEB_DIST ?? "",
  };
}

export type AppConfig = ReturnType<typeof loadConfig>;
