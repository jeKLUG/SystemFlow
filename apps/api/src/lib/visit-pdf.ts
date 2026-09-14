import PDFDocument from "pdfkit";
import type { Asset, Customer, Project, Task, TimeEntry } from "../db/schema.js";
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

const MAX_ASSETS = 40;
const MAX_TASKS = 25;
const MAX_TIMES = 30;

const assetKindLabel: Record<string, string> = {
  pc: "PC",
  laptop: "Notebook",
  tablet: "Tablet",
  server: "Server",
  firewall: "Firewall",
  switch: "Switch",
  router: "Router",
  access_point: "Access Point",
  printer: "Drucker",
  nas: "NAS",
  ups: "USV",
  phone: "Telefon",
  monitor: "Monitor",
  accessory: "Zubehör",
  software: "Software",
  license: "Lizenz",
  network: "Netzwerk",
  other: "Sonstiges",
};

const ownershipLabel: Record<string, string> = {
  customer: "Kunde",
  loaned: "Verliehen",
  held: "Bei uns",
};

export type VisitPdfInput = {
  customer: Customer;
  assets: Asset[];
  tasks: Task[];
  timeEntries: TimeEntry[];
  projects: Project[];
};

/**
 * Kompaktes Besuchsblatt-PDF: Kontakt, Anlagen, offene Aufgaben, offene Zeiten.
 */
export async function buildVisitPdf(input: VisitPdfInput): Promise<Buffer> {
  const { customer } = input;
  const customerLabel = customer.company?.trim() || customer.name;
  const headerTitle = "Besuchsblatt";
  const today = new Date();

  const assets = input.assets
    .filter((a) => a.status === "active" || a.status === "spare")
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
  const tasks = input.tasks
    .filter((t) => !t.done)
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return (a.dueDate || "9999").localeCompare(b.dueDate || "9999");
    });
  const times = input.timeEntries
    .filter((t) => t.billable && !t.billed)
    .sort((a, b) => b.workDate.localeCompare(a.workDate));
  const projectMap = new Map(input.projects.map((p) => [p.id, p.name]));
  const unbilledHours = round2(times.reduce((s, t) => s + (Number(t.hours) || 0), 0));
  const unbilledAmount = round2(
    times.reduce((s, t) => s + (t.amountSnapshot != null ? Number(t.amountSnapshot) : 0), 0),
  );

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
      Title: `Besuchsblatt – ${customerLabel}`,
      Author: "Systemhaus-Ess",
      Subject: `Besuchsblatt – ${customerLabel}`,
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

  drawHero(doc, customerLabel, today);
  drawContact(doc, customer);
  drawSummary(doc, {
    assets: assets.length,
    tasks: tasks.length,
    hours: unbilledHours,
    amount: unbilledAmount,
  });

  drawSection(doc, `Anlagen (${assets.length})`, () => {
    if (!assets.length) {
      muted(doc, "Keine aktiven Anlagen hinterlegt.");
      return;
    }
    const shown = assets.slice(0, MAX_ASSETS);
    const cols = colWidths(doc, [0.34, 0.16, 0.22, 0.28]);
    drawTableHeader(doc, cols, ["Name", "Typ", "Netzwerk", "Ort / Hinweis"]);
    for (const a of shown) {
      const net = [a.hostname, a.ipAddress].filter(Boolean).join(" · ") || "–";
      const hint =
        [a.location, a.status === "spare" ? "Ersatz" : null, ownershipLabel[a.ownership]]
          .filter(Boolean)
          .join(" · ") || "–";
      drawTableRow(doc, cols, [
        a.name,
        assetKindLabel[a.kind] ?? a.kind,
        net,
        hint,
      ]);
    }
    if (assets.length > shown.length) {
      muted(doc, `+${assets.length - shown.length} weitere Anlagen`);
    }
  });

  drawSection(doc, `Offene Aufgaben (${tasks.length})`, () => {
    if (!tasks.length) {
      muted(doc, "Keine offenen Aufgaben.");
      return;
    }
    const shown = tasks.slice(0, MAX_TASKS);
    const cols = colWidths(doc, [0.58, 0.14, 0.28]);
    drawTableHeader(doc, cols, ["Aufgabe", "Prio", "Fällig"]);
    for (const t of shown) {
      drawTableRow(doc, cols, [
        t.title,
        `P${t.priority}`,
        t.dueDate ? formatDate(t.dueDate) : "–",
      ]);
    }
    if (tasks.length > shown.length) {
      muted(doc, `+${tasks.length - shown.length} weitere Aufgaben`);
    }
  });

  drawSection(doc, `Offene Zeiten (${times.length})`, () => {
    if (!times.length) {
      muted(doc, "Keine abrechenbaren, noch offenen Zeiten.");
      return;
    }
    const shown = times.slice(0, MAX_TIMES);
    const cols = colWidths(doc, [0.16, 0.1, 0.42, 0.18, 0.14]);
    drawTableHeader(doc, cols, ["Datum", "Std.", "Beschreibung", "Projekt", "Betrag"]);
    for (const t of shown) {
      const amount =
        t.amountSnapshot != null ? formatMoney(Number(t.amountSnapshot)) : "–";
      drawTableRow(doc, cols, [
        formatDate(t.workDate),
        formatHours(Number(t.hours)),
        t.description?.trim() || "–",
        (t.projectId && projectMap.get(t.projectId)) || "–",
        amount,
      ]);
    }
    if (times.length > shown.length) {
      muted(doc, `+${times.length - shown.length} weitere Buchungen`);
    }
    doc.moveDown(0.35);
    doc
      .font("Helvetica-Bold")
      .fontSize(9.5)
      .fillColor(TEXT)
      .text(
        `Summe offen: ${formatHours(unbilledHours)} h` +
          (unbilledAmount > 0 ? ` · ${formatMoney(unbilledAmount)}` : ""),
      );
  });

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

function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  const bottom = contentBottom(doc);
  const top = contentTop(doc);
  if (doc.y + needed <= bottom) return;
  if (doc.y <= top + 2) return;
  doc.addPage();
  doc.x = MARGIN;
}

function drawHero(doc: PDFKit.PDFDocument, customerLabel: string, today: Date) {
  doc.font("Helvetica").fontSize(8).fillColor(ACCENT).text("BESUCH VOR ORT");
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
    .text(`Stand ${formatDateTime(today)} · nur zur Vor-Ort-Nutzung`);
  doc.moveDown(0.55);
  doc
    .strokeColor(RULE)
    .lineWidth(0.8)
    .moveTo(MARGIN, doc.y)
    .lineTo(MARGIN + contentWidth(doc), doc.y)
    .stroke();
  doc.moveDown(0.55);
}

function drawContact(doc: PDFKit.PDFDocument, customer: Customer) {
  const lines = [
    customer.contactPerson ? `Ansprechpartner: ${customer.contactPerson}` : null,
    customer.email ? `E-Mail: ${customer.email}` : null,
    customer.phone ? `Telefon: ${customer.phone}` : null,
    customer.mobile ? `Mobil: ${customer.mobile}` : null,
    customer.address || customer.zip || customer.city
      ? `Adresse: ${[customer.address, [customer.zip, customer.city].filter(Boolean).join(" ")]
          .filter(Boolean)
          .join(", ")}`
      : null,
    customer.notes?.trim() ? `Notiz: ${customer.notes.trim()}` : null,
  ].filter(Boolean) as string[];

  drawSection(doc, "Kontakt", () => {
    if (!lines.length) {
      muted(doc, "Keine Kontaktdaten hinterlegt.");
      return;
    }
    ensureSpace(doc, 20 + lines.length * 14);
    const y0 = doc.y;
    const h = 16 + lines.length * 13 + 10;
    doc.save().roundedRect(MARGIN, y0, contentWidth(doc), h, 7).fill(SOFT).restore();
    doc.save().roundedRect(MARGIN, y0, contentWidth(doc), h, 7).stroke(RULE).restore();
    let ty = y0 + 10;
    doc.font("Helvetica").fontSize(9.5).fillColor(TEXT);
    for (const line of lines) {
      doc.text(line, MARGIN + 10, ty, {
        width: contentWidth(doc) - 20,
        lineBreak: false,
        ellipsis: true,
        height: 12,
      });
      ty += 13;
    }
    doc.y = y0 + h + 6;
    doc.x = MARGIN;
  });
}

function drawSummary(
  doc: PDFKit.PDFDocument,
  stats: { assets: number; tasks: number; hours: number; amount: number },
) {
  const items: [string, string][] = [
    ["Anlagen", String(stats.assets)],
    ["Aufgaben offen", String(stats.tasks)],
    ["Zeiten offen", `${formatHours(stats.hours)} h`],
    ["Betrag offen", stats.amount > 0 ? formatMoney(stats.amount) : "–"],
  ];
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
      .fontSize(11)
      .fillColor(TEXT)
      .text(value, x + 8, y + 22, { width: boxW - 16, height: 16, ellipsis: true });
  });
  doc.y = y + 54;
  doc.x = MARGIN;
}

function drawSection(doc: PDFKit.PDFDocument, title: string, body: () => void) {
  ensureSpace(doc, 36);
  if (doc.y > contentTop(doc) + 4) doc.y += 4;
  doc.font("Helvetica-Bold").fontSize(11.5).fillColor(TEXT).text(title);
  doc.moveDown(0.4);
  body();
}

function muted(doc: PDFKit.PDFDocument, text: string) {
  doc.font("Helvetica").fontSize(9.5).fillColor(MUTED).text(text);
  doc.moveDown(0.25);
}

function colWidths(doc: PDFKit.PDFDocument, fractions: number[]): number[] {
  const w = contentWidth(doc);
  return fractions.map((f) => w * f);
}

function drawTableHeader(doc: PDFKit.PDFDocument, cols: number[], labels: string[]) {
  ensureSpace(doc, 22);
  const y = doc.y;
  const rowH = 18;
  doc.save().rect(MARGIN, y, contentWidth(doc), rowH).fill(SOFT).restore();
  let x = MARGIN;
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor(MUTED);
  labels.forEach((label, i) => {
    doc.text(label.toUpperCase(), x + 5, y + 5, {
      width: cols[i]! - 10,
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
  doc.font("Helvetica").fontSize(8.5).fillColor(TEXT);
  cells.forEach((cell, i) => {
    doc.text(cell || "–", x + 5, y + 3.5, {
      width: cols[i]! - 10,
      height: rowH - 4,
      lineBreak: false,
      ellipsis: true,
    });
    x += cols[i]!;
  });
  doc.y = y + rowH;
  doc.x = MARGIN;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "–";
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

function formatMoney(n: number): string {
  return `${n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
