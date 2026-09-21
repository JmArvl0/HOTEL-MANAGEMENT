/**
 * A minimal, dependency-free A4 PDF writer for receipts.
 *
 * Base-14 Helvetica + WinAnsiEncoding, hand-written xref/startxref. The
 * codebase ships no PDF library and this file avoids adding one: the whole
 * document is text, so a page of `BT … Tj ET` operators plus a correct xref
 * table is genuinely all a receipt needs.
 *
 * Consequence worth knowing: base-14 fonts have no ₱ glyph, so amounts print as
 * "PHP 1,740.00" where the modal and PNG show "₱1,740.00". The NUMBER is always
 * the same one from ReceiptDocument — only the currency symbol differs.
 *
 * Isomorphic on purpose: no DOM, no Node APIs, no `window`. The same function
 * renders the browser download and the server-side email attachment.
 * ponytail: single page, no pagination — a receipt is ~12 rows. Add a page
 * break loop if charges are ever itemised line-by-line.
 */

import { receiptMoneyFormatter, receiptNote, receiptRows, type ReceiptDocument } from "@/lib/receipt";

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 56;
const VALUE_X = 236;

const round = (value: number) => Math.round(value * 100) / 100;

/* WinAnsi covers Latin-1, so anything outside ASCII must go before it reaches a
   PDF string literal — and a stray `(` or `\` would corrupt the object. */
function ascii(value: string): string {
  return value
    .replace(/₱/g, "PHP ")
    .replace(/[–—]/g, "-")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/·/g, "-")
    .replace(/[^\x20-\x7E]/g, "");
}

const escapeText = (value: string) => ascii(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

const text = (font: "F1" | "F2", size: number, x: number, y: number, value: string, gray: number) =>
  `${gray} g BT /${font} ${size} Tf 1 0 0 1 ${round(x)} ${round(y)} Tm (${escapeText(value)}) Tj ET`;

const rule = (y: number) => `0.8 w 0.8 G ${MARGIN} ${round(y)} m ${round(A4_WIDTH - MARGIN)} ${round(y)} l S`;

function wrap(value: string, limit: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of value.split(/\s+/)) {
    if (line && `${line} ${word}`.length > limit) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function assemble(content: string): Uint8Array<ArrayBuffer> {
  const objects = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    `<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${A4_WIDTH} ${A4_HEIGHT}]/Resources<</Font<</F1 4 0 R/F2 5 0 R>>>>/Contents 6 0 R>>`,
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>",
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica-Bold/Encoding/WinAnsiEncoding>>",
    `<</Length ${content.length}>>\nstream\n${content}\nendstream`
  ];
  // Offsets are byte offsets; `content` is ASCII by construction, so string
  // length and byte length agree.
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
  // Re-wrapped so the result is backed by a plain ArrayBuffer, which is what
  // Blob() accepts — TextEncoder's declared return type is ArrayBufferLike.
  return new Uint8Array(new TextEncoder().encode(pdf));
}

export function receiptPdf(doc: ReceiptDocument): Uint8Array<ArrayBuffer> {
  const rows = receiptRows(doc, receiptMoneyFormatter(doc.currency));
  const ops: string[] = [];
  let y = A4_HEIGHT - MARGIN;

  ops.push(text("F1", 8.5, MARGIN, y, "HAVEN HOTEL & RESIDENCES", 0.35));
  y -= 26;
  ops.push(text("F1", 8, MARGIN, y, "OFFICIAL PAYMENT RECORD", 0.45));
  y -= 22;
  ops.push(text("F2", 20, MARGIN, y, "Payment receipt", 0.06));
  y -= 18;
  ops.push(rule(y));
  y -= 26;

  for (const row of rows) {
    // A rule ahead of each total separates the identity block from the money
    // block and the net/tax detail from the gross.
    if (row.emphasis) ops.push(rule(y + 14));
    ops.push(text("F1", 9, MARGIN, y, row.label, 0.42));
    ops.push(text(row.emphasis ? "F2" : "F1", row.emphasis ? 11.5 : 10.5, VALUE_X, y, row.value, 0.06));
    y -= row.emphasis ? 26 : 21;
  }

  y -= 12;
  ops.push(rule(y));
  y -= 20;
  for (const line of wrap(receiptNote(doc), 96)) {
    ops.push(text("F1", 8, MARGIN, y, line, 0.45));
    y -= 12;
  }

  return assemble(ops.join("\n"));
}

/** Raw bytes → base64, for the email attachment. Chunked so no spread overflow. */
export function receiptPdfBase64(doc: ReceiptDocument): string {
  const bytes = receiptPdf(doc);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}
