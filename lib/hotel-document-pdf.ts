import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PageSizes, rgb, type PDFFont, type PDFPage } from "pdf-lib";

type Fact = { label: string; value: string; detail?: string };
type Table = { headings?: string[]; rows: string[][]; columns?: number[]; values?: number[] };
export type HotelDocument = {
  title: string;
  subtitle: string;
  reference: string;
  audience: "Guest copy" | "Internal use";
  facts: Fact[];
  sections: { title: string; table?: Table; note?: string; totals?: Fact[] }[];
  footer: string;
};

const [width, height] = PageSizes.A4;
const left = 46;
const right = width - left;
const span = right - left;
const ink = rgb(0.075, 0.145, 0.231);
const muted = rgb(0.302, 0.353, 0.404);
const cream = rgb(0.969, 0.953, 0.922);
const pale = rgb(0.949, 0.961, 0.965);
const rule = rgb(0.855, 0.867, 0.863);
const bronze = rgb(0.518, 0.369, 0.173);
const gold = rgb(0.914, 0.804, 0.620);
const white = rgb(1, 1, 1);

function textLines(value: string, font: PDFFont, size: number, limit: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of value.trim().split(/\s+/u)) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= limit) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = "";
    for (const char of word) {
      if (line && font.widthOfTextAtSize(line + char, size) > limit) {
        lines.push(line);
        line = "";
      }
      line += char;
    }
  }
  lines.push(line);
  return lines;
}

let assets: Promise<[Buffer, Buffer, Buffer]> | undefined;
function brandAssets() {
  assets ??= Promise.all([
    readFile(join(process.cwd(), "app/fonts/Inter-Variable.ttf")),
    readFile(join(process.cwd(), "app/fonts/PlayfairDisplay-Variable.ttf")),
    readFile(join(process.cwd(), "public/haven-logo-small.png")),
  ]).catch(error => { assets = undefined; throw error; });
  return assets;
}

export async function renderHotelDocument(model: HotelDocument) {
  const [bodyFont, displayFont, logo] = await brandAssets();
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  // Subsetting our variable fonts can drop glyph outlines in PDF viewers.
  const [body, display, mark] = await Promise.all([
    pdf.embedFont(bodyFont), pdf.embedFont(displayFont), pdf.embedPng(logo),
  ]);
  pdf.setTitle(model.title);
  pdf.setAuthor("Haven Hotel & Residences");
  pdf.setSubject(model.reference);

  let page: PDFPage;
  let cursor = 0;
  function text(value: string, x: number, top: number, size = 10, color = ink, font = body, alignRight = false) {
    const offset = alignRight ? font.widthOfTextAtSize(value, size) : 0;
    page.drawText(value, { x: x - offset, y: height - top, size, color, font });
  }
  function label(value: string, x: number, top: number, color = muted) {
    text(value.toLocaleUpperCase("en-PH"), x, top, 8, color);
  }
  function line(top: number) {
    page.drawLine({ start: { x: left, y: height - top }, end: { x: right, y: height - top }, color: rule, thickness: 0.65 });
  }
  function panel(top: number, boxHeight: number, color = cream) {
    const r = 7;
    page.drawSvgPath(`M ${r} 0 H ${span - r} Q ${span} 0 ${span} ${r} V ${boxHeight - r} Q ${span} ${boxHeight} ${span - r} ${boxHeight} H ${r} Q 0 ${boxHeight} 0 ${boxHeight - r} V ${r} Q 0 0 ${r} 0 Z`, { x: left, y: height - top, color });
  }
  function newPage() {
    page = pdf.addPage(PageSizes.A4);
    const first = pdf.getPageCount() === 1;
    page.drawImage(mark, { x: left, y: height - 70, width: 33, height: 33 });
    text("HAVEN", left + 45, 52, 18, ink, display);
    label("Hotel & Residences", left + 45, 67);
    text(model.audience.toUpperCase(), right, 48, 8, bronze, body, true);
    text(model.reference, right, 66, 10, ink, body, true);
    line(86);
    text(model.title, left, 123, first ? 33 : 27, ink, display);
    const intro = first ? model.subtitle : "Continued";
    const lines = textLines(intro, body, 11, span);
    lines.forEach((wordLine, index) => text(wordLine, left, 149 + 15 * index, 11, muted));
    cursor = 161 + 15 * lines.length;
  }
  function ensureSpace(space: number) {
    if (cursor + space <= 752) return false;
    newPage();
    return true;
  }
  function facts(values: Fact[], dark = false) {
    if (!values.length) return;
    const count = dark ? 3 : 2;
    const stride = (span - 34) / Math.min(count, values.length);
    for (let start = 0; start < values.length; start += count) {
      const size = dark ? 17 : 14;
      const cells = values.slice(start, start + count).map(fact => ({
        ...fact, wrapped: textLines(fact.value, body, size, stride - 13),
        detailLines: fact.detail ? textLines(fact.detail, body, 9.5, stride - 13) : [],
      }));
      const blockHeight = Math.max(dark ? 76 : 71, 60 + Math.max(...cells.map(fact => (fact.wrapped.length - 1) * 19 + fact.detailLines.length * 13)));
      ensureSpace(blockHeight);
      panel(cursor, blockHeight, dark ? ink : cream);
      cells.forEach((fact, column) => {
        const x = left + 17 + stride * column;
        label(fact.label, x, cursor + 23, dark ? gold : muted);
        fact.wrapped.forEach((value, index) => text(value, x, cursor + 47 + index * 19, size, dark ? white : ink));
        fact.detailLines.forEach((value, index) => text(value, x, cursor + 43 + fact.wrapped.length * 19 + index * 13, 9.5, muted));
      });
      cursor += blockHeight + 11;
    }
  }
  function sectionTitle(value: string) {
    text(value, left, cursor + 14, 15);
    line(cursor + 25);
    cursor += 33;
  }

  newPage();
  facts(model.facts);
  for (const section of model.sections) {
    cursor += 12;
    ensureSpace(section.table?.headings ? 90 : 64);
    sectionTitle(section.title);
    if (section.table) {
      const { headings, rows, columns = [0.69, 0.31], values = [columns.length - 1] } = section.table;
      const edges = columns.map((_, index) => left + columns.slice(0, index).reduce((total, size) => total + size * span, 0));
      const columnRight = (index: number) => (edges[index + 1] ?? right) - 10;
      function tableHeader() {
        if (!headings) return;
        panel(cursor, 23, pale);
        headings.forEach((value, index) => {
          if (values.includes(index)) text(value.toUpperCase(), columnRight(index), cursor + 15, 8, muted, body, true);
          else label(value, edges[index] + 10, cursor + 15);
        });
        cursor += 26;
      }
      tableHeader();
      for (const row of rows) {
        const cells = row.map((value, index) => textLines(value, body, 10, columns[index] * span - 20));
        const rowHeight = Math.max(26, 13 + 14 * Math.max(...cells.map(cell => cell.length)));
        if (ensureSpace(rowHeight)) {
          sectionTitle(section.title);
          tableHeader();
        }
        cells.forEach((cell, index) => cell.forEach((value, indexInCell) => {
          const isValue = values.includes(index);
          text(value, isValue ? columnRight(index) : edges[index] + 10, cursor + 16 + 14 * indexInCell, 10, isValue ? ink : muted, body, isValue);
        }));
        cursor += rowHeight;
        line(cursor);
      }
      cursor += 10;
    }
    if (section.totals) facts(section.totals, true);
    if (section.note) {
      const lines = textLines(section.note, body, 9.5, span - 26);
      ensureSpace(24 + lines.length * 13);
      panel(cursor, 16 + lines.length * 13, pale);
      lines.forEach((value, index) => text(value, left + 13, cursor + 17 + index * 13, 9.5, muted));
      cursor += 23 + lines.length * 13;
    }
  }

  const pages = pdf.getPages();
  pages.forEach((current, index) => {
    page = current;
    line(778);
    text(model.footer, left, 803, 8.5, muted);
    text(`${index + 1} / ${pages.length}`, right, 803, 9, ink, body, true);
  });
  return new Uint8Array(await pdf.save());
}
