import { and, desc, eq, isNull, like } from "drizzle-orm";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Db } from "../db/index.js";
import { attachments, fileFolders, monitoringAgents } from "../db/schema.js";
import { isoInAppZone, previousMonthYm, todayIso, zonedLocalToUtcMs } from "./dates.js";
import { createId } from "./id.js";
import {
  buildMonitoringMonthReportPdf,
  loadMonitoringMonthReport,
  type MonitoringMonthReportInput,
} from "./monitoring-month-report-pdf.js";

/** Stammordner in der Kunden-Dateiablage für Monitoring-Monatsreports. */
export const MONITORING_REPORT_FOLDER_NAME = "Monitoring-Berichte";
export const MONITORING_REPORT_DESC_PREFIX = "monitoring-month:";

export type MonitoringMonthReportFile = {
  id: string;
  month: string;
  originalName: string;
  size: number;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Beschreibungsmarke `monitoring-month:YYYY-MM` an gespeicherten Report-PDFs.
 */
export function monitoringReportDescription(month: string): string {
  return `${MONITORING_REPORT_DESC_PREFIX}${month}`;
}

/**
 * Liest `YYYY-MM` aus der Report-Beschreibung, sonst null.
 */
export function monthFromMonitoringReportDescription(
  description: string | null | undefined,
): string | null {
  if (!description?.startsWith(MONITORING_REPORT_DESC_PREFIX)) return null;
  const month = description.slice(MONITORING_REPORT_DESC_PREFIX.length);
  return /^\d{4}-\d{2}$/.test(month) ? month : null;
}

/**
 * Gespeicherte Monitoring-Monatsreports eines Kunden, neueste zuerst.
 */
export async function listMonitoringMonthReports(
  db: Db,
  customerId: string,
): Promise<MonitoringMonthReportFile[]> {
  const rows = await db
    .select()
    .from(attachments)
    .where(
      and(
        eq(attachments.customerId, customerId),
        like(attachments.description, `${MONITORING_REPORT_DESC_PREFIX}%`),
      ),
    )
    .orderBy(desc(attachments.updatedAt))
    .all();

  const out: MonitoringMonthReportFile[] = [];
  for (const row of rows) {
    const month = monthFromMonitoringReportDescription(row.description);
    if (!month) continue;
    out.push({
      id: row.id,
      month,
      originalName: row.originalName,
      size: row.size,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
  return out.sort((a, b) => b.month.localeCompare(a.month));
}

/**
 * Schreibt das PDF in die Kundenakte (Ordner Monitoring-Berichte), ein File je Monat.
 * Erneutes Erzeugen ersetzt die Datei desselben Monats.
 */
export async function saveMonitoringMonthReportPdf(
  db: Db,
  uploadDir: string,
  report: MonitoringMonthReportInput,
  buffer: Buffer,
): Promise<MonitoringMonthReportFile> {
  await mkdir(uploadDir, { recursive: true });
  const customerId = report.customer.id;
  const month = report.month;
  const description = monitoringReportDescription(month);
  const originalName = reportOriginalName(report, month);
  const folderId = await ensureMonitoringReportFolder(db, customerId);
  const existing = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.customerId, customerId), eq(attachments.description, description)))
    .get();

  const now = new Date();
  const id = existing?.id ?? createId("att");
  const storedName = `${id}_${safeFilename(originalName)}`;
  await writeFile(join(uploadDir, storedName), buffer);

  if (existing && existing.storedName !== storedName) {
    await unlink(join(uploadDir, existing.storedName)).catch(() => undefined);
  }

  if (existing) {
    await db
      .update(attachments)
      .set({
        folderId,
        originalName,
        storedName,
        mimeType: "application/pdf",
        size: buffer.length,
        description,
        updatedAt: now,
      })
      .where(eq(attachments.id, id));
    return {
      id,
      month,
      originalName,
      size: buffer.length,
      createdAt: existing.createdAt,
      updatedAt: now,
    };
  }

  await db.insert(attachments).values({
    id,
    customerId,
    folderId,
    documentId: null,
    assetId: null,
    emailId: null,
    ticketId: null,
    ticketMessageId: null,
    originalName,
    storedName,
    mimeType: "application/pdf",
    size: buffer.length,
    description,
    portalVisible: false,
    createdAt: now,
    updatedAt: now,
  });
  return {
    id,
    month,
    originalName,
    size: buffer.length,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Täglich: abgeschlossenen Vormonat finalisieren, laufenden Monat als Snapshot speichern.
 * Pro Kunde und Monat eine Datei; unnötige Läufe werden übersprungen.
 */
export async function archiveDueMonitoringMonthReports(db: Db, uploadDir: string): Promise<void> {
  const today = todayIso();
  const currentYm = today.slice(0, 7);
  const previousYm = previousMonthYm(today);
  const currentMonthStart = new Date(zonedLocalToUtcMs(`${currentYm}-01`, "00:00"));

  const agentRows = await db
    .select({ customerId: monitoringAgents.customerId })
    .from(monitoringAgents)
    .all();
  const customerIds = [
    ...new Set(agentRows.map((r) => r.customerId).filter((id): id is string => Boolean(id))),
  ];

  for (const customerId of customerIds) {
    try {
      await archiveOneMonth(db, uploadDir, customerId, previousYm, {
        finalizeBefore: currentMonthStart,
      });
      await archiveOneMonth(db, uploadDir, customerId, currentYm, {
        skipIfSavedOn: today,
      });
    } catch (err) {
      console.error(`Monitoring-Monatsreport ${customerId} ${previousYm}/${currentYm}:`, err);
    }
  }
}

async function archiveOneMonth(
  db: Db,
  uploadDir: string,
  customerId: string,
  month: string,
  opts: { finalizeBefore?: Date; skipIfSavedOn?: string },
): Promise<void> {
  const existing = (await listMonitoringMonthReports(db, customerId)).find((r) => r.month === month);
  if (existing && opts.finalizeBefore && existing.updatedAt.getTime() >= opts.finalizeBefore.getTime()) {
    return;
  }
  if (existing && opts.skipIfSavedOn && isoInAppZone(existing.updatedAt) === opts.skipIfSavedOn) {
    return;
  }

  const report = await loadMonitoringMonthReport(db, customerId, month);
  if (!report) return;
  if (report.devices.length === 0 && report.tickets.length === 0) return;
  const buffer = await buildMonitoringMonthReportPdf(report);
  await saveMonitoringMonthReportPdf(db, uploadDir, report, buffer);
}

async function ensureMonitoringReportFolder(db: Db, customerId: string): Promise<string> {
  const tagged = await db
    .select()
    .from(attachments)
    .where(
      and(
        eq(attachments.customerId, customerId),
        like(attachments.description, `${MONITORING_REPORT_DESC_PREFIX}%`),
      ),
    )
    .get();
  if (tagged?.folderId) {
    const folder = await db.select().from(fileFolders).where(eq(fileFolders.id, tagged.folderId)).get();
    if (folder && folder.customerId === customerId) return folder.id;
  }

  const named = await db
    .select()
    .from(fileFolders)
    .where(
      and(
        eq(fileFolders.customerId, customerId),
        eq(fileFolders.name, MONITORING_REPORT_FOLDER_NAME),
        isNull(fileFolders.parentId),
      ),
    )
    .get();
  if (named) return named.id;

  const now = new Date();
  const row = {
    id: createId("fld"),
    customerId,
    parentId: null as string | null,
    name: MONITORING_REPORT_FOLDER_NAME,
    portalVisible: false,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(fileFolders).values(row);
  return row.id;
}

function reportOriginalName(report: MonitoringMonthReportInput, month: string): string {
  const raw = report.customer.company?.trim() || report.customer.name;
  const label = raw.replace(/[^\w\-äöüÄÖÜß]+/gi, "_").replace(/_+/g, "_").slice(0, 40);
  return `Monitoring_${label || "Kunde"}_${month}.pdf`;
}

function safeFilename(name: string): string {
  return name.replace(/[^\w.\-()+\säöüÄÖÜß]/gi, "_").slice(0, 180);
}
