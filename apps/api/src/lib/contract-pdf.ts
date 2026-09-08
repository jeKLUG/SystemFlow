import PDFDocument from "pdfkit";
import type { Contract, Customer } from "../db/schema.js";
import {
  paintPdfFooter,
  paintPdfHeader,
  PDF_FOOTER_H,
  PDF_HEADER_H,
  PDF_MARGIN,
} from "./pdf-chrome.js";

const MARGIN = PDF_MARGIN;
const HEADER_H = PDF_HEADER_H;
const FOOTER_H = PDF_FOOTER_H;
const ACCENT = "#3b82f6";
const MUTED = "#64748b";
const TEXT = "#0f172a";
const RULE = "#e2e8f0";
const SOFT = "#f8fafc";

const statusLabel: Record<string, string> = {
  draft: "Entwurf",
  active: "Aktiv",
  paused: "Pausiert",
  expired: "Abgelaufen",
  cancelled: "Beendet",
};

/**
 * Erzeugt ein schlichtes SLA-/Vertrags-PDF (Kopfzeile, Seitenzahl, ohne Leerseiten).
 */
export async function buildContractPdf(customer: Customer, contract: Contract): Promise<Buffer> {
  const customerLabel = customer.company?.trim() || customer.name;
  const headerTitle = contract.title?.trim() || "SLA / Vertrag";

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
      Title: headerTitle,
      Author: "Systemhaus-Ess",
      Subject: `SLA / Vertrag – ${customerLabel}`,
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

  drawTitle(doc, contract, customerLabel);
  drawMeta(doc, contract);
  drawParties(doc, customer);
  drawSection(doc, "Leistungsumfang", () => {
    paragraph(
      doc,
      contract.description?.trim() || "Keine Angaben zum Leistungsumfang hinterlegt.",
    );
  });
  drawSection(doc, "Servicezeiten & Abdeckung", () => {
    kv(doc, "Servicezeiten", contract.coverageHours || "–");
    if (contract.coverageNote?.trim()) kv(doc, "Abdeckung / Ausnahmen", contract.coverageNote.trim());
    if (contract.includedHoursMonth != null) {
      kv(doc, "Inklusive Stunden / Monat", `${formatNum(contract.includedHoursMonth)} h`);
    }
    if (contract.onsiteHours != null) {
      kv(doc, "Vor Ort (Stunden)", formatHours(contract.onsiteHours));
    }
    if (contract.priceMonthly != null) {
      kv(doc, "Preis / Monat", formatMoney(contract.priceMonthly));
    } else if (contract.priceYearly != null) {
      kv(doc, "Preis / Jahr", formatMoney(contract.priceYearly));
    }
  });
  drawSection(doc, "Service-Level-Ziele", () => {
    paragraph(
      doc,
      "Reaktions- und Lösungszeiten gelten innerhalb der vereinbarten Servicezeiten. Zeiten außerhalb werden nicht auf die SLA-Frist angerechnet, sofern nicht anders vereinbart.",
    );
    drawSlaTable(doc, contract);
  });
  drawSection(doc, "Ansprechpartner & Eskalation", () => {
    drawContacts(doc, contract);
  });
  if (contract.notes?.trim()) {
    drawSection(doc, "Sonstige Vereinbarungen", () => {
      paragraph(doc, contract.notes!.trim());
    });
  }
  drawSignatures(doc, customerLabel);

  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    paintPdfHeader(doc, headerTitle);
    paintPdfFooter(doc, i + 1, range.count);
  }

  doc.end();
  return done;
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

/** Seitenumbruch nur wenn nötig – nicht am Seitenanfang. */
function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  const bottom = contentBottom(doc);
  const top = contentTop(doc);
  if (doc.y + needed <= bottom) return;
  if (doc.y <= top + 2) return;
  doc.addPage();
  doc.x = MARGIN;
}

function drawTitle(doc: PDFKit.PDFDocument, contract: Contract, customerLabel: string) {
  doc.font("Helvetica").fontSize(8).fillColor(ACCENT).text("SLA / VERTRAG");
  doc.moveDown(0.25);
  doc
    .font("Helvetica-Bold")
    .fontSize(18)
    .fillColor(TEXT)
    .text(contract.title?.trim() || "Ohne Titel", { width: contentWidth(doc) });
  doc.moveDown(0.2);
  doc.font("Helvetica").fontSize(10).fillColor(MUTED).text(customerLabel);
  doc.moveDown(0.55);
  doc
    .strokeColor(RULE)
    .lineWidth(0.8)
    .moveTo(MARGIN, doc.y)
    .lineTo(MARGIN + contentWidth(doc), doc.y)
    .stroke();
  doc.moveDown(0.65);
}

function drawMeta(doc: PDFKit.PDFDocument, contract: Contract) {
  const items: [string, string][] = [
    ["Vertragsnr.", contract.contractNumber || "–"],
    ["Status", statusLabel[contract.status] ?? contract.status],
    ["Beginn", formatDate(contract.startDate)],
    ["Ende", formatDate(contract.endDate)],
  ];
  ensureSpace(doc, 52);
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
      .fontSize(9.5)
      .fillColor(TEXT)
      .text(value, x + 8, y + 22, { width: boxW - 16, height: 16, ellipsis: true });
  });
  doc.y = y + 54;
  doc.x = MARGIN;
}

function drawParties(doc: PDFKit.PDFDocument, customer: Customer) {
  const leftLines = ["Systemhaus-Ess", "IT-Dienstleistungen & Support"];
  const rightLines = [
    customer.company || customer.name,
    customer.contactPerson ? `z. Hd. ${customer.contactPerson}` : null,
    customer.address,
    [customer.zip, customer.city].filter(Boolean).join(" ") || null,
    customer.country && customer.country !== "DE" ? customer.country : null,
    customer.email,
    customer.phone,
  ].filter(Boolean) as string[];

  const colW = (contentWidth(doc) - 12) / 2;
  const leftH = partyBoxHeight(leftLines);
  const rightH = partyBoxHeight(rightLines);
  const boxH = Math.max(leftH, rightH, 72);
  ensureSpace(doc, boxH + 12);

  const y0 = doc.y;
  drawPartyBox(doc, MARGIN, y0, colW, boxH, "Auftragnehmer", leftLines);
  drawPartyBox(doc, MARGIN + colW + 12, y0, colW, boxH, "Auftraggeber", rightLines);
  doc.y = y0 + boxH + 12;
  doc.x = MARGIN;
}

function partyBoxHeight(lines: string[]): number {
  return 28 + Math.min(lines.length, 6) * 13 + 12;
}

function drawPartyBox(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
  lines: string[],
) {
  doc.save().roundedRect(x, y, w, h, 7).fill(SOFT).restore();
  doc.save().roundedRect(x, y, w, h, 7).stroke(RULE).restore();
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor(ACCENT).text(title.toUpperCase(), x + 10, y + 10, {
    width: w - 20,
    lineBreak: false,
  });
  doc.font("Helvetica").fontSize(9.5).fillColor(TEXT);
  let ty = y + 26;
  for (const line of lines.slice(0, 6)) {
    doc.text(line, x + 10, ty, { width: w - 20, lineBreak: false, ellipsis: true, height: 12 });
    ty += 13;
  }
}

function drawSection(doc: PDFKit.PDFDocument, title: string, body: () => void) {
  ensureSpace(doc, 40);
  if (doc.y > contentTop(doc) + 4) doc.y += 6;
  doc.font("Helvetica-Bold").fontSize(11.5).fillColor(TEXT).text(title);
  doc.moveDown(0.45);
  body();
}

function drawSlaTable(doc: PDFKit.PDFDocument, contract: Contract) {
  const normal = contract.responseNormalHours ?? contract.slaResponseHours ?? null;
  const rows: [string, number | null, number | null][] = [
    ["P1 Kritisch", contract.responseCriticalHours, contract.resolveCriticalHours],
    ["P2 Hoch", contract.responseHighHours, contract.resolveHighHours],
    ["P3 Normal", normal, contract.resolveNormalHours],
    ["P4 Niedrig", contract.responseLowHours, contract.resolveLowHours],
  ];

  const tableW = contentWidth(doc);
  const cols = [tableW * 0.38, tableW * 0.31, tableW * 0.31];
  const rowH = 22;
  ensureSpace(doc, 20 + (rows.length + 1) * rowH);

  let y = doc.y;
  drawTableRow(doc, y, cols, rowH, ["Priorität", "Reaktionszeit", "Lösungszeit"], true);
  y += rowH;
  for (const [prio, response, resolve] of rows) {
    if (y + rowH > contentBottom(doc)) {
      doc.addPage();
      doc.x = MARGIN;
      y = contentTop(doc);
      drawTableRow(doc, y, cols, rowH, ["Priorität", "Reaktionszeit", "Lösungszeit"], true);
      y += rowH;
    }
    drawTableRow(doc, y, cols, rowH, [prio, formatHours(response), formatHours(resolve)], false);
    y += rowH;
  }
  doc.y = y + 8;
  doc.x = MARGIN;
}

function drawTableRow(
  doc: PDFKit.PDFDocument,
  y: number,
  cols: number[],
  rowH: number,
  cells: string[],
  header: boolean,
) {
  let x = MARGIN;
  for (let i = 0; i < cols.length; i++) {
    const w = cols[i]!;
    doc
      .save()
      .rect(x, y, w, rowH)
      .fillAndStroke(header ? "#eff6ff" : i === 0 ? SOFT : "#fff", RULE)
      .restore();
    doc
      .font(header || i === 0 ? "Helvetica-Bold" : "Helvetica")
      .fontSize(header ? 8 : 9.5)
      .fillColor(header ? ACCENT : TEXT)
      .text(cells[i] ?? "–", x + 8, y + (header ? 7 : 6), {
        width: w - 16,
        lineBreak: false,
      });
    x += w;
  }
}

function drawContacts(doc: PDFKit.PDFDocument, contract: Contract) {
  const left: [string, string][] = [
    ["Ansprechpartner", contract.contactPerson || "–"],
    ["Telefon", contract.contactPhone || "–"],
    ["E-Mail", contract.contactEmail || "–"],
  ];
  const right: [string, string][] = [
    ["Eskalation", contract.escalationContact || "–"],
    ["Telefon", contract.escalationPhone || "–"],
    ["E-Mail", contract.escalationEmail || "–"],
  ];

  const colW = (contentWidth(doc) - 12) / 2;
  const boxH = 74;
  ensureSpace(doc, boxH + 8);
  const y0 = doc.y;
  drawContactColumn(doc, MARGIN, y0, colW, boxH, "Operativ", left);
  drawContactColumn(doc, MARGIN + colW + 12, y0, colW, boxH, "Eskalation", right);
  doc.y = y0 + boxH + 8;
  doc.x = MARGIN;
}

function drawContactColumn(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
  rows: [string, string][],
) {
  doc.save().roundedRect(x, y, w, h, 7).fillAndStroke("#fff", RULE).restore();
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor(ACCENT).text(title.toUpperCase(), x + 10, y + 10, {
    width: w - 20,
    lineBreak: false,
  });
  let ty = y + 26;
  for (const [label, value] of rows) {
    doc.font("Helvetica").fontSize(7.5).fillColor(MUTED).text(label, x + 10, ty, {
      width: 72,
      lineBreak: false,
    });
    doc.font("Helvetica").fontSize(9).fillColor(TEXT).text(value, x + 82, ty, {
      width: w - 92,
      lineBreak: false,
      ellipsis: true,
      height: 12,
    });
    ty += 15;
  }
}

function drawSignatures(doc: PDFKit.PDFDocument, customerLabel: string) {
  ensureSpace(doc, 100);
  if (doc.y > contentTop(doc) + 4) doc.y += 10;
  doc
    .font("Helvetica")
    .fontSize(8.5)
    .fillColor(MUTED)
    .text(
      `Erstellt am ${formatDateTime(new Date())}. Verbindliche Leistungen ergeben sich aus diesem Dokument und etwaigen Anlagen.`,
      { width: contentWidth(doc), lineGap: 1.5 },
    );
  doc.moveDown(1.2);

  const colW = (contentWidth(doc) - 20) / 2;
  ensureSpace(doc, 56);
  const y = doc.y + 28;
  for (let i = 0; i < 2; i++) {
    const x = MARGIN + i * (colW + 20);
    doc
      .strokeColor(RULE)
      .lineWidth(0.9)
      .moveTo(x, y)
      .lineTo(x + colW, y)
      .stroke();
    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor(MUTED)
      .text(
        i === 0 ? "Systemhaus-Ess · Datum / Unterschrift" : `${customerLabel} · Datum / Unterschrift`,
        x,
        y + 8,
        { width: colW },
      );
  }
  doc.y = y + 36;
}

function paragraph(doc: PDFKit.PDFDocument, text: string) {
  ensureSpace(doc, 24);
  doc.font("Helvetica").fontSize(10).fillColor(TEXT).text(text, {
    width: contentWidth(doc),
    align: "left",
    lineGap: 2.5,
  });
  doc.moveDown(0.3);
}

function kv(doc: PDFKit.PDFDocument, label: string, value: string) {
  ensureSpace(doc, 20);
  const y = doc.y;
  const labelW = 150;
  doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(label, MARGIN, y, {
    width: labelW,
    lineBreak: false,
  });
  doc.font("Helvetica").fontSize(10).fillColor(TEXT).text(value, MARGIN + labelW, y, {
    width: contentWidth(doc) - labelW,
  });
  doc.y = Math.max(doc.y, y + 15);
  doc.x = MARGIN;
}

function formatHours(hours: number | null | undefined): string {
  if (hours == null || Number.isNaN(hours)) return "–";
  if (hours < 1) return `${Math.round(hours * 60)} Min.`;
  const rounded = Math.round(hours * 100) / 100;
  return Number.isInteger(rounded) ? `${rounded} h` : `${rounded} h`;
}

function formatNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(n);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "–";
  try {
    const [y, m, d] = value.split("-").map(Number);
    if (!y || !m || !d) return value;
    return new Intl.DateTimeFormat("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(y, m - 1, d));
  } catch {
    return value;
  }
}

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}
