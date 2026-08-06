import archiver from "archiver";
import type { FastifyInstance } from "fastify";
import { createClient } from "@libsql/client";
import {
  copyFileSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { PassThrough, pipeline } from "node:stream";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { Extract } from "unzipper";
import { requireAuth } from "../plugins/auth.js";

const pipe = promisify(pipeline);

const MANIFEST_NAME = "manifest.json";
const DB_ENTRY = "systemhaus.sqlite";
const UPLOADS_PREFIX = "uploads/";

type BackupManifest = {
  format: "systemhaus-ess-backup";
  version: 1;
  createdAt: string;
  app: string;
  includes: string[];
  note: string;
};

/**
 * Erzeugt eine konsistente SQLite-Kopie per VACUUM INTO (inkl. WAL-Checkpoint).
 */
async function snapshotDatabase(databasePath: string, destPath: string) {
  const absolute = resolve(databasePath);
  mkdirSync(dirname(destPath), { recursive: true });
  if (existsSync(destPath)) rmSync(destPath);

  const client = createClient({ url: pathToFileURL(absolute).href });
  try {
    await client.execute("PRAGMA wal_checkpoint(FULL)");
    const destSql = destPath.replace(/\\/g, "/").replace(/'/g, "''");
    await client.execute(`VACUUM INTO '${destSql}'`);
  } finally {
    client.close();
  }
}

function listUploadFiles(uploadDir: string): string[] {
  if (!existsSync(uploadDir)) return [];
  const out: string[] = [];
  const walk = (dir: string, rel = "") => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const childRel = rel ? `${rel}/${name}` : name;
      if (statSync(full).isDirectory()) walk(full, childRel);
      else out.push(childRel);
    }
  };
  walk(uploadDir);
  return out;
}

function copyTree(from: string, to: string) {
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from)) {
    const src = join(from, name);
    const dest = join(to, name);
    if (statSync(src).isDirectory()) copyTree(src, dest);
    else copyFileSync(src, dest);
  }
}

/**
 * Registriert System-Backup Download und Restore (ZIP: SQLite + Uploads).
 */
export async function backupRoutes(
  app: FastifyInstance,
  databasePath: string,
  uploadDir: string,
) {
  app.addHook("preHandler", requireAuth);

  /** Vollbackup als ZIP herunterladen. */
  app.get("/api/admin/backup", async (request, reply) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `systemhaus-backup_${stamp}.zip`;
    const workDir = join(tmpdir(), `systemhaus-backup-${process.pid}-${Date.now()}`);
    mkdirSync(workDir, { recursive: true });
    const snapPath = join(workDir, DB_ENTRY);

    try {
      await snapshotDatabase(databasePath, snapPath);
    } catch (err) {
      request.log.error(err);
      rmSync(workDir, { recursive: true, force: true });
      return reply.code(500).send({ error: "Datenbank-Snapshot fehlgeschlagen" });
    }

    const manifest: BackupManifest = {
      format: "systemhaus-ess-backup",
      version: 1,
      createdAt: new Date().toISOString(),
      app: "Systemhaus-Ess",
      includes: [DB_ENTRY, "uploads/", "RESTORE.md"],
      note: "Wiederherstellung nur über Konto → Sicherung (Import) oder manuell laut RESTORE.md.",
    };

    const restoreHint = [
      "# Systemhaus-Ess – Sicherung wiederherstellen",
      "",
      "## Empfohlen (Browser)",
      "1. In der App unter **Konto → Sicherung** die ZIP-Datei hochladen.",
      "2. Bestätigen – der Dienst startet neu und lädt die Sicherung.",
      "",
      "## Manuell (Server)",
      "1. Dienst/Container stoppen.",
      "2. `systemhaus.sqlite` nach `DATABASE_PATH` kopieren (bestehende Datei ersetzen).",
      "3. Inhalt von `uploads/` nach `UPLOAD_DIR` kopieren.",
      "4. Dienst/Container starten.",
      "",
      "Achtung: Ein Restore ersetzt die aktuelle Datenbank und alle Uploads.",
      "Der Passworttresor bleibt in der DB – die Tresor-Passphrase musst du weiterhin kennen.",
      "",
    ].join("\n");

    const pass = new PassThrough();
    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", (err) => {
      request.log.error(err);
      rmSync(workDir, { recursive: true, force: true });
      if (!reply.sent) reply.code(500).send({ error: "Backup fehlgeschlagen" });
    });
    archive.on("end", () => {
      rmSync(workDir, { recursive: true, force: true });
    });
    archive.pipe(pass);

    reply
      .header("Content-Type", "application/zip")
      .header("Content-Disposition", `attachment; filename="${filename}"`)
      .send(pass);

    archive.append(JSON.stringify(manifest, null, 2), { name: MANIFEST_NAME });
    archive.append(restoreHint, { name: "RESTORE.md" });
    archive.file(snapPath, { name: DB_ENTRY });

    for (const rel of listUploadFiles(uploadDir)) {
      archive.file(join(uploadDir, rel), { name: `${UPLOADS_PREFIX}${rel}` });
    }

    await archive.finalize();
  });

  /** Meta-Infos zur Sicherung. */
  app.get("/api/admin/backup/info", async () => {
    const dbAbs = resolve(databasePath);
    let dbSize = 0;
    if (existsSync(dbAbs)) dbSize = statSync(dbAbs).size;
    return {
      databasePath: dbAbs,
      uploadDir: resolve(uploadDir),
      databaseBytes: dbSize,
      uploadFiles: listUploadFiles(uploadDir).length,
      format: "systemhaus-ess-backup",
      version: 1,
      hint: "Download erzeugt eine ZIP mit SQLite und Uploads. Import ersetzt alle Daten und startet den Dienst neu.",
    };
  });

  /** Backup-ZIP hochladen und einspielen (ersetzt Daten, startet Prozess neu). */
  app.post("/api/admin/backup/restore", async (request, reply) => {
    const file = await request.file();
    if (!file) return reply.code(400).send({ error: "Keine Datei hochgeladen" });

    const workDir = join(tmpdir(), `systemhaus-restore-${process.pid}-${Date.now()}`);
    const zipPath = join(workDir, "incoming.zip");
    const extractDir = join(workDir, "extracted");
    mkdirSync(extractDir, { recursive: true });

    try {
      await pipe(file.file, createWriteStream(zipPath));
      await pipe(createReadStream(zipPath), Extract({ path: extractDir }));

      const manifestPath = join(extractDir, MANIFEST_NAME);
      const dbRestored = join(extractDir, DB_ENTRY);
      if (!existsSync(dbRestored)) {
        return reply.code(400).send({
          error: "Ungültiges Backup: systemhaus.sqlite fehlt in der ZIP",
        });
      }

      if (existsSync(manifestPath)) {
        try {
          const raw = JSON.parse(readFileSync(manifestPath, "utf8")) as BackupManifest;
          if (raw.format !== "systemhaus-ess-backup") {
            return reply.code(400).send({ error: "Unbekanntes Backup-Format" });
          }
        } catch {
          return reply.code(400).send({ error: "manifest.json ungültig" });
        }
      }

      const dbAbs = resolve(databasePath);
      const uploadAbs = resolve(uploadDir);
      mkdirSync(dirname(dbAbs), { recursive: true });

      const safetyDir = join(dirname(dbAbs), `.pre-restore-${Date.now()}`);
      mkdirSync(safetyDir, { recursive: true });
      if (existsSync(dbAbs)) {
        renameSync(dbAbs, join(safetyDir, basename(dbAbs)));
      }
      for (const side of [`${dbAbs}-wal`, `${dbAbs}-shm`]) {
        if (existsSync(side)) renameSync(side, join(safetyDir, basename(side)));
      }

      if (existsSync(uploadAbs)) {
        renameSync(uploadAbs, join(safetyDir, "uploads"));
      }
      mkdirSync(uploadAbs, { recursive: true });

      copyFileSync(dbRestored, dbAbs);

      const uploadsSrc = join(extractDir, "uploads");
      if (existsSync(uploadsSrc)) {
        copyTree(uploadsSrc, uploadAbs);
      }

      writeFileSync(
        join(dirname(dbAbs), "LAST_RESTORE.txt"),
        `Restored at ${new Date().toISOString()}\nSafety copy: ${safetyDir}\n`,
      );

      setTimeout(() => {
        request.log.info("Backup-Restore abgeschlossen – Prozess wird neu gestartet");
        process.exit(0);
      }, 800);

      return reply.send({
        ok: true,
        restarting: true,
        message:
          "Sicherung eingespielt. Der Dienst startet neu. Bitte die Seite in wenigen Sekunden neu laden.",
        safetyCopy: safetyDir,
      });
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({
        error: err instanceof Error ? err.message : "Restore fehlgeschlagen",
      });
    } finally {
      setTimeout(() => {
        try {
          rmSync(workDir, { recursive: true, force: true });
        } catch {
          /* ignore */
        }
      }, 5000);
    }
  });
}
