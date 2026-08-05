import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import secureSession from "@fastify/secure-session";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createDb } from "./db/index.js";
import { loadConfig } from "./lib/config.js";
import { ensureAdmin } from "./lib/seed.js";
import { activityRoutes } from "./routes/activities.js";
import { appointmentRoutes } from "./routes/appointments.js";
import { assetRoutes } from "./routes/assets.js";
import { attachmentRoutes } from "./routes/attachments.js";
import { authRoutes } from "./routes/auth.js";
import { contractRoutes } from "./routes/contracts.js";
import { customerRoutes } from "./routes/customers.js";
import { documentRoutes } from "./routes/documents.js";
import { exportRoutes } from "./routes/export.js";
import { pricingRoutes } from "./routes/pricing.js";
import { projectRoutes } from "./routes/projects.js";
import { reminderRoutes } from "./routes/reminders.js";
import { searchRoutes } from "./routes/search.js";
import { taskRoutes } from "./routes/tasks.js";
import { templateRoutes } from "./routes/templates.js";
import { timeEntryRoutes } from "./routes/timeEntries.js";
import { vaultRoutes } from "./routes/vault.js";

/**
 * Startet die Systemhaus-Ess API und liefert optional das Frontend aus.
 */
async function main() {
  const config = loadConfig();
  mkdirSync(config.uploadDir, { recursive: true });
  const db = await createDb(config.databasePath);
  await ensureAdmin(db, config.adminUsername, config.adminPassword);

  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: config.isProd ? false : config.corsOrigin,
    credentials: true,
  });

  await app.register(cookie);
  await app.register(multipart, {
    limits: { fileSize: 25 * 1024 * 1024 },
  });

  // 32-Byte-Key stabil aus SESSION_SECRET ableiten
  const secretBuffer = createHash("sha256").update(config.sessionSecret).digest();
  await app.register(secureSession, {
    cookieName: "systemhaus_session",
    key: secretBuffer,
    cookie: {
      path: "/",
      httpOnly: true,
      // HTTP-Deploy: secure=false, sonst verwirft der Browser das Cookie
      secure: config.cookieSecure,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
    },
  });

  await authRoutes(app, db);
  await app.register(async (scoped) => customerRoutes(scoped, db));
  await app.register(async (scoped) => documentRoutes(scoped, db));
  await app.register(async (scoped) => projectRoutes(scoped, db));
  await app.register(async (scoped) => timeEntryRoutes(scoped, db));
  await app.register(async (scoped) => assetRoutes(scoped, db));
  await app.register(async (scoped) => activityRoutes(scoped, db));
  await app.register(async (scoped) => taskRoutes(scoped, db));
  await app.register(async (scoped) => appointmentRoutes(scoped, db));
  await app.register(async (scoped) => vaultRoutes(scoped, db));
  await app.register(async (scoped) => pricingRoutes(scoped, db));
  await app.register(async (scoped) => contractRoutes(scoped, db));
  await app.register(async (scoped) => reminderRoutes(scoped, db));
  await app.register(async (scoped) => searchRoutes(scoped, db));
  await app.register(async (scoped) => templateRoutes(scoped));
  await app.register(async (scoped) => attachmentRoutes(scoped, db, config.uploadDir));
  await app.register(async (scoped) => exportRoutes(scoped, db, config.uploadDir));

  app.get("/api/health", async () => ({ ok: true, service: "systemhaus-ess" }));

  const webDist = config.webDist || resolve(process.cwd(), "../web/dist");
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, {
      root: webDist,
      wildcard: false,
    });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/")) {
        return reply.code(404).send({ error: "Not found" });
      }
      return reply.sendFile("index.html");
    });
  }

  await app.listen({ port: config.port, host: config.host });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
