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

const MARGIN = 56;
const ACCENT = "#2563eb";
const MUTED = "#64748b";
const TEXT = "#0f172a";
const RULE = "#e2e8f0";

/**
 * Erzeugt ein PDF für eine oder mehrere Wiki-Seiten (Deckblatt + Inhaltsverzeichnis bei mehreren).
 */
export async function buildWikiPdf(
  customer: WikiPdfCustomer,
  docs: WikiPdfDoc[],
): Promise<Buffer> {
  const sorted = [...docs].sort((a, b) => a.title.localeCompare(b.title, "de"));
  const customerLabel = customer.company?.trim() || customer.name;
  const stamp = new Date();

  const doc = new PDFDocument({
    size: "A4",
    bufferPages: true,
    margins: { top: MARGIN, bottom: MARGIN + 32, left: MARGIN, right: MARGIN },
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
    renderDocument(doc, sorted[0]!, customerLabel, true);
  } else {
    drawCover(doc, customerLabel, sorted.length, stamp);
    doc.addPage();
    drawToc(doc, sorted);
    for (const page of sorted) {
      doc.addPage();
      renderDocument(doc, page, customerLabel, false);
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

function paintFooter(
  doc: PDFKit.PDFDocument,
  customerLabel: string,
  pageNo: number,
  total: number,
) {
  const bottom = doc.page.height - 34;
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
  doc.save().rect(0, 0, doc.page.width, 8).fill(ACCENT).restore();

  const y0 = 160;
  doc.font("Helvetica").fontSize(10).fillColor(ACCENT).text("SYSTEMHAUS-ESS", MARGIN, y0, {
    characterSpacing: 2,
  });
  doc
    .font("Helvetica-Bold")
    .fontSize(28)
    .fillColor(TEXT)
    .text("Wiki-Dokumentation", MARGIN, y0 + 28, { width: doc.page.width - MARGIN * 2 });

  doc
    .font("Helvetica")
    .fontSize(14)
    .fillColor(MUTED)
    .text(customerLabel, MARGIN, doc.y + 8, { width: doc.page.width - MARGIN * 2 });

  doc.moveDown(1.2);
  doc
    .strokeColor(RULE)
    .lineWidth(1)
    .moveTo(MARGIN, doc.y)
    .lineTo(MARGIN + 120, doc.y)
    .stroke();

  doc.moveDown(1.2);
  doc.font("Helvetica").fontSize(11).fillColor(TEXT);
  doc.text(`${count} Wiki-Seite${count === 1 ? "" : "n"}`);
  doc.fillColor(MUTED).text(`Exportiert am ${formatDateTime(stamp)}`);
}

function drawToc(doc: PDFKit.PDFDocument, docs: WikiPdfDoc[]) {
  doc.font("Helvetica-Bold").fontSize(18).fillColor(TEXT).text("Inhaltsverzeichnis");
  doc.moveDown(0.6);

  for (const item of docs) {
    ensureSpace(doc, 28);
    const type = typeLabel[item.type] ?? item.type;
    const y = doc.y;
    doc.font("Helvetica").fontSize(11).fillColor(TEXT).text(item.title, MARGIN, y, {
      width: doc.page.width - MARGIN * 2 - 100,
    });
    const afterTitle = doc.y;
    doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(type, doc.page.width - MARGIN - 90, y, {
      width: 90,
      align: "right",
      lineBreak: false,
    });
    doc.y = Math.max(afterTitle, y + 14);
    doc
      .strokeColor(RULE)
      .lineWidth(0.4)
      .moveTo(MARGIN, doc.y + 2)
      .lineTo(doc.page.width - MARGIN, doc.y + 2)
      .stroke();
    doc.y += 10;
  }
}

function renderDocument(
  doc: PDFKit.PDFDocument,
  page: WikiPdfDoc,
  customerLabel: string,
  single: boolean,
) {
  if (single) {
    doc.save().rect(0, 0, doc.page.width, 6).fill(ACCENT).restore();
    doc.font("Helvetica").fontSize(9).fillColor(ACCENT).text("SYSTEMHAUS-ESS", MARGIN, MARGIN - 8);
    doc.moveDown(0.4);
  }

  const type = typeLabel[page.type] ?? page.type;
  doc.font("Helvetica-Bold").fontSize(8).fillColor(ACCENT).text(type.toUpperCase());
  doc.moveDown(0.25);
  doc
    .font("Helvetica-Bold")
    .fontSize(20)
    .fillColor(TEXT)
    .text(page.title, { width: doc.page.width - MARGIN * 2 });

  doc.moveDown(0.35);
  doc.font("Helvetica").fontSize(9).fillColor(MUTED);
  const meta = [
    customerLabel,
    page.updatedAt ? `Aktualisiert ${formatDateTime(page.updatedAt)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  doc.text(meta);

  doc.moveDown(0.5);
  doc
    .strokeColor(RULE)
    .lineWidth(1)
    .moveTo(MARGIN, doc.y)
    .lineTo(doc.page.width - MARGIN, doc.y)
    .stroke();
  doc.moveDown(0.8);

  renderNodes(doc, parseTipTap(page.content), { listDepth: 0 });
}

function parseTipTap(raw: string): TipTapNode[] {
  try {
    const parsed = JSON.parse(raw) as TipTapNode;
    if (parsed?.type === "doc" && Array.isArray(parsed.content)) return parsed.content;
  } catch {
    /* plain text */
  }
  return [{ type: "paragraph", content: [{ type: "text", text: raw }] }];
}

function renderNodes(
  doc: PDFKit.PDFDocument,
  nodes: TipTapNode[],
  ctx: { listDepth: number },
) {
  for (const node of nodes) {
    if (!node?.type) continue;
    switch (node.type) {
      case "heading": {
        const level = Number(node.attrs?.level ?? 1);
        const size = level === 1 ? 16 : level === 2 ? 13.5 : 12;
        ensureSpace(doc, size + 18);
        doc.moveDown(0.35);
        doc.font("Helvetica-Bold").fontSize(size).fillColor(TEXT);
        renderInline(doc, node.content ?? [], { bold: true });
        doc.moveDown(0.35);
        break;
      }
      case "paragraph": {
        ensureSpace(doc, 18);
        doc.font("Helvetica").fontSize(10.5).fillColor(TEXT);
        if (!node.content?.length) {
          doc.moveDown(0.5);
          break;
        }
        renderInline(doc, node.content, {});
        doc.moveDown(0.45);
        break;
      }
      case "bulletList":
        renderList(doc, node.content ?? [], false, ctx);
        break;
      case "orderedList":
        renderList(doc, node.content ?? [], true, ctx);
        break;
      case "blockquote": {
        ensureSpace(doc, 36);
        const startY = doc.y;
        const left = MARGIN + 10;
        doc.font("Helvetica-Oblique").fontSize(10).fillColor(MUTED);
        renderNodesBlockquote(doc, node.content ?? [], left + 8);
        const endY = doc.y;
        doc
          .save()
          .strokeColor(ACCENT)
          .lineWidth(2.5)
          .moveTo(left, startY)
          .lineTo(left, Math.max(endY, startY + 8))
          .stroke()
          .restore();
        doc.x = MARGIN;
        doc.moveDown(0.4);
        break;
      }
      case "codeBlock": {
        ensureSpace(doc, 40);
        const text = collectText(node.content ?? []);
        const boxY = doc.y;
        const boxW = doc.page.width - MARGIN * 2;
        doc.font("Courier").fontSize(9).fillColor(TEXT);
        const h = doc.heightOfString(text || " ", { width: boxW - 16 });
        doc
          .save()
          .roundedRect(MARGIN, boxY - 2, boxW, h + 14, 6)
          .fill("#f1f5f9")
          .restore();
        doc.text(text || " ", MARGIN + 8, boxY + 5, { width: boxW - 16 });
        doc.y = boxY + h + 18;
        doc.x = MARGIN;
        break;
      }
      case "horizontalRule": {
        ensureSpace(doc, 16);
        doc
          .strokeColor(RULE)
          .lineWidth(1)
          .moveTo(MARGIN, doc.y + 4)
          .lineTo(doc.page.width - MARGIN, doc.y + 4)
          .stroke();
        doc.moveDown(0.8);
        break;
      }
      case "table":
        renderTable(doc, node);
        break;
      case "image":
      case "imageResize": {
        ensureSpace(doc, 24);
        const alt = String(node.attrs?.alt ?? "Bild");
        doc.font("Helvetica-Oblique").fontSize(9).fillColor(MUTED).text(`[Bild: ${alt}]`);
        doc.moveDown(0.4);
        break;
      }
      case "hardBreak":
        doc.moveDown(0.35);
        break;
      default:
        if (node.content?.length) renderNodes(doc, node.content, ctx);
        break;
    }
  }
}

function renderNodesBlockquote(doc: PDFKit.PDFDocument, nodes: TipTapNode[], x: number) {
  const width = doc.page.width - x - MARGIN;
  for (const node of nodes) {
    if (node.type === "paragraph") {
      doc.x = x;
      renderInline(doc, node.content ?? [], { italic: true, width });
      doc.moveDown(0.3);
    } else if (node.content) {
      renderNodesBlockquote(doc, node.content, x);
    }
  }
}

function renderList(
  doc: PDFKit.PDFDocument,
  items: TipTapNode[],
  ordered: boolean,
  ctx: { listDepth: number },
) {
  const depth = ctx.listDepth;
  let index = 0;
  for (const item of items) {
    if (item.type !== "listItem") continue;
    index += 1;
    ensureSpace(doc, 18);
    const indent = MARGIN + depth * 16;
    const bullet = ordered ? `${index}.` : "•";
    const y = doc.y;
    doc.font("Helvetica").fontSize(10.5).fillColor(TEXT);
    doc.text(bullet, indent, y, { width: 18, lineBreak: false });
    doc.x = indent + 18;
    for (const child of item.content ?? []) {
      if (child.type === "paragraph") {
        renderInline(doc, child.content ?? [], {
          width: doc.page.width - indent - 18 - MARGIN,
        });
        doc.moveDown(0.2);
      } else if (child.type === "bulletList" || child.type === "orderedList") {
        renderList(doc, child.content ?? [], child.type === "orderedList", {
          listDepth: depth + 1,
        });
      } else if (child.content) {
        renderNodes(doc, [child], { listDepth: depth + 1 });
      }
    }
    doc.x = MARGIN;
  }
  doc.moveDown(0.25);
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
    const rowH = Math.max(...heights, 16) + 10;
    ensureSpace(doc, rowH + 4);
    const y = doc.y;
    for (let i = 0; i < colCount; i++) {
      const x = MARGIN + i * colW;
      doc
        .save()
        .rect(x, y, colW, rowH)
        .fillAndStroke(isHeader ? "#eff6ff" : "#ffffff", RULE)
        .restore();
      doc.fillColor(TEXT).text(texts[i] ?? "", x + 5, y + 5, {
        width: colW - 10,
        height: rowH - 8,
      });
    }
    doc.y = y + rowH;
    doc.x = MARGIN;
  }
  doc.moveDown(0.5);
}

function renderInline(
  doc: PDFKit.PDFDocument,
  nodes: TipTapNode[],
  opts: { bold?: boolean; italic?: boolean; width?: number },
) {
  const width = opts.width ?? doc.page.width - doc.x - MARGIN;
  const segments = flattenInline(nodes);
  if (!segments.length) {
    doc.text(" ", { width, continued: false });
    return;
  }

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

function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  if (doc.y + needed > doc.page.height - MARGIN - 36) {
    doc.addPage();
  }
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
