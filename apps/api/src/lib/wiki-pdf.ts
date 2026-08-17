import PDFDocument from "pdfkit";

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

const typeLabel: Record<string, string> = {
  note: "Notiz",
  protocol: "Protokoll",
  documentation: "Dokumentation",
  article: "Artikel",
  workflow: "Workflow",
};

type TipTapMark = { type?: string };
type TipTapNode = {
  type?: string;
  text?: string;
  marks?: TipTapMark[];
  content?: TipTapNode[];
  attrs?: Record<string, unknown>;
};

const MARGIN = 52;
const FOOTER_H = 40;
const ACCENT = "#2563eb";
const MUTED = "#64748b";
const TEXT = "#0f172a";
const RULE = "#e2e8f0";
const SOFT = "#f8fafc";

/**
 * Erzeugt ein PDF für eine oder mehrere Wiki-Seiten.
 * Vermeidet unnötige Leerseiten (leere Absätze, übertriebenes Page-Break).
 */
export async function buildWikiPdf(
  customer: WikiPdfCustomer,
  docs: WikiPdfDoc[],
  options: WikiPdfOptions = {},
): Promise<Buffer> {
  const sorted = [...docs].sort((a, b) => a.title.localeCompare(b.title, "de"));
  const customerLabel = customer.company?.trim() || customer.name;
  const stamp = new Date();
  const resolveImage = options.resolveImage;

  const doc = new PDFDocument({
    size: "A4",
    bufferPages: true,
    autoFirstPage: true,
    margins: { top: MARGIN, bottom: MARGIN + 28, left: MARGIN, right: MARGIN },
    info: {
      Title: sorted.length === 1 ? sorted[0]!.title : `Wiki – ${customerLabel}`,
      Author: "Systemhaus-Ess",
      Subject: `Wiki-Export für ${customerLabel}`,
      Creator: "Systemhaus-Ess",
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));

  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  if (sorted.length === 0) {
    doc.font("Helvetica-Bold").fontSize(18).fillColor(TEXT).text("Keine Wiki-Seiten");
    doc
      .font("Helvetica")
      .fontSize(11)
      .fillColor(MUTED)
      .text("Für diesen Kunden liegen keine Dokumente vor.");
  } else if (sorted.length === 1) {
    renderDocument(doc, sorted[0]!, customerLabel, true, resolveImage);
  } else {
    drawCover(doc, customerLabel, sorted.length, stamp);
    // Inhaltsverzeichnis nur wenn sinnvoll Platz / mehrere Seiten
    if (sorted.length >= 2) {
      doc.addPage();
      drawToc(doc, sorted);
    }
    for (const page of sorted) {
      doc.addPage();
      renderDocument(doc, page, customerLabel, false, resolveImage);
    }
  }

  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    paintFooter(doc, customerLabel, i + 1, range.count);
  }

  doc.end();
  return done;
}

/**
 * Unterkante des nutzbaren Inhaltsbereichs (ohne Footer).
 */
function contentBottom(doc: PDFKit.PDFDocument): number {
  return doc.page.height - MARGIN - FOOTER_H;
}

/**
 * Seitenumbruch nur wenn nötig und nicht bereits am Seitenanfang
 * (verhindert Ketten leerer Seiten bei großen Blöcken / leeren Absätzen).
 */
function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  const bottom = contentBottom(doc);
  const top = doc.page.margins.top;
  if (doc.y + needed <= bottom) return;
  if (doc.y <= top + 1) return;
  doc.addPage();
}

function paintFooter(
  doc: PDFKit.PDFDocument,
  customerLabel: string,
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
  doc.text(`Systemhaus-Ess · ${customerLabel}`, MARGIN, bottom - 4, {
    width: doc.page.width - MARGIN * 2 - 70,
    lineBreak: false,
  });
  doc.text(`${pageNo} / ${total}`, doc.page.width - MARGIN - 50, bottom - 4, {
    width: 50,
    align: "right",
    lineBreak: false,
  });
  doc.restore();
}

function drawCover(
  doc: PDFKit.PDFDocument,
  customerLabel: string,
  count: number,
  stamp: Date,
) {
  doc.save().rect(0, 0, doc.page.width, 6).fill(ACCENT).restore();
  doc
    .save()
    .rect(0, 6, doc.page.width, 120)
    .fill(SOFT)
    .restore();

  const y0 = 48;
  doc.font("Helvetica").fontSize(9).fillColor(ACCENT).text("SYSTEMHAUS-ESS", MARGIN, y0, {
    characterSpacing: 1.6,
  });
  doc
    .font("Helvetica-Bold")
    .fontSize(26)
    .fillColor(TEXT)
    .text("Wiki-Dokumentation", MARGIN, y0 + 22, { width: doc.page.width - MARGIN * 2 });

  doc
    .font("Helvetica")
    .fontSize(13)
    .fillColor(MUTED)
    .text(customerLabel, MARGIN, doc.y + 6, { width: doc.page.width - MARGIN * 2 });

  doc.moveDown(1);
  doc
    .strokeColor(ACCENT)
    .lineWidth(2)
    .moveTo(MARGIN, doc.y)
    .lineTo(MARGIN + 48, doc.y)
    .stroke();

  doc.moveDown(1);
  doc.font("Helvetica").fontSize(11).fillColor(TEXT);
  doc.text(`${count} Wiki-Seite${count === 1 ? "" : "n"}`);
  doc.fillColor(MUTED).text(`Exportiert am ${formatDateTime(stamp)}`);
}

function drawToc(doc: PDFKit.PDFDocument, docs: WikiPdfDoc[]) {
  doc.font("Helvetica-Bold").fontSize(16).fillColor(TEXT).text("Inhalt");
  doc.moveDown(0.55);

  for (const item of docs) {
    ensureSpace(doc, 22);
    const type = typeLabel[item.type] ?? item.type;
    const y = doc.y;
    doc.font("Helvetica").fontSize(10.5).fillColor(TEXT).text(item.title, MARGIN, y, {
      width: doc.page.width - MARGIN * 2 - 96,
    });
    const afterTitle = doc.y;
    doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text(type, doc.page.width - MARGIN - 88, y, {
      width: 88,
      align: "right",
      lineBreak: false,
    });
    doc.y = Math.max(afterTitle, y + 12) + 4;
    doc
      .strokeColor(RULE)
      .lineWidth(0.4)
      .moveTo(MARGIN, doc.y)
      .lineTo(doc.page.width - MARGIN, doc.y)
      .stroke();
    doc.y += 8;
  }
}

function renderDocument(
  doc: PDFKit.PDFDocument,
  page: WikiPdfDoc,
  customerLabel: string,
  single: boolean,
  resolveImage?: WikiPdfImageResolver,
) {
  if (single) {
    doc.save().rect(0, 0, doc.page.width, 5).fill(ACCENT).restore();
    doc.font("Helvetica").fontSize(8.5).fillColor(ACCENT).text("SYSTEMHAUS-ESS", MARGIN, MARGIN - 6, {
      characterSpacing: 1.2,
    });
    doc.moveDown(0.35);
  }

  const type = typeLabel[page.type] ?? page.type;
  doc.font("Helvetica-Bold").fontSize(8).fillColor(ACCENT).text(type.toUpperCase());
  doc.moveDown(0.2);
  doc
    .font("Helvetica-Bold")
    .fontSize(18)
    .fillColor(TEXT)
    .text(page.title, { width: doc.page.width - MARGIN * 2 });

  doc.moveDown(0.3);
  doc.font("Helvetica").fontSize(8.5).fillColor(MUTED);
  const meta = [
    customerLabel,
    page.updatedAt ? `Aktualisiert ${formatDateTime(page.updatedAt)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  doc.text(meta);

  doc.moveDown(0.4);
  doc
    .strokeColor(RULE)
    .lineWidth(1)
    .moveTo(MARGIN, doc.y)
    .lineTo(doc.page.width - MARGIN, doc.y)
    .stroke();
  doc.moveDown(0.65);

  const nodes = trimEmptyNodes(parseTipTap(page.content));
  if (!nodes.length) {
    doc.font("Helvetica-Oblique").fontSize(10).fillColor(MUTED).text("Kein Inhalt.");
    return;
  }
  renderNodes(doc, nodes, { listDepth: 0, resolveImage, skipLeadingGap: true });
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

/** Entfernt führende/trailing und überzählige leere Absätze. */
function trimEmptyNodes(nodes: TipTapNode[]): TipTapNode[] {
  const cleaned: TipTapNode[] = [];
  for (const node of nodes) {
    if (isVisuallyEmpty(node)) {
      // maximal ein kleiner Abstand, keine Ketten leerer Absätze
      if (cleaned.length && cleaned[cleaned.length - 1]?.type !== "_gap") {
        cleaned.push({ type: "_gap" });
      }
      continue;
    }
    cleaned.push(node);
  }
  while (cleaned.length && (cleaned[0]?.type === "_gap" || isVisuallyEmpty(cleaned[0]!))) {
    cleaned.shift();
  }
  while (
    cleaned.length &&
    (cleaned[cleaned.length - 1]?.type === "_gap" ||
      isVisuallyEmpty(cleaned[cleaned.length - 1]!))
  ) {
    cleaned.pop();
  }
  return cleaned;
}

function isVisuallyEmpty(node: TipTapNode): boolean {
  if (!node?.type) return true;
  if (node.type === "hardBreak" || node.type === "horizontalRule") return false;
  if (node.type === "image" || node.type === "imageResize" || node.type === "table") return false;
  if (node.type === "paragraph" || node.type === "heading") {
    return !collectText(node.content ?? []).trim();
  }
  if (node.type === "bulletList" || node.type === "orderedList") {
    return !(node.content ?? []).some((item) => !isVisuallyEmpty(item));
  }
  if (node.type === "listItem" || node.type === "blockquote" || node.type === "codeBlock") {
    return !collectText(node.content ?? []).trim() && !(node.content ?? []).some((c) => !isVisuallyEmpty(c));
  }
  if (node.content?.length) {
    return node.content.every(isVisuallyEmpty);
  }
  return !node.text?.trim();
}

function renderNodes(
  doc: PDFKit.PDFDocument,
  nodes: TipTapNode[],
  ctx: {
    listDepth: number;
    resolveImage?: WikiPdfImageResolver;
    skipLeadingGap?: boolean;
  },
) {
  let first = true;
  for (const node of nodes) {
    if (!node?.type) continue;
    if (node.type === "_gap") {
      if (first && ctx.skipLeadingGap) continue;
      ensureSpace(doc, 10);
      doc.moveDown(0.35);
      continue;
    }
    first = false;

    switch (node.type) {
      case "heading": {
        const level = Number(node.attrs?.level ?? 1);
        const size = level === 1 ? 15 : level === 2 ? 12.5 : 11;
        ensureSpace(doc, size + 14);
        doc.moveDown(0.45);
        doc.font("Helvetica-Bold").fontSize(size).fillColor(TEXT);
        renderInline(doc, node.content ?? [], { bold: true });
        doc.moveDown(0.3);
        break;
      }
      case "paragraph": {
        const text = collectText(node.content ?? []);
        if (!text) break;
        ensureSpace(doc, 16);
        doc.font("Helvetica").fontSize(10.5).fillColor(TEXT);
        renderInline(doc, node.content ?? [], {});
        doc.moveDown(0.4);
        break;
      }
      case "bulletList":
        renderList(doc, node.content ?? [], false, ctx);
        break;
      case "orderedList":
        renderList(doc, node.content ?? [], true, ctx);
        break;
      case "blockquote": {
        ensureSpace(doc, 28);
        const startY = doc.y;
        const left = MARGIN + 8;
        doc.font("Helvetica-Oblique").fontSize(10).fillColor(MUTED);
        renderNodesBlockquote(doc, node.content ?? [], left + 8);
        const endY = doc.y;
        doc
          .save()
          .strokeColor(ACCENT)
          .lineWidth(2)
          .moveTo(left, startY)
          .lineTo(left, Math.max(endY, startY + 8))
          .stroke()
          .restore();
        doc.x = MARGIN;
        doc.moveDown(0.35);
        break;
      }
      case "codeBlock": {
        const text = collectText(node.content ?? []);
        if (!text) break;
        const boxW = doc.page.width - MARGIN * 2;
        doc.font("Courier").fontSize(9).fillColor(TEXT);
        const h = doc.heightOfString(text, { width: boxW - 16 });
        ensureSpace(doc, Math.min(h + 18, contentBottom(doc) - doc.page.margins.top - 8));
        const boxY = doc.y;
        doc
          .save()
          .roundedRect(MARGIN, boxY - 2, boxW, h + 12, 5)
          .fill(SOFT)
          .restore();
        doc.text(text, MARGIN + 8, boxY + 4, { width: boxW - 16 });
        doc.y = boxY + h + 16;
        doc.x = MARGIN;
        break;
      }
      case "horizontalRule": {
        ensureSpace(doc, 14);
        doc
          .strokeColor(RULE)
          .lineWidth(1)
          .moveTo(MARGIN, doc.y + 3)
          .lineTo(doc.page.width - MARGIN, doc.y + 3)
          .stroke();
        doc.moveDown(0.65);
        break;
      }
      case "table":
        renderTable(doc, node);
        break;
      case "image":
      case "imageResize": {
        renderImage(doc, node, ctx.resolveImage);
        break;
      }
      case "hardBreak":
        doc.moveDown(0.3);
        break;
      default:
        if (node.content?.length) renderNodes(doc, node.content, ctx);
        break;
    }
  }
}

/**
 * Betten ein Wiki-Bild in das PDF ein oder zeigt einen Platzhalter.
 */
function renderImage(
  doc: PDFKit.PDFDocument,
  node: TipTapNode,
  resolveImage?: WikiPdfImageResolver,
) {
  const alt = String(node.attrs?.alt ?? "Bild");
  const src = String(node.attrs?.src ?? "");
  const maxW = doc.page.width - MARGIN * 2;
  const maxH = 280;
  const filePath = src && resolveImage ? resolveImage(src) : null;

  if (filePath) {
    try {
      const openImage = (
        doc as PDFKit.PDFDocument & {
          openImage: (src: string) => { width: number; height: number };
        }
      ).openImage.bind(doc);
      const img = openImage(filePath);
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);
      const w = img.width * scale;
      const h = img.height * scale;
      ensureSpace(doc, Math.min(h + 24, contentBottom(doc) - doc.page.margins.top - 4));
      const x = MARGIN + (maxW - w) / 2;
      doc.image(filePath, x, doc.y, { width: w, height: h });
      doc.y += h + 5;
      doc.x = MARGIN;
      if (alt && alt !== "Bild") {
        doc
          .font("Helvetica-Oblique")
          .fontSize(8)
          .fillColor(MUTED)
          .text(alt, { width: maxW, align: "center" });
        doc.moveDown(0.3);
      } else {
        doc.moveDown(0.4);
      }
      return;
    } catch {
      /* Fallback */
    }
  }

  ensureSpace(doc, 18);
  doc.font("Helvetica-Oblique").fontSize(9).fillColor(MUTED).text(`[Bild: ${alt}]`);
  doc.moveDown(0.35);
}

function renderNodesBlockquote(doc: PDFKit.PDFDocument, nodes: TipTapNode[], x: number) {
  const width = doc.page.width - x - MARGIN;
  for (const node of nodes) {
    if (node.type === "paragraph") {
      const text = collectText(node.content ?? []);
      if (!text) continue;
      doc.x = x;
      renderInline(doc, node.content ?? [], { italic: true, width });
      doc.moveDown(0.25);
    } else if (node.content) {
      renderNodesBlockquote(doc, node.content, x);
    }
  }
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
    if (item.type !== "listItem") continue;
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
        });
        doc.moveDown(0.18);
      } else if (child.type === "bulletList" || child.type === "orderedList") {
        renderList(doc, child.content ?? [], child.type === "orderedList", {
          listDepth: depth + 1,
          resolveImage: ctx.resolveImage,
        });
      } else if (child.content) {
        renderNodes(doc, [child], { listDepth: depth + 1, resolveImage: ctx.resolveImage });
      }
    }
    doc.x = MARGIN;
  }
  doc.moveDown(0.2);
}

function renderTable(doc: PDFKit.PDFDocument, table: TipTapNode) {
  const rows = (table.content ?? []).filter((r) => r.type === "tableRow");
  if (!rows.length) return;
  const colCount = Math.max(
    ...rows.map(
      (r) =>
        (r.content ?? []).filter((c) => c.type === "tableCell" || c.type === "tableHeader").length,
    ),
    1,
  );
  const tableW = doc.page.width - MARGIN * 2;
  const colW = tableW / colCount;

  for (const row of rows) {
    const cells = (row.content ?? []).filter(
      (c) => c.type === "tableCell" || c.type === "tableHeader",
    );
    const texts = cells.map((c) => collectText(c.content ?? []) || " ");
    const isHeader = cells.some((c) => c.type === "tableHeader");
    doc.font(isHeader ? "Helvetica-Bold" : "Helvetica").fontSize(9);
    const heights = texts.map((t) => doc.heightOfString(t, { width: colW - 10 }));
    const rowH = Math.max(...heights, 14) + 8;
    ensureSpace(doc, Math.min(rowH + 2, contentBottom(doc) - doc.page.margins.top - 4));
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
  doc.moveDown(0.4);
}

function renderInline(
  doc: PDFKit.PDFDocument,
  nodes: TipTapNode[],
  opts: { bold?: boolean; italic?: boolean; width?: number },
) {
  const width = opts.width ?? doc.page.width - doc.x - MARGIN;
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
    doc.font(font).fontSize(10.5).fillColor(TEXT);
    doc.text(seg.text, {
      width,
      continued: i < segments.length - 1,
      underline: seg.underline,
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

function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "–";
  try {
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}
