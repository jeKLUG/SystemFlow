import PDFDocument from "pdfkit";
import {
  paintPdfFooter,
  paintPdfHeader,
  PDF_FOOTER_H,
  PDF_HEADER_H,
  PDF_MARGIN,
} from "./pdf-chrome.js";

export type WikiPdfDoc = {
  title: string;
  type: string;
  content: string;
  updatedAt?: string | Date | null;
  createdAt?: string | Date | null;
};

export type WikiPdfCustomer = {
  name: string;
  company?: string | null;
};

/** Löst TipTap-Bild-URLs in lokale Dateipfade auf. */
export type WikiPdfImageResolver = (src: string) => string | null | undefined;

export type WikiPdfOptions = {
  resolveImage?: WikiPdfImageResolver;
};

type TipTapMark = { type?: string };
type TipTapNode = {
  type?: string;
  text?: string;
  marks?: TipTapMark[];
  content?: TipTapNode[];
  attrs?: Record<string, unknown>;
};

const MARGIN = PDF_MARGIN;
const HEADER_H = PDF_HEADER_H;
const FOOTER_H = PDF_FOOTER_H;
const ACCENT = "#3b82f6";
const MUTED = "#64748b";
const TEXT = "#0f172a";
const RULE = "#e2e8f0";
const SOFT = "#f8fafc";

const CALLOUT: Record<string, { bar: string; bg: string; label: string }> = {
  info: { bar: "#60a5fa", bg: "#eff6ff", label: "Info" },
  warn: { bar: "#fbbf24", bg: "#fffbeb", label: "Warnung" },
  tip: { bar: "#34d399", bg: "#ecfdf5", label: "Hinweis" },
  danger: { bar: "#f87171", bg: "#fef2f2", label: "Wichtig" },
};

/**
 * Erzeugt ein schlichtes Wiki-PDF: Kopfzeile (Logo + Titel), Inhalt wie im Editor, Seitenzahl.
 */
export async function buildWikiPdf(
  customer: WikiPdfCustomer,
  docs: WikiPdfDoc[],
  options: WikiPdfOptions = {},
): Promise<Buffer> {
  const sorted = [...docs].sort((a, b) => a.title.localeCompare(b.title, "de"));
  const customerLabel = customer.company?.trim() || customer.name;
  const resolveImage = options.resolveImage;
  const pageTitles: string[] = [];
  let activeTitle = sorted[0]?.title?.trim() || "Wiki";

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
      Title: sorted.length === 1 ? sorted[0]!.title : `Wiki – ${customerLabel}`,
      Author: "Systemhaus-Ess",
      Subject: `Wiki-Export für ${customerLabel}`,
      Creator: "Systemhaus-Ess",
    },
  });

  pageTitles.push(activeTitle);
  doc.on("pageAdded", () => {
    pageTitles.push(activeTitle);
  });

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));

  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  if (sorted.length === 0) {
    activeTitle = "Wiki";
    pageTitles[0] = activeTitle;
    doc.font("Helvetica").fontSize(11).fillColor(MUTED).text("Keine Wiki-Seiten vorhanden.");
  } else {
    for (let i = 0; i < sorted.length; i++) {
      const page = sorted[i]!;
      activeTitle = page.title?.trim() || "Ohne Titel";
      if (i > 0) {
        doc.addPage();
      } else {
        pageTitles[0] = activeTitle;
      }
      renderBody(doc, page, resolveImage);
    }
  }

  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const title = pageTitles[i] ?? activeTitle;
    paintPdfHeader(doc, title);
    paintPdfFooter(doc, i + 1, range.count);
  }

  doc.end();
  return done;
}

function contentBottom(doc: PDFKit.PDFDocument): number {
  return doc.page.height - doc.page.margins.bottom;
}

function contentTop(doc: PDFKit.PDFDocument): number {
  return doc.page.margins.top;
}

/**
 * Seitenumbruch nur wenn nötig – nicht am Seitenanfang (keine Leerseiten-Ketten).
 */
function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  const bottom = contentBottom(doc);
  const top = contentTop(doc);
  if (doc.y + needed <= bottom) return;
  if (doc.y <= top + 2) return;
  doc.addPage();
}

function renderBody(
  doc: PDFKit.PDFDocument,
  page: WikiPdfDoc,
  resolveImage?: WikiPdfImageResolver,
) {
  doc.x = MARGIN;
  doc.y = contentTop(doc);

  const nodes = trimEmptyNodes(parseTipTap(page.content));
  if (!nodes.length) {
    doc.font("Helvetica-Oblique").fontSize(10).fillColor(MUTED).text("Kein Inhalt.");
    return;
  }
  renderNodes(doc, nodes, { listDepth: 0, resolveImage, atBlockStart: true });
}

function parseTipTap(raw: string): TipTapNode[] {
  try {
    const parsed = JSON.parse(raw) as TipTapNode;
    if (parsed?.type === "doc" && Array.isArray(parsed.content)) return parsed.content;
  } catch {
    /* plain text */
  }
  const text = raw?.trim();
  if (!text) return [];
  return [{ type: "paragraph", content: [{ type: "text", text }] }];
}

/** Entfernt leere Absätze vollständig (kein künstliches Spacing). */
function trimEmptyNodes(nodes: TipTapNode[]): TipTapNode[] {
  return nodes.filter((node) => !isVisuallyEmpty(node));
}

function isVisuallyEmpty(node: TipTapNode): boolean {
  if (!node?.type) return true;
  if (node.type === "hardBreak" || node.type === "horizontalRule") return false;
  if (node.type === "image" || node.type === "imageResize" || node.type === "table") return false;
  if (node.type === "paragraph" || node.type === "heading") {
    return !collectText(node.content ?? []).trim();
  }
  if (node.type === "bulletList" || node.type === "orderedList" || node.type === "taskList") {
    return !(node.content ?? []).some((item) => !isVisuallyEmpty(item));
  }
  if (
    node.type === "listItem" ||
    node.type === "taskItem" ||
    node.type === "blockquote" ||
    node.type === "callout" ||
    node.type === "codeBlock"
  ) {
    return (
      !collectText(node.content ?? []).trim() &&
      !(node.content ?? []).some((c) => !isVisuallyEmpty(c))
    );
  }
  if (node.content?.length) return node.content.every(isVisuallyEmpty);
  return !node.text?.trim();
}

function spaceBefore(doc: PDFKit.PDFDocument, atBlockStart: boolean, amount: number) {
  if (atBlockStart) return;
  if (doc.y <= contentTop(doc) + 1) return;
  doc.y += amount;
}

function renderNodes(
  doc: PDFKit.PDFDocument,
  nodes: TipTapNode[],
  ctx: {
    listDepth: number;
    resolveImage?: WikiPdfImageResolver;
    atBlockStart?: boolean;
    contentWidth?: number;
  },
) {
  let atStart = Boolean(ctx.atBlockStart);
  const width = ctx.contentWidth ?? doc.page.width - MARGIN * 2;

  for (const node of nodes) {
    if (!node?.type || isVisuallyEmpty(node)) continue;

    switch (node.type) {
      case "heading": {
        const level = Number(node.attrs?.level ?? 1);
        const size = level === 1 ? 16 : level === 2 ? 13 : 11.5;
        spaceBefore(doc, atStart, level === 1 ? 14 : 10);
        ensureSpace(doc, size + 10);
        doc.font("Helvetica-Bold").fontSize(size).fillColor(TEXT);
        renderInline(doc, node.content ?? [], { bold: true, width, size });
        doc.moveDown(0.25);
        break;
      }
      case "paragraph": {
        spaceBefore(doc, atStart, 6);
        ensureSpace(doc, 16);
        doc.font("Helvetica").fontSize(10.5).fillColor(TEXT);
        renderInline(doc, node.content ?? [], { width, size: 10.5 });
        doc.moveDown(0.35);
        break;
      }
      case "bulletList":
        spaceBefore(doc, atStart, 4);
        renderList(doc, node.content ?? [], false, ctx);
        break;
      case "orderedList":
        spaceBefore(doc, atStart, 4);
        renderList(doc, node.content ?? [], true, ctx);
        break;
      case "taskList":
        spaceBefore(doc, atStart, 4);
        renderTaskList(doc, node.content ?? [], ctx);
        break;
      case "blockquote": {
        spaceBefore(doc, atStart, 8);
        renderBlockquote(doc, node.content ?? [], width);
        break;
      }
      case "callout": {
        spaceBefore(doc, atStart, 8);
        renderCallout(doc, node, width, ctx.resolveImage);
        break;
      }
      case "codeBlock": {
        spaceBefore(doc, atStart, 8);
        renderCodeBlock(doc, node, width);
        break;
      }
      case "horizontalRule": {
        spaceBefore(doc, atStart, 8);
        ensureSpace(doc, 12);
        const y = doc.y + 2;
        doc
          .strokeColor(RULE)
          .lineWidth(0.8)
          .moveTo(MARGIN, y)
          .lineTo(MARGIN + width, y)
          .stroke();
        doc.y = y + 10;
        break;
      }
      case "table":
        spaceBefore(doc, atStart, 8);
        renderTable(doc, node, width);
        break;
      case "image":
      case "imageResize":
        spaceBefore(doc, atStart, 8);
        renderImage(doc, node, width, ctx.resolveImage);
        break;
      default:
        if (node.content?.length) {
          renderNodes(doc, node.content, { ...ctx, atBlockStart: atStart });
        }
        break;
    }
    atStart = false;
  }
}

function renderBlockquote(doc: PDFKit.PDFDocument, nodes: TipTapNode[], width: number) {
  const text = collectText(nodes);
  if (!text) return;
  doc.font("Helvetica-Oblique").fontSize(10).fillColor(MUTED);
  const h = doc.heightOfString(text, { width: width - 14 });
  ensureSpace(doc, h + 10);
  const y0 = doc.y;
  doc
    .save()
    .strokeColor(ACCENT)
    .lineWidth(2.5)
    .moveTo(MARGIN, y0)
    .lineTo(MARGIN, y0 + h)
    .stroke()
    .restore();
  doc.x = MARGIN + 10;
  renderInline(doc, flattenToParagraphs(nodes), {
    italic: true,
    width: width - 14,
    size: 10,
  });
  doc.x = MARGIN;
  doc.y = Math.max(doc.y, y0 + h) + 6;
}

function flattenToParagraphs(nodes: TipTapNode[]): TipTapNode[] {
  const out: TipTapNode[] = [];
  for (const n of nodes) {
    if (n.type === "paragraph" && n.content) out.push(...n.content);
    else if (n.content) out.push(...flattenToParagraphs(n.content));
    else if (n.type === "text") out.push(n);
  }
  return out;
}

function renderCallout(
  doc: PDFKit.PDFDocument,
  node: TipTapNode,
  width: number,
  resolveImage?: WikiPdfImageResolver,
) {
  const variant = String(node.attrs?.variant ?? "info");
  const style = CALLOUT[variant] ?? CALLOUT.info!;
  const inner = (node.content ?? []).filter((n) => !isVisuallyEmpty(n));
  if (!inner.length) return;

  ensureSpace(doc, 28);
  const y0 = doc.y;
  const padX = 12;
  const innerW = width - padX - 6;

  doc
    .font("Helvetica-Bold")
    .fontSize(7.5)
    .fillColor(style.bar)
    .text(style.label.toUpperCase(), MARGIN + padX, y0, {
      width: innerW,
      lineBreak: false,
    });
  doc.y = y0 + 12;
  doc.x = MARGIN + padX;
  renderNodes(doc, inner, {
    listDepth: 0,
    resolveImage,
    atBlockStart: true,
    contentWidth: innerW,
  });

  const y1 = Math.max(doc.y, y0 + 20);
  doc
    .save()
    .strokeColor(style.bar)
    .lineWidth(3)
    .moveTo(MARGIN + 1.5, y0)
    .lineTo(MARGIN + 1.5, y1)
    .stroke()
    .restore();

  doc.x = MARGIN;
  doc.y = y1 + 8;
}

function renderCodeBlock(doc: PDFKit.PDFDocument, node: TipTapNode, width: number) {
  const text = collectText(node.content ?? []);
  if (!text) return;
  const lines = text.split("\n");
  doc.font("Courier").fontSize(8.5).fillColor(TEXT);
  const lineH = 11;
  const pad = 10;
  const boxH = lines.length * lineH + pad * 2;
  ensureSpace(doc, Math.min(boxH + 4, contentBottom(doc) - contentTop(doc) - 8));

  const y0 = doc.y;
  doc.save().roundedRect(MARGIN, y0, width, boxH, 5).fill(SOFT).restore();
  doc
    .save()
    .strokeColor(RULE)
    .lineWidth(0.6)
    .roundedRect(MARGIN, y0, width, boxH, 5)
    .stroke()
    .restore();

  let y = y0 + pad;
  const gutterW = String(lines.length).length * 5 + 8;
  for (let i = 0; i < lines.length; i++) {
    doc
      .font("Courier")
      .fontSize(8)
      .fillColor(MUTED)
      .text(String(i + 1), MARGIN + 8, y, { width: gutterW, lineBreak: false });
    doc
      .font("Courier")
      .fontSize(8.5)
      .fillColor(TEXT)
      .text(lines[i] || " ", MARGIN + 8 + gutterW + 6, y, {
        width: width - gutterW - 22,
        lineBreak: false,
      });
    y += lineH;
  }
  doc.y = y0 + boxH + 8;
  doc.x = MARGIN;
}

function renderImage(
  doc: PDFKit.PDFDocument,
  node: TipTapNode,
  width: number,
  resolveImage?: WikiPdfImageResolver,
) {
  const alt = String(node.attrs?.alt ?? "Bild");
  const src = String(node.attrs?.src ?? "");
  const filePath = src && resolveImage ? resolveImage(src) : null;

  if (filePath) {
    try {
      const openImage = (
        doc as PDFKit.PDFDocument & {
          openImage: (src: string) => { width: number; height: number };
        }
      ).openImage.bind(doc);
      const img = openImage(filePath);
      const natW = Math.max(1, img.width);
      const natH = Math.max(1, img.height);

      const pad = 5;
      const gap = 12;
      const pageInnerH = contentBottom(doc) - contentTop(doc) - 4;
      const maxH = Math.min(pageInnerH, 560);

      const intendedW = resolveImageDisplayWidth(node.attrs, width, natW);
      let drawW = intendedW;
      let drawH = (natH / natW) * drawW;
      if (drawH > maxH) {
        drawH = maxH;
        drawW = (natW / natH) * drawH;
      }

      const boxH = drawH + pad * 2;
      ensureSpace(doc, Math.min(boxH + gap, pageInnerH));

      const avail = contentBottom(doc) - doc.y - gap;
      if (boxH > avail && avail > 96) {
        const scale = (avail - pad * 2) / drawH;
        drawW *= scale;
        drawH *= scale;
      }

      const frameW = drawW + pad * 2;
      const frameH = drawH + pad * 2;
      const align = resolveImageAlign(node.attrs);
      let x = MARGIN;
      if (align === "center") x = MARGIN + (width - frameW) / 2;
      else if (align === "right") x = MARGIN + width - frameW;

      const y0 = doc.y;
      doc
        .save()
        .roundedRect(x, y0, frameW, frameH, 6)
        .fillAndStroke("#ffffff", RULE)
        .restore();
      doc.image(filePath, x + pad, y0 + pad, { width: drawW, height: drawH });
      doc.y = y0 + frameH + gap;
      doc.x = MARGIN;
      return;
    } catch {
      /* fallback */
    }
  }

  ensureSpace(doc, 16);
  doc.font("Helvetica-Oblique").fontSize(9).fillColor(MUTED).text(`[Bild: ${alt}]`);
  doc.moveDown(0.3);
}

/** Anzeigebreite aus Editor-Attrs bzw. sinnvolle Fallback-Größe. */
function resolveImageDisplayWidth(
  attrs: Record<string, unknown> | undefined,
  contentWidth: number,
  naturalWidth: number,
): number {
  const fromAttr = parsePositiveNumber(attrs?.width);
  const fromStyle = parseCssPxWidth(attrs?.containerStyle);
  const intended = fromAttr ?? fromStyle;
  if (intended != null) return Math.min(Math.max(intended, 48), contentWidth);

  // Ohne explizite Größe: große Fotos/Screenshots über die volle Textbreite,
  // kleine Grafiken in natürlicher Größe belassen.
  if (naturalWidth >= contentWidth * 0.85) return contentWidth;
  return Math.min(naturalWidth, contentWidth);
}

function parsePositiveNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string") {
    const n = Number.parseFloat(value.replace(/px$/i, "").trim());
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function parseCssPxWidth(style: unknown): number | null {
  if (typeof style !== "string" || !style.trim()) return null;
  const m = /(?:^|;)\s*width\s*:\s*([0-9.]+)px\b/i.exec(style);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function resolveImageAlign(attrs: Record<string, unknown> | undefined): "left" | "center" | "right" {
  const wrap = String(attrs?.wrapperStyle ?? "");
  const container = String(attrs?.containerStyle ?? "");
  const style = `${wrap};${container}`;
  if (/float\s*:\s*right/i.test(style)) return "right";
  if (/float\s*:\s*left/i.test(style)) return "left";
  if (/text-align\s*:\s*right/i.test(style)) return "right";
  if (/text-align\s*:\s*center/i.test(style)) return "center";
  if (/margin-left\s*:\s*auto/i.test(style) && /margin-right\s*:\s*auto/i.test(style)) return "center";
  if (/margin-left\s*:\s*auto/i.test(style)) return "right";
  return "center";
}

function renderList(
  doc: PDFKit.PDFDocument,
  items: TipTapNode[],
  ordered: boolean,
  ctx: { listDepth: number; resolveImage?: WikiPdfImageResolver },
) {
  const depth = ctx.listDepth;
  let index = 0;
  for (const item of items) {
    if (item.type !== "listItem" || isVisuallyEmpty(item)) continue;
    index += 1;
    ensureSpace(doc, 16);
    const indent = MARGIN + depth * 14;
    const bullet = ordered ? `${index}.` : "•";
    const y = doc.y;
    doc.font("Helvetica").fontSize(10.5).fillColor(TEXT);
    doc.text(bullet, indent, y, { width: 16, lineBreak: false });
    doc.x = indent + 16;
    for (const child of item.content ?? []) {
      if (child.type === "paragraph") {
        const text = collectText(child.content ?? []);
        if (!text) continue;
        renderInline(doc, child.content ?? [], {
          width: doc.page.width - indent - 16 - MARGIN,
          size: 10.5,
        });
        doc.moveDown(0.15);
      } else if (child.type === "bulletList" || child.type === "orderedList") {
        renderList(doc, child.content ?? [], child.type === "orderedList", {
          listDepth: depth + 1,
          resolveImage: ctx.resolveImage,
        });
      } else if (child.content) {
        renderNodes(doc, [child], {
          listDepth: depth + 1,
          resolveImage: ctx.resolveImage,
          atBlockStart: false,
        });
      }
    }
    doc.x = MARGIN;
  }
  doc.moveDown(0.2);
}

function renderTaskList(
  doc: PDFKit.PDFDocument,
  items: TipTapNode[],
  ctx: { listDepth: number; resolveImage?: WikiPdfImageResolver },
) {
  const depth = ctx.listDepth;
  for (const item of items) {
    if (item.type !== "taskItem" || isVisuallyEmpty(item)) continue;
    ensureSpace(doc, 16);
    const indent = MARGIN + depth * 14;
    const checked = Boolean(item.attrs?.checked);
    const y = doc.y;
    doc
      .save()
      .strokeColor(checked ? ACCENT : RULE)
      .lineWidth(1)
      .roundedRect(indent, y + 1, 9, 9, 1.5)
      .stroke();
    if (checked) {
      doc
        .strokeColor(ACCENT)
        .lineWidth(1.2)
        .moveTo(indent + 2, y + 5.5)
        .lineTo(indent + 4, y + 7.5)
        .lineTo(indent + 7.5, y + 3)
        .stroke();
    }
    doc.restore();
    doc.x = indent + 14;
    doc.font("Helvetica").fontSize(10.5).fillColor(checked ? MUTED : TEXT);
    for (const child of item.content ?? []) {
      if (child.type === "paragraph") {
        const text = collectText(child.content ?? []);
        if (!text) continue;
        renderInline(doc, child.content ?? [], {
          width: doc.page.width - indent - 14 - MARGIN,
          size: 10.5,
        });
        doc.moveDown(0.12);
      } else if (child.type === "taskList") {
        renderTaskList(doc, child.content ?? [], {
          listDepth: depth + 1,
          resolveImage: ctx.resolveImage,
        });
      }
    }
    doc.x = MARGIN;
  }
  doc.moveDown(0.2);
}

function renderTable(doc: PDFKit.PDFDocument, table: TipTapNode, width: number) {
  const rows = (table.content ?? []).filter((r) => r.type === "tableRow");
  if (!rows.length) return;
  const colCount = Math.max(
    ...rows.map(
      (r) =>
        (r.content ?? []).filter((c) => c.type === "tableCell" || c.type === "tableHeader").length,
    ),
    1,
  );
  const colW = width / colCount;

  for (const row of rows) {
    const cells = (row.content ?? []).filter(
      (c) => c.type === "tableCell" || c.type === "tableHeader",
    );
    const texts = cells.map((c) => collectText(c.content ?? []) || " ");
    const isHeader = cells.some((c) => c.type === "tableHeader");
    doc.font(isHeader ? "Helvetica-Bold" : "Helvetica").fontSize(9);
    const heights = texts.map((t) => doc.heightOfString(t, { width: colW - 10 }));
    const rowH = Math.max(...heights, 14) + 8;
    ensureSpace(doc, Math.min(rowH + 2, contentBottom(doc) - contentTop(doc) - 4));
    const y = doc.y;
    for (let i = 0; i < colCount; i++) {
      const x = MARGIN + i * colW;
      doc
        .save()
        .rect(x, y, colW, rowH)
        .fillAndStroke(isHeader ? "#eff6ff" : "#ffffff", RULE)
        .restore();
      doc.fillColor(TEXT).text(texts[i] ?? "", x + 5, y + 4, {
        width: colW - 10,
        height: rowH - 6,
      });
    }
    doc.y = y + rowH;
    doc.x = MARGIN;
  }
  doc.moveDown(0.35);
}

function renderInline(
  doc: PDFKit.PDFDocument,
  nodes: TipTapNode[],
  opts: { bold?: boolean; italic?: boolean; width?: number; size?: number },
) {
  const width = opts.width ?? doc.page.width - doc.x - MARGIN;
  const size = opts.size ?? 10.5;
  const segments = flattenInline(nodes).filter((s) => s.text.length > 0);
  if (!segments.length) return;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const bold = opts.bold || seg.bold;
    const italic = opts.italic || seg.italic;
    let font = "Helvetica";
    if (bold && italic) font = "Helvetica-BoldOblique";
    else if (bold) font = "Helvetica-Bold";
    else if (italic) font = "Helvetica-Oblique";
    doc.font(font).fontSize(size).fillColor(TEXT);
    doc.text(seg.text, {
      width,
      continued: i < segments.length - 1,
      underline: seg.underline,
      lineGap: 2,
    });
  }
}

function flattenInline(
  nodes: TipTapNode[],
): { text: string; bold: boolean; italic: boolean; underline: boolean }[] {
  const out: { text: string; bold: boolean; italic: boolean; underline: boolean }[] = [];
  for (const n of nodes) {
    if (n.type === "hardBreak") {
      out.push({ text: "\n", bold: false, italic: false, underline: false });
      continue;
    }
    if (n.type === "text" && n.text) {
      const marks = n.marks ?? [];
      out.push({
        text: n.text,
        bold: marks.some((m) => m.type === "bold"),
        italic: marks.some((m) => m.type === "italic"),
        underline: marks.some((m) => m.type === "underline"),
      });
      continue;
    }
    if (n.content?.length) out.push(...flattenInline(n.content));
  }
  return out;
}

function collectText(nodes: TipTapNode[]): string {
  return flattenInline(nodes)
    .map((s) => s.text)
    .join("")
    .trim();
}
