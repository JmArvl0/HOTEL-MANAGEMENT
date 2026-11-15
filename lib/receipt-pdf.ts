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

import { A4_HEIGHT, MARGIN, assembleA4Pdf, pdfRule as rule, pdfText as text } from "@/lib/pdf-page";

const VALUE_X = 236;

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

  return assembleA4Pdf(ops.join("\n"));
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
