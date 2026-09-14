import PDFDocument from "pdfkit";
import type { Customer, Project, TimeEntry } from "../db/schema.js";
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

const MARGIN = PDF_MARGIN;
const HEADER_H = PDF_HEADER_H;
const FOOTER_H = PDF_FOOTER_H;
const ACCENT = PDF_ACCENT;
const MUTED = PDF_MUTED;
const TEXT = PDF_TEXT;
const RULE = PDF_RULE;
const SOFT = "#f8fafc";

export type TimeMonthReportEntry = TimeEntry & {
  projectName?: string | null;
};

export type TimeMonthReportInput = {
  customer: Customer;
  month: string;
  entries: TimeMonthReportEntry[];
  projects: Project[];
  currency?: string;
};

/**
 * Monatsreport-PDF für einen Kunden: Stunden, Betrag, ungebucht / vorgemerkt / abgerechnet.
 * Lexware bleibt extern – Status nur zur Vorbereitung.
 */
export async function buildTimeMonthReportPdf(input: TimeMonthReportInput): Promise<Buffer> {
  const { customer, month } = input;
  const customerLabel = customer.company?.trim() || customer.name;
  const currency = input.currency || "EUR";
  const monthTitle = formatMonthTitle(month);
  const headerTitle = "Monatsreport Zeit";

  const entries = [...input.entries]
    .filter((e) => e.endTime || !e.startTime)
    .sort((a, b) => {
      const d = a.workDate.localeCompare(b.workDate);
      if (d !== 0) return d;
      return (a.startTime || "").localeCompare(b.startTime || "");
    });

  const totalHours = sumHours(entries);
  const billable = entries.filter((e) => e.billable);
  const billableHours = sumHours(billable);
  const billableAmount = sumAmount(billable);
  const unbilled = billable.filter((e) => !e.billed);
  const unbilledHours = sumHours(unbilled);
  const unbilledAmount = sumAmount(unbilled);
  const ready = billable.filter((e) => e.readyForInvoice && !e.billed);
  const readyHours = sumHours(ready);
  const readyAmount = sumAmount(ready);
  const billedEntries = billable.filter((e) => e.billed);
  const billedHours = sumHours(billedEntries);
  const billedAmount = sumAmount(billedEntries);

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
      Title: `Monatsreport – ${customerLabel} – ${monthTitle}`,
      Author: "Systemhaus-Ess",
      Subject: `Zeit ${monthTitle}`,
      Creator: "Systemhaus-Ess",
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

  doc.font("Helvetica").fontSize(8).fillColor(ACCENT).text("ZEIT · MONATSREPORT");
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
    .text(`${monthTitle} · Lexware bleibt extern · Stand ${formatDateTime(new Date())}`);
  doc.moveDown(0.55);
  doc
    .strokeColor(RULE)
    .lineWidth(0.8)
    .moveTo(MARGIN, doc.y)
    .lineTo(MARGIN + contentWidth(doc), doc.y)
    .stroke();
  doc.moveDown(0.55);

  drawKpis(doc, [
    ["Stunden gesamt", formatHours(totalHours)],
    ["Abrechenbar", `${formatHours(billableHours)} h`],
    ["Ungebucht", `${formatHours(unbilledHours)} h`],
    ["Vorgemerkt", `${formatHours(readyHours)} h`],
  ]);

  drawKpis(doc, [
    ["Betrag abrechenbar", formatMoney(billableAmount, currency)],
    ["Betrag ungebucht", formatMoney(unbilledAmount, currency)],
    ["Betrag vorgemerkt", formatMoney(readyAmount, currency)],
    ["Betrag abgerechnet", formatMoney(billedAmount, currency)],
  ]);

  ensureSpace(doc, 28);
  doc.font("Helvetica-Bold").fontSize(11.5).fillColor(TEXT).text(`Buchungen (${entries.length})`);
  doc.moveDown(0.4);

  if (!entries.length) {
    doc.font("Helvetica").fontSize(9.5).fillColor(MUTED).text("Keine Zeiteinträge in diesem Monat.");
  } else {
    const cols = colWidths(doc, [0.14, 0.12, 0.1, 0.34, 0.16, 0.14]);
    drawTableHeader(doc, cols, ["Datum", "Zeit", "Std.", "Beschreibung", "Status", "Betrag"]);
    for (const e of entries) {
      const range =
        e.startTime && e.endTime ? `${e.startTime}–${e.endTime}` : e.startTime ? `${e.startTime}…` : "–";
      const desc = [
        e.description?.trim() || null,
        e.projectId
          ? input.projects.find((p) => p.id === e.projectId)?.name || e.projectName || null
          : null,
      ]
        .filter(Boolean)
        .join(" · ");
      drawTableRow(doc, cols, [
        formatDate(e.workDate),
        range,
        formatHours(Number(e.hours) || 0),
        desc || "–",
        statusLabel(e),
        e.amountSnapshot != null ? formatMoney(Number(e.amountSnapshot), currency) : "–",
      ]);
    }
  }

  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    paintPdfHeader(doc, headerTitle);
    paintPdfFooter(doc, i + 1, range.count);
  }

  doc.end();
  return done;
}

function statusLabel(e: TimeEntry): string {
  if (!e.billable) return "Nicht abr.";
  if (e.billed) return "Abgerechnet";
  if (e.readyForInvoice) return "Vorgemerkt";
  return "Offen";
}

function sumHours(entries: TimeEntry[]): number {
  return round2(entries.reduce((s, e) => s + (Number(e.hours) || 0), 0));
}

function sumAmount(entries: TimeEntry[]): number {
  return round2(
    entries.reduce((s, e) => s + (e.amountSnapshot != null ? Number(e.amountSnapshot) : 0), 0),
  );
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

function drawKpis(doc: PDFKit.PDFDocument, items: [string, string][]) {
  ensureSpace(doc, 58);
  const gap = 8;
  const boxW = (contentWidth(doc) - gap * 3) / 4;
  const y = doc.y;
  items.forEach(([label, value], i) => {
    const x = MARGIN + i * (boxW + gap);
    doc.save().roundedRect(x, y, boxW, 44, 6).fillAndStroke("#fff", RULE).restore();
    doc.font("Helvetica").fontSize(7).fillColor(MUTED).text(label.toUpperCase(), x + 8, y + 8, {
      width: boxW - 16,
      lineBreak: false,
    });
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor(TEXT)
      .text(value, x + 8, y + 22, { width: boxW - 16, height: 16, ellipsis: true });
  });
  doc.y = y + 54;
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

function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
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

function formatHours(n: number): string {
  return n.toLocaleString("de-DE", { maximumFractionDigits: 2 });
}

function formatMoney(n: number, currency: string): string {
  return `${n.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
