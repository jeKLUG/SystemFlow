import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import PDFDocument from "pdfkit";
import type { Db } from "../db/index.js";
import {
  assets,
  customers,
  monitoringAgents,
  monitoringSamples,
  orgSettings,
  tickets,
  type Customer,
  type TicketPriority,
  type TicketStatus,
} from "../db/schema.js";
import { zonedLocalToUtcMs } from "./dates.js";
import {
  isAgentOnline,
  MONITORING_SAMPLE_RETENTION_MS,
  monitoringIssueLabel,
  parseIssues,
} from "./monitoring.js";
import { contractorPartyLines, customerPartyLines } from "./orgAddress.js";
import {
  paintPdfFooter,
  paintPdfHeader,
  PDF_ACCENT,
  PDF_FOOTER_H,
  PDF_HEADER_H,
  PDF_MARGIN,
  PDF_MUTED,
  PDF_RULE,
  PDF_TEXT,
} from "./pdf-chrome.js";
import { isOpenStatus } from "./tickets.js";

const MARGIN = PDF_MARGIN;
const HEADER_H = PDF_HEADER_H;
const FOOTER_H = PDF_FOOTER_H;
const ACCENT = PDF_ACCENT;
const MUTED = PDF_MUTED;
const TEXT = PDF_TEXT;
const RULE = PDF_RULE;
const SOFT = "#f8fafc";
/** Heartbeat-Takt laut Monitoring-Doku: ein Sample ≈ eine Minute online. */
const HEARTBEAT_MS = 60 * 1000;

const STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Offen",
  in_progress: "In Bearbeitung",
  waiting_customer: "Wartet auf Kunde",
  resolved: "Gelöst",
  closed: "Geschlossen",
};

const PRIORITY_LABEL: Record<TicketPriority, string> = {
  low: "Niedrig",
  normal: "Normal",
  high: "Hoch",
  critical: "Kritisch",
};

export type MonitoringMonthDeviceRow = {
  agentId: string;
  name: string;
  os: string;
  online: boolean;
  currentIssues: string[];
  sampleCount: number;
  expectedSamples: number;
  uptimePct: number | null;
  cpuAvg: number | null;
  cpuMax: number | null;
  ramAvg: number | null;
  ramMax: number | null;
  diskAvg: number | null;
  diskMax: number | null;
};

export type MonitoringMonthTicketRow = {
  number: string;
  title: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: Date;
  resolvedAt: Date | null;
  closedAt: Date | null;
  open: boolean;
};

export type MonitoringMonthReportInput = {
  customer: Customer;
  month: string;
  orgName: string;
  orgLines: string[];
  customerLines: string[];
  from: Date;
  to: Date;
  samplesClipped: boolean;
  devices: MonitoringMonthDeviceRow[];
  tickets: MonitoringMonthTicketRow[];
};

/**
 * Lädt Kennzahlen, Geräte-Auslastung und Monitoring-Tickets eines Kundenmonats.
 * Uptime/Auslastung nur im 30-Tage-Sample-Fenster.
 */
export async function loadMonitoringMonthReport(
  db: Db,
  customerId: string,
  month: string,
  now = new Date(),
): Promise<MonitoringMonthReportInput | null> {
  const customer = await db.select().from(customers).where(eq(customers.id, customerId)).get();
  if (!customer) return null;

  const [y, m] = month.split("-").map(Number);
  const nextYm = m === 12 ? `${y! + 1}-01` : `${y}-${String(m! + 1).padStart(2, "0")}`;
  const from = new Date(zonedLocalToUtcMs(`${month}-01`, "00:00"));
  const monthEnd = new Date(zonedLocalToUtcMs(`${nextYm}-01`, "00:00"));
  const to = now < monthEnd ? now : monthEnd;
  const retentionCutoff = new Date(now.getTime() - MONITORING_SAMPLE_RETENTION_MS);
  const sampleFrom = from > retentionCutoff ? from : retentionCutoff;
  const samplesClipped = from.getTime() < retentionCutoff.getTime();

  const [org, agentRows, ticketRows] = await Promise.all([
    db.select().from(orgSettings).limit(1).get(),
    db.select().from(monitoringAgents).where(eq(monitoringAgents.customerId, customerId)).all(),
    db
      .select()
      .from(tickets)
      .where(and(eq(tickets.customerId, customerId), eq(tickets.source, "monitoring")))
      .all(),
  ]);

  const assetIds = [...new Set(agentRows.map((a) => a.assetId).filter((id): id is string => Boolean(id)))];
  const assetRows =
    assetIds.length > 0
      ? await db.select().from(assets).where(inArray(assets.id, assetIds)).all()
      : [];
  const assetById = new Map(assetRows.map((a) => [a.id, a]));

  const agentIds = agentRows.map((a) => a.id);
  const statsByAgent = new Map<
    string,
    {
      n: number;
      cpuAvg: number | null;
      cpuMax: number | null;
      ramAvg: number | null;
      ramMax: number | null;
      diskAvg: number | null;
      diskMax: number | null;
    }
  >();

  if (agentIds.length > 0 && sampleFrom < to) {
    const grouped = await db
      .select({
        agentId: monitoringSamples.agentId,
        n: sql<number>`count(*)`,
        cpuAvg: sql<number>`avg(${monitoringSamples.cpuPct})`,
        cpuMax: sql<number>`max(${monitoringSamples.cpuPct})`,
        ramAvg: sql<number>`avg(${monitoringSamples.ramPct})`,
        ramMax: sql<number>`max(${monitoringSamples.ramPct})`,
        diskAvg: sql<number>`avg(${monitoringSamples.diskUsedPct})`,
        diskMax: sql<number>`max(${monitoringSamples.diskUsedPct})`,
      })
      .from(monitoringSamples)
      .where(
        and(
          inArray(monitoringSamples.agentId, agentIds),
          gte(monitoringSamples.ts, sampleFrom),
          lt(monitoringSamples.ts, to),
        ),
      )
      .groupBy(monitoringSamples.agentId)
      .all();

    for (const row of grouped) {
      statsByAgent.set(row.agentId, {
        n: Number(row.n) || 0,
        cpuAvg: numOrNull(row.cpuAvg),
        cpuMax: numOrNull(row.cpuMax),
        ramAvg: numOrNull(row.ramAvg),
        ramMax: numOrNull(row.ramMax),
        diskAvg: numOrNull(row.diskAvg),
        diskMax: numOrNull(row.diskMax),
      });
    }
  }

  const devices: MonitoringMonthDeviceRow[] = agentRows
    .filter((agent) => agent.createdAt.getTime() < monthEnd.getTime())
    .map((agent) => {
      const asset = agent.assetId ? assetById.get(agent.assetId) : undefined;
      const hostname = agent.hostname?.trim() || "";
      const base = asset?.name?.trim() || hostname || agent.machineId;
      const name =
        hostname && base !== hostname ? `${base} (${hostname})` : base;
      const stats = statsByAgent.get(agent.id);
      const observedFrom = Math.max(sampleFrom.getTime(), agent.createdAt.getTime());
      const expectedSamples =
        observedFrom < to.getTime() ? Math.max(0, Math.round((to.getTime() - observedFrom) / HEARTBEAT_MS)) : 0;
      const sampleCount = stats?.n ?? 0;
      const uptimePct =
        expectedSamples > 0 ? Math.min(100, (sampleCount / expectedSamples) * 100) : null;
      return {
        agentId: agent.id,
        name,
        os: [agent.os, agent.osVersion].filter(Boolean).join(" "),
        online: isAgentOnline(agent.lastSeenAt, now),
        currentIssues: parseIssues(agent.currentIssuesJson).map((k) => monitoringIssueLabel[k]),
        sampleCount,
        expectedSamples,
        uptimePct,
        cpuAvg: stats?.cpuAvg ?? null,
        cpuMax: stats?.cpuMax ?? null,
        ramAvg: stats?.ramAvg ?? null,
        ramMax: stats?.ramMax ?? null,
        diskAvg: stats?.diskAvg ?? null,
        diskMax: stats?.diskMax ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "de"));

  const monthTickets: MonitoringMonthTicketRow[] = ticketRows
    .filter((t) => ticketTouchesRange(t.createdAt, t.resolvedAt, t.closedAt, from, monthEnd))
    .map((t) => ({
      number: t.number,
      title: t.title,
      status: t.status,
      priority: t.priority,
      createdAt: t.createdAt,
      resolvedAt: t.resolvedAt,
      closedAt: t.closedAt,
      open: isOpenStatus(t.status),
    }))
    .sort((a, b) => {
      if (a.open !== b.open) return a.open ? -1 : 1;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

  const orgLines = contractorPartyLines(org);
  return {
    customer,
    month,
    orgName: org?.orgName?.trim() || "Systemhaus-Ess",
    orgLines,
    customerLines: customerPartyLines(customer),
    from,
    to,
    samplesClipped,
    devices,
    tickets: monthTickets,
  };
}

/**
 * Monatsreport-PDF Monitoring: Uptime, Auslastung, Tickets, aktueller Warnstand.
 * Chrome/Logo wie die übrigen Staff-PDFs.
 */
export async function buildMonitoringMonthReportPdf(
  input: MonitoringMonthReportInput,
): Promise<Buffer> {
  const customerLabel = input.customer.company?.trim() || input.customer.name;
  const monthTitle = formatMonthTitle(input.month);
  const headerTitle = "Monatsreport Monitoring";
  const opened = input.tickets.filter((t) => t.createdAt >= input.from && t.createdAt < input.to);
  const openNow = input.tickets.filter((t) => t.open);
  const withUptime = input.devices.filter((d) => d.uptimePct != null);
  const avgUptime =
    withUptime.length > 0
      ? withUptime.reduce((s, d) => s + (d.uptimePct || 0), 0) / withUptime.length
      : null;
  const withCpu = input.devices.filter((d) => d.cpuAvg != null);
  const avgCpu =
    withCpu.length > 0 ? withCpu.reduce((s, d) => s + (d.cpuAvg || 0), 0) / withCpu.length : null;
  const peakCpu = maxOf(input.devices.map((d) => d.cpuMax));
  const withRam = input.devices.filter((d) => d.ramAvg != null);
  const avgRam =
    withRam.length > 0 ? withRam.reduce((s, d) => s + (d.ramAvg || 0), 0) / withRam.length : null;
  const withDisk = input.devices.filter((d) => d.diskAvg != null);
  const avgDisk =
    withDisk.length > 0 ? withDisk.reduce((s, d) => s + (d.diskAvg || 0), 0) / withDisk.length : null;

  const doc = new PDFDocument({
    size: "A4",
    bufferPages: true,
    autoFirstPage: true,
    margins: {
      top: MARGIN + HEADER_H,
      bottom: MARGIN + FOOTER_H,
      left: MARGIN,
      right: MARGIN,
    },
    info: {
      Title: `Monatsreport Monitoring – ${customerLabel} – ${monthTitle}`,
      Author: input.orgName,
      Subject: `Monitoring ${monthTitle}`,
      Creator: input.orgName,
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.x = MARGIN;
  doc.y = contentTop(doc);

  doc.font("Helvetica").fontSize(8).fillColor(ACCENT).text("MONITORING · MONATSREPORT");
  doc.moveDown(0.25);
  doc
    .font("Helvetica-Bold")
    .fontSize(18)
    .fillColor(TEXT)
    .text(customerLabel, { width: contentWidth(doc) });
  doc.moveDown(0.2);
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(MUTED)
    .text(`${monthTitle} · ${input.orgName} · Stand ${formatDateTime(new Date())}`);
  doc.moveDown(0.55);
  doc
    .strokeColor(RULE)
    .lineWidth(0.8)
    .moveTo(MARGIN, doc.y)
    .lineTo(MARGIN + contentWidth(doc), doc.y)
    .stroke();
  doc.moveDown(0.55);

  drawParties(doc, "Kunde", input.customerLines, input.orgName, input.orgLines);

  drawKpis(doc, [
    ["Geräte", String(input.devices.length)],
    ["Ø Uptime", formatPct(avgUptime)],
    ["Tickets neu", String(opened.length)],
    ["Tickets offen", String(openNow.length)],
    ["Ø CPU", formatPct(avgCpu)],
    ["CPU max", formatPct(peakCpu)],
    ["Ø RAM", formatPct(avgRam)],
    ["Ø Datenträger", formatPct(avgDisk)],
  ]);

  drawSectionTitle(doc, "Geräte · Uptime und Auslastung");
  if (input.devices.length === 0) {
    doc.font("Helvetica").fontSize(9).fillColor(MUTED).text("Keine zugeordneten Monitoring-Geräte.");
    doc.moveDown(0.6);
  } else {
    const cols = colWidths(doc, [0.3, 0.12, 0.12, 0.16, 0.15, 0.15]);
    drawTableHeader(doc, cols, ["Gerät", "Status", "Uptime", "CPU Ø/Max", "RAM Ø/Max", "Disk Ø/Max"]);
    for (const d of input.devices) {
      const status = d.currentIssues.length ? "Warnung" : d.online ? "Online" : "Offline";
      drawTableRow(doc, cols, [
        d.name,
        status,
        formatPct(d.uptimePct),
        formatAvgMax(d.cpuAvg, d.cpuMax),
        formatAvgMax(d.ramAvg, d.ramMax),
        formatAvgMax(d.diskAvg, d.diskMax),
      ]);
    }
    doc.moveDown(0.45);
  }

  drawSectionTitle(doc, "Probleme · Monitoring-Tickets");
  if (input.tickets.length === 0) {
    doc.font("Helvetica").fontSize(9).fillColor(MUTED).text("Keine Monitoring-Tickets in diesem Monat.");
    doc.moveDown(0.6);
  } else {
    const cols = colWidths(doc, [0.14, 0.12, 0.12, 0.18, 0.44]);
    drawTableHeader(doc, cols, ["Datum", "Nr.", "Prio", "Status", "Titel"]);
    for (const t of input.tickets) {
      drawTableRow(doc, cols, [
        formatDateTime(t.createdAt),
        t.number,
        PRIORITY_LABEL[t.priority],
        STATUS_LABEL[t.status],
        t.title,
      ]);
    }
    doc.moveDown(0.45);
  }

  const warningDevices = input.devices.filter((d) => d.currentIssues.length > 0 || !d.online);
  drawSectionTitle(doc, "Aktueller Stand");
  if (warningDevices.length === 0) {
    doc.font("Helvetica").fontSize(9).fillColor(MUTED).text("Keine aktiven Warnungen zum Zeitpunkt der Erstellung.");
    doc.moveDown(0.5);
  } else {
    const cols = colWidths(doc, [0.38, 0.14, 0.48]);
    drawTableHeader(doc, cols, ["Gerät", "Status", "Probleme"]);
    for (const d of warningDevices) {
      drawTableRow(doc, cols, [
        d.name,
        d.currentIssues.length ? "Warnung" : "Offline",
        d.currentIssues.length ? d.currentIssues.join(", ") : "Kein Heartbeat",
      ]);
    }
    doc.moveDown(0.5);
  }

  ensureSpace(doc, 42);
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(MUTED)
    .text(
      input.samplesClipped
        ? "Hinweis: Auslastung und Uptime stammen aus Minuten-Samples (Heartbeat 1 Min.), die 30 Tage vorgehalten werden. Der gewählte Monat reicht weiter zurück – die Kennzahlen gelten für das noch vorhandene Fenster."
        : "Hinweis: Auslastung und Uptime stammen aus Minuten-Samples (Heartbeat 1 Min., 30 Tage Vorhalt). Offline nach 2 Minuten ohne Heartbeat. Tickets mit Quelle Monitoring im Monat.",
      { width: contentWidth(doc) },
    );

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    paintPdfHeader(doc, headerTitle);
    paintPdfFooter(doc, i - range.start + 1, range.count);
  }

  doc.end();
  return done;
}

function ticketTouchesRange(
  createdAt: Date,
  resolvedAt: Date | null,
  closedAt: Date | null,
  from: Date,
  to: Date,
): boolean {
  const created = createdAt.getTime();
  if (created >= to.getTime()) return false;
  const ended = closedAt?.getTime() ?? resolvedAt?.getTime() ?? null;
  if (ended != null && ended < from.getTime()) return false;
  return created < to.getTime();
}

function numOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function maxOf(values: Array<number | null>): number | null {
  let max: number | null = null;
  for (const v of values) {
    if (v == null) continue;
    if (max == null || v > max) max = v;
  }
  return max;
}

function contentTop(doc: PDFKit.PDFDocument): number {
  return doc.page.margins.top;
}

function contentBottom(doc: PDFKit.PDFDocument): number {
  return doc.page.height - doc.page.margins.bottom;
}

function contentWidth(doc: PDFKit.PDFDocument): number {
  return doc.page.width - MARGIN * 2;
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  if (doc.y + needed <= contentBottom(doc)) return;
  if (doc.y <= contentTop(doc) + 2) return;
  doc.addPage();
  doc.x = MARGIN;
}

function drawSectionTitle(doc: PDFKit.PDFDocument, title: string) {
  ensureSpace(doc, 28);
  doc.font("Helvetica-Bold").fontSize(11).fillColor(TEXT).text(title);
  doc.moveDown(0.25);
  doc
    .strokeColor(ACCENT)
    .lineWidth(1.2)
    .moveTo(MARGIN, doc.y)
    .lineTo(MARGIN + 36, doc.y)
    .stroke();
  doc.moveDown(0.4);
}

function drawParties(
  doc: PDFKit.PDFDocument,
  leftTitle: string,
  leftLines: string[],
  rightTitle: string,
  rightLines: string[],
) {
  const gap = 16;
  const colW = (contentWidth(doc) - gap) / 2;
  const leftBody = leftLines.join("\n") || "–";
  const rightBody = rightLines.join("\n") || "–";
  doc.font("Helvetica").fontSize(8);
  const leftH = doc.heightOfString(leftBody, { width: colW });
  const rightH = doc.heightOfString(rightBody, { width: colW });
  const boxH = Math.max(leftH, rightH) + 28;
  ensureSpace(doc, boxH + 8);
  const y = doc.y;
  doc.save().roundedRect(MARGIN, y, colW, boxH, 6).fillAndStroke("#fff", RULE).restore();
  doc
    .save()
    .roundedRect(MARGIN + colW + gap, y, colW, boxH, 6)
    .fillAndStroke("#fff", RULE)
    .restore();
  doc.font("Helvetica").fontSize(7).fillColor(MUTED).text(leftTitle.toUpperCase(), MARGIN + 10, y + 8, {
    width: colW - 20,
    lineBreak: false,
  });
  doc.text(rightTitle.toUpperCase(), MARGIN + colW + gap + 10, y + 8, {
    width: colW - 20,
    lineBreak: false,
  });
  doc.font("Helvetica").fontSize(8.5).fillColor(TEXT).text(leftBody, MARGIN + 10, y + 22, { width: colW - 20 });
  doc.text(rightBody, MARGIN + colW + gap + 10, y + 22, { width: colW - 20 });
  doc.y = y + boxH + 12;
  doc.x = MARGIN;
}

function drawKpis(doc: PDFKit.PDFDocument, items: [string, string][]) {
  const cols = 4;
  const gap = 8;
  const boxW = (contentWidth(doc) - gap * (cols - 1)) / cols;
  const boxH = 44;
  const rows = Math.ceil(items.length / cols);
  ensureSpace(doc, rows * (boxH + gap) + 4);
  let y = doc.y;
  items.forEach(([label, value], i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = MARGIN + col * (boxW + gap);
    const top = y + row * (boxH + gap);
    doc.save().roundedRect(x, top, boxW, boxH, 6).fillAndStroke("#fff", RULE).restore();
    doc.font("Helvetica").fontSize(7).fillColor(MUTED).text(label.toUpperCase(), x + 8, top + 8, {
      width: boxW - 16,
      lineBreak: false,
    });
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor(TEXT)
      .text(value, x + 8, top + 22, { width: boxW - 16, height: 16, ellipsis: true });
  });
  doc.y = y + rows * (boxH + gap) + 4;
  doc.x = MARGIN;
}

function colWidths(doc: PDFKit.PDFDocument, fractions: number[]): number[] {
  return fractions.map((f) => contentWidth(doc) * f);
}

function drawTableHeader(doc: PDFKit.PDFDocument, cols: number[], labels: string[]) {
  ensureSpace(doc, 22);
  const y = doc.y;
  const rowH = 18;
  doc.save().rect(MARGIN, y, contentWidth(doc), rowH).fill(SOFT).restore();
  let x = MARGIN;
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor(MUTED);
  labels.forEach((label, i) => {
    doc.text(label.toUpperCase(), x + 4, y + 5, {
      width: cols[i]! - 8,
      lineBreak: false,
      ellipsis: true,
    });
    x += cols[i]!;
  });
  doc.y = y + rowH;
  doc.x = MARGIN;
}

function drawTableRow(doc: PDFKit.PDFDocument, cols: number[], cells: string[]) {
  const rowH = 17;
  ensureSpace(doc, rowH + 2);
  const y = doc.y;
  doc
    .strokeColor(RULE)
    .lineWidth(0.5)
    .moveTo(MARGIN, y + rowH)
    .lineTo(MARGIN + contentWidth(doc), y + rowH)
    .stroke();
  let x = MARGIN;
  doc.font("Helvetica").fontSize(8).fillColor(TEXT);
  cells.forEach((cell, i) => {
    doc.text(cell || "–", x + 4, y + 3.5, {
      width: cols[i]! - 8,
      height: rowH - 4,
      lineBreak: false,
      ellipsis: true,
    });
    x += cols[i]!;
  });
  doc.y = y + rowH;
  doc.x = MARGIN;
}

function formatMonthTitle(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return ym;
  return new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" }).format(
    new Date(Number(m[1]), Number(m[2]) - 1, 1),
  );
}

function formatDateTime(d: Date): string {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function formatPct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "–";
  return `${n.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`;
}

function formatAvgMax(avg: number | null, max: number | null): string {
  if (avg == null && max == null) return "–";
  const a = avg == null ? "–" : avg.toLocaleString("de-DE", { maximumFractionDigits: 0 });
  const b = max == null ? "–" : max.toLocaleString("de-DE", { maximumFractionDigits: 0 });
  return `${a} / ${b}`;
}
