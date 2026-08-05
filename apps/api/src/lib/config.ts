import { createHash, randomBytes } from "node:crypto";

function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

/**
 * Lädt Laufzeitkonfiguration aus Umgebungsvariablen.
 */
export function loadConfig() {
  const sessionSecret =
    process.env.SESSION_SECRET ??
    createHash("sha256").update(randomBytes(32)).digest("hex");

  return {
    port: Number(process.env.PORT ?? "3000"),
    host: process.env.HOST ?? "0.0.0.0",
    databasePath: process.env.DATABASE_PATH ?? "./data/systemhaus.sqlite",
    sessionSecret,
    adminUsername: process.env.ADMIN_USERNAME ?? "admin",
    adminPassword: process.env.ADMIN_PASSWORD ?? "changeme",
    corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
    isProd: process.env.NODE_ENV === "production",
    webDist: process.env.WEB_DIST ?? "",
  };
}

export type AppConfig = ReturnType<typeof loadConfig>;
