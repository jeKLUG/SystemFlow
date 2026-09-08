import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PDF_MARGIN = 48;
export const PDF_HEADER_H = 42;
export const PDF_FOOTER_H = 36;
export const PDF_ACCENT = "#3b82f6";
export const PDF_MUTED = "#64748b";
export const PDF_TEXT = "#0f172a";
export const PDF_RULE = "#e2e8f0";

let cachedLogoPath: string | null | undefined;

/**
 * Pfad zum Navbar-Logo (`logo.png`), falls vorhanden.
 */
export function resolvePdfLogoPath(): string | null {
  if (cachedLogoPath !== undefined) return cachedLogoPath;

  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(process.cwd(), "apps/api/assets/logo.png"),
    path.join(process.cwd(), "assets/logo.png"),
    path.join(process.cwd(), "apps/web/public/logo.png"),
    path.join(process.cwd(), "apps/web/dist/logo.png"),
    path.join(here, "../../assets/logo.png"),
    path.join(here, "../../../web/public/logo.png"),
    path.join(here, "../../../../apps/web/public/logo.png"),
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        cachedLogoPath = candidate;
        return candidate;
      }
    } catch {
      /* ignore */
    }
  }
  cachedLogoPath = null;
  return null;
}

/**
 * Zeichnet das Systemhaus-Ess-Logo (PNG aus der Navbar) oder einen Vektor-Fallback.
 */
export function drawPdfLogo(doc: PDFKit.PDFDocument, x: number, y: number, size: number) {
  const logoPath = resolvePdfLogoPath();
  if (logoPath) {
    try {
      doc.image(logoPath, x, y, { width: size, height: size });
      return;
    } catch {
      /* Fallback unten */
    }
  }

  const r = size * 0.18;
  doc.save();
  doc.roundedRect(x, y, size, size, r).fill("#121b29");
  const cx = x + size / 2;
  const cy = y + size / 2;
  const s = size * 0.28;
  doc
    .strokeColor(PDF_ACCENT)
    .lineWidth(1.4)
    .moveTo(cx, cy - s)
    .lineTo(cx + s, cy - s * 0.45)
    .lineTo(cx + s, cy + s * 0.45)
    .lineTo(cx, cy + s)
    .lineTo(cx - s, cy + s * 0.45)
    .lineTo(cx - s, cy - s * 0.45)
    .closePath()
    .stroke();
  doc.circle(cx, cy, size * 0.08).fill(PDF_ACCENT);
  doc.restore();
}

/**
 * Zeichnet Text in den Randbereichen, ohne dass PDFKit wegen `maxY` neue Seiten anlegt.
 * (Fußzeilen-Text liegt unter der Bottom-Margin – sonst entstehen Leerseiten.)
 */
function withOpenMargins(doc: PDFKit.PDFDocument, paint: () => void) {
  const margins = doc.page.margins;
  const prevTop = margins.top;
  const prevBottom = margins.bottom;
  margins.top = 0;
  margins.bottom = 0;
  try {
    paint();
  } finally {
    margins.top = prevTop;
    margins.bottom = prevBottom;
  }
}

/**
 * Dezente PDF-Kopfzeile: Logo + Markenname + Seitentitel.
 */
export function paintPdfHeader(doc: PDFKit.PDFDocument, title: string) {
  withOpenMargins(doc, () => {
    const y = PDF_MARGIN - 4;
    doc.save();
    drawPdfLogo(doc, PDF_MARGIN, y, 20);
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(PDF_TEXT)
      .text("Systemhaus-Ess", PDF_MARGIN + 26, y + 5, {
        lineBreak: false,
        height: 12,
      });

    const titleX = PDF_MARGIN + 130;
    const titleW = doc.page.width - titleX - PDF_MARGIN;
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(PDF_MUTED)
      .text(title, titleX, y + 5, {
        width: titleW,
        align: "right",
        lineBreak: false,
        ellipsis: true,
        height: 14,
      });

    const ruleY = PDF_MARGIN + PDF_HEADER_H - 14;
    doc
      .strokeColor(PDF_RULE)
      .lineWidth(0.7)
      .moveTo(PDF_MARGIN, ruleY)
      .lineTo(doc.page.width - PDF_MARGIN, ruleY)
      .stroke();
    doc.restore();
  });
}

/**
 * Seitenzahl unten mittig.
 */
export function paintPdfFooter(doc: PDFKit.PDFDocument, pageNo: number, total: number) {
  withOpenMargins(doc, () => {
    const y = doc.page.height - PDF_MARGIN - 8;
    doc.save();
    doc
      .strokeColor(PDF_RULE)
      .lineWidth(0.7)
      .moveTo(PDF_MARGIN, y - 12)
      .lineTo(doc.page.width - PDF_MARGIN, y - 12)
      .stroke();
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(PDF_MUTED)
      .text(`${pageNo} / ${total}`, PDF_MARGIN, y - 6, {
        width: doc.page.width - PDF_MARGIN * 2,
        align: "center",
        lineBreak: false,
        height: 12,
      });
    doc.restore();
  });
}
