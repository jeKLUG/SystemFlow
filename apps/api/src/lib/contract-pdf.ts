import PDFDocument from "pdfkit";
import type { Contract, Customer } from "../db/schema.js";

const MARGIN = 52;
const ACCENT = "#1d4ed8";
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
 * Erzeugt ein druckfertiges SLA-/Vertrags-PDF.
 */
export async function buildContractPdf(customer: Customer, contract: Contract): Promise<Buffer> {
  const customerLabel = customer.company?.trim() || customer.name;
  const doc = new PDFDocument({
    size: "A4",
    bufferPages: true,
    margins: { top: MARGIN, bottom: MARGIN + 36, left: MARGIN, right: MARGIN },
    info: {
      Title: contract.title,
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

  drawHeader(doc);
  drawTitleBlock(doc, contract, customerLabel);
  drawParties(doc, customer);
  drawMeta(doc, contract);
  drawSection(doc, "1. Leistungsumfang", () => {
    const text = contract.description?.trim() || "Keine Angaben zum Leistungsumfang hinterlegt.";
    paragraph(doc, text);
  });
  drawSection(doc, "2. Servicezeiten & Abdeckung", () => {
    kv(doc, "Servicezeiten", contract.coverageHours || "–");
    if (contract.coverageNote) kv(doc, "Hinweise", contract.coverageNote);
    if (contract.includedHoursMonth != null) {
      kv(doc, "Inklusive Stunden / Monat", `${formatNum(contract.includedHoursMonth)} h`);
    }
    if (contract.onsiteHours != null) {
      kv(doc, "Vor-Ort-Einsatz (Ziel)", formatHours(contract.onsiteHours));
    }
  });
  drawSection(doc, "3. Service-Level-Ziele", () => {
    paragraph(
      doc,
      "Die folgenden Reaktions- und Lösungszeiten gelten innerhalb der vereinbarten Servicezeiten. Zeiten außerhalb der Servicezeiten werden nicht auf die SLA-Frist angerechnet, sofern nicht anders vereinbart.",
    );
    drawSlaTable(doc, contract);
  });
  drawSection(doc, "4. Ansprechpartner & Eskalation", () => {
    drawContacts(doc, contract);
  });
  if (contract.notes?.trim()) {
    drawSection(doc, "5. Sonstige Vereinbarungen", () => {
      paragraph(doc, contract.notes!.trim());
    });
  }
  drawSignatures(doc, customerLabel);

  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    paintFooter(doc, customerLabel, contract, i + 1, range.count);
  }

  doc.end();
  return done;
}

function drawHeader(doc: PDFKit.PDFDocument) {
  doc.save().rect(0, 0, doc.page.width, 7).fill(ACCENT).restore();
  doc.font("Helvetica").fontSize(9).fillColor(ACCENT).text("SYSTEMHAUS-ESS", MARGIN, MARGIN - 6, {
    characterSpacing: 1.5,
  });
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(MUTED)
    .text("IT-Service · SLA / Vertrag", doc.page.width - MARGIN - 160, MARGIN - 6, {
      width: 160,
      align: "right",
    });
  doc.moveDown(1.4);
}

function drawTitleBlock(doc: PDFKit.PDFDocument, contract: Contract, customerLabel: string) {
  doc
    .font("Helvetica-Bold")
    .fontSize(22)
    .fillColor(TEXT)
    .text(contract.title, { width: doc.page.width - MARGIN * 2 });
  doc.moveDown(0.25);
  doc.font("Helvetica").fontSize(11).fillColor(MUTED).text(`für ${customerLabel}`);
  doc.moveDown(0.55);
  doc
    .strokeColor(RULE)
    .lineWidth(1)
    .moveTo(MARGIN, doc.y)
    .lineTo(doc.page.width - MARGIN, doc.y)
    .stroke();
  doc.moveDown(0.7);
}

function drawParties(doc: PDFKit.PDFDocument, customer: Customer) {
  ensureSpace(doc, 110);
  const colW = (doc.page.width - MARGIN * 2 - 16) / 2;
  const y0 = doc.y;

  drawPartyBox(doc, MARGIN, y0, colW, "Auftragnehmer", [
    "Systemhaus-Ess",
    "IT-Dienstleistungen & Support",
  ]);

  const address = [
    customer.company || customer.name,
    customer.contactPerson ? `z. Hd. ${customer.contactPerson}` : null,
    customer.address,
    [customer.zip, customer.city].filter(Boolean).join(" ") || null,
    customer.country,
    customer.email,
    customer.phone,
  ].filter(Boolean) as string[];

  drawPartyBox(doc, MARGIN + colW + 16, y0, colW, "Auftraggeber", address.length ? address : [customer.name]);

  doc.y = y0 + 108;
  doc.x = MARGIN;
  doc.moveDown(0.4);
}

function drawPartyBox(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  title: string,
  lines: string[],
) {
  doc.save().roundedRect(x, y, w, 100, 8).fill(SOFT).restore();
  doc.save().roundedRect(x, y, w, 100, 8).stroke(RULE).restore();
  doc.font("Helvetica-Bold").fontSize(8).fillColor(ACCENT).text(title.toUpperCase(), x + 12, y + 12, {
    characterSpacing: 0.8,
  });
  doc.font("Helvetica").fontSize(10).fillColor(TEXT);
  let ty = y + 28;
  for (const line of lines.slice(0, 5)) {
    doc.text(line, x + 12, ty, { width: w - 24, lineBreak: false });
    ty += 13;
  }
}

function drawMeta(doc: PDFKit.PDFDocument, contract: Contract) {
  ensureSpace(doc, 70);
  const items: [string, string][] = [
    ["Vertragsnr.", contract.contractNumber || "–"],
    ["Status", statusLabel[contract.status] ?? contract.status],
    ["Beginn", formatDate(contract.startDate)],
    ["Ende", formatDate(contract.endDate)],
  ];
  const gap = 8;
  const boxW = (doc.page.width - MARGIN * 2 - gap * 3) / 4;
  const y = doc.y;
  items.forEach(([label, value], i) => {
    const x = MARGIN + i * (boxW + gap);
    doc.save().roundedRect(x, y, boxW, 48, 7).fillAndStroke("#fff", RULE).restore();
    doc.font("Helvetica").fontSize(7.5).fillColor(MUTED).text(label.toUpperCase(), x + 8, y + 9);
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor(TEXT)
      .text(value, x + 8, y + 24, { width: boxW - 16 });
  });
  doc.y = y + 58;
  doc.x = MARGIN;
}

function drawSection(doc: PDFKit.PDFDocument, title: string, body: () => void) {
  ensureSpace(doc, 48);
  doc.moveDown(0.35);
  doc.font("Helvetica-Bold").fontSize(12).fillColor(TEXT).text(title);
  doc
    .strokeColor(ACCENT)
    .lineWidth(1.5)
    .moveTo(MARGIN, doc.y + 2)
    .lineTo(MARGIN + 36, doc.y + 2)
    .stroke();
  doc.moveDown(0.55);
  body();
}

function drawSlaTable(doc: PDFKit.PDFDocument, contract: Contract) {
  const normal = contract.responseNormalHours ?? contract.slaResponseHours ?? null;
  const rows: [string, number | null, number | null][] = [
    ["Kritisch (P1)", contract.responseCriticalHours, contract.resolveCriticalHours],
    ["Hoch (P2)", contract.responseHighHours, contract.resolveHighHours],
    ["Normal (P3)", normal, contract.resolveNormalHours],
    ["Niedrig (P4)", contract.responseLowHours, contract.resolveLowHours],
  ];

  const tableW = doc.page.width - MARGIN * 2;
  const cols = [tableW * 0.4, tableW * 0.3, tableW * 0.3];
  ensureSpace(doc, 28 + rows.length * 26);

  const headY = doc.y;
  drawTableRow(doc, headY, cols, ["Priorität", "Reaktionszeit", "Ziel-Lösungszeit"], true);
  let y = headY + 24;
  for (const [prio, response, resolve] of rows) {
    drawTableRow(doc, y, cols, [prio, formatHours(response), formatHours(resolve)], false);
    y += 24;
  }
  doc.y = y + 8;
  doc.x = MARGIN;
}

function drawTableRow(
  doc: PDFKit.PDFDocument,
  y: number,
  cols: number[],
  cells: string[],
  header: boolean,
) {
  let x = MARGIN;
  for (let i = 0; i < cols.length; i++) {
    const w = cols[i]!;
    doc
      .save()
      .rect(x, y, w, 24)
      .fillAndStroke(header ? "#eff6ff" : i === 0 ? SOFT : "#fff", RULE)
      .restore();
    doc
      .font(header || i === 0 ? "Helvetica-Bold" : "Helvetica")
      .fontSize(header ? 8 : 10)
      .fillColor(header ? ACCENT : TEXT)
      .text(cells[i] ?? "–", x + 8, y + (header ? 8 : 7), {
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

  ensureSpace(doc, 80);
  const colW = (doc.page.width - MARGIN * 2 - 16) / 2;
  const y0 = doc.y;
  drawContactColumn(doc, MARGIN, y0, colW, "Operativ", left);
  drawContactColumn(doc, MARGIN + colW + 16, y0, colW, "Eskalation", right);
  doc.y = y0 + 86;
  doc.x = MARGIN;
}

function drawContactColumn(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  title: string,
  rows: [string, string][],
) {
  doc.save().roundedRect(x, y, w, 78, 8).fillAndStroke("#fff", RULE).restore();
  doc.font("Helvetica-Bold").fontSize(8).fillColor(ACCENT).text(title.toUpperCase(), x + 10, y + 10);
  let ty = y + 26;
  for (const [label, value] of rows) {
    doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(label, x + 10, ty, { width: 70 });
    doc.font("Helvetica").fontSize(9).fillColor(TEXT).text(value, x + 80, ty, { width: w - 90 });
    ty += 16;
  }
}

function drawSignatures(doc: PDFKit.PDFDocument, customerLabel: string) {
  ensureSpace(doc, 120);
  doc.moveDown(1.2);
  doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(
    `Erstellt am ${formatDateTime(new Date())} · Verbindliche Leistungen ergeben sich aus diesem Dokument und etwaigen Anlagen.`,
  );
  doc.moveDown(1.4);

  const colW = (doc.page.width - MARGIN * 2 - 24) / 2;
  const y = doc.y + 36;
  for (let i = 0; i < 2; i++) {
    const x = MARGIN + i * (colW + 24);
    doc
      .strokeColor(RULE)
      .lineWidth(1)
      .moveTo(x, y)
      .lineTo(x + colW, y)
      .stroke();
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(MUTED)
      .text(i === 0 ? "Systemhaus-Ess · Datum / Unterschrift" : `${customerLabel} · Datum / Unterschrift`, x, y + 8, {
        width: colW,
      });
  }
  doc.y = y + 40;
}

function paintFooter(
  doc: PDFKit.PDFDocument,
  customerLabel: string,
  contract: Contract,
  pageNo: number,
  total: number,
) {
  const bottom = doc.page.height - 32;
  doc.save();
  doc
    .strokeColor(RULE)
    .lineWidth(0.6)
    .moveTo(MARGIN, bottom - 10)
    .lineTo(doc.page.width - MARGIN, bottom - 10)
    .stroke();
  doc.font("Helvetica").fontSize(8).fillColor(MUTED);
  const left = `Systemhaus-Ess · ${contract.contractNumber || contract.title} · ${customerLabel}`;
  doc.text(left, MARGIN, bottom - 4, {
    width: doc.page.width - MARGIN * 2 - 60,
    lineBreak: false,
  });
  doc.text(`${pageNo} / ${total}`, doc.page.width - MARGIN - 48, bottom - 4, {
    width: 48,
    align: "right",
    lineBreak: false,
  });
  doc.restore();
}

function paragraph(doc: PDFKit.PDFDocument, text: string) {
  doc.font("Helvetica").fontSize(10).fillColor(TEXT).text(text, {
    width: doc.page.width - MARGIN * 2,
    align: "left",
    lineGap: 2,
  });
  doc.moveDown(0.35);
}

function kv(doc: PDFKit.PDFDocument, label: string, value: string) {
  ensureSpace(doc, 22);
  const y = doc.y;
  doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(label, MARGIN, y, { width: 150 });
  doc.font("Helvetica").fontSize(10).fillColor(TEXT).text(value, MARGIN + 150, y, {
    width: doc.page.width - MARGIN * 2 - 150,
  });
  doc.y = Math.max(doc.y, y + 16);
  doc.x = MARGIN;
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  if (doc.y + needed > doc.page.height - MARGIN - 40) doc.addPage();
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
