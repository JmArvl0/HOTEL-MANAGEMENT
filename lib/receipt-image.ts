"use client";

/**
 * Browser-only PNG painter for receipts.
 *
 * Draws the receipt DOCUMENT onto a canvas sized to A4 proportion — it is not a
 * page capture, so no sidebar, header, bell, backdrop or toast can ever reach
 * the file. Every value comes from the same ReceiptDocument the modal renders,
 * via the same receiptRows() list the PDF walks.
 */

import { receiptNote, receiptRows, type ReceiptDocument } from "@/lib/receipt";

const WIDTH = 1240;
const HEIGHT = Math.round((WIDTH * 297) / 210); // A4 proportion
const PAD = 96;
const VALUE_X = 430;

const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const SERIF = 'Georgia, "Times New Roman", serif';
const INK = "#103e48";
const MUTED = "#6d7971";
const ACCENT = "#084b55";
const LINE = "#e3e5df";

export async function receiptPng(doc: ReceiptDocument): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable in this browser.");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.textBaseline = "alphabetic";

  const write = (value: string, x: number, y: number, font: string, color: string) => {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.fillText(value, x, y);
  };
  const rule = (y: number) => {
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(PAD, y);
    ctx.lineTo(WIDTH - PAD, y);
    ctx.stroke();
  };

  write("HAVEN HOTEL & RESIDENCES", PAD, 150, `600 20px ${SANS}`, MUTED);
  write("OFFICIAL PAYMENT RECORD", PAD, 192, `600 18px ${SANS}`, ACCENT);
  write("Payment receipt", PAD, 258, `500 46px ${SERIF}`, INK);
  rule(300);

  // Long values (a guest name, a GCash reference) shrink rather than overflow
  // the fixed page — the value column is 1240 - 430 - 96 = 714px wide.
  const fit = (value: string, start: number, weight: number) => {
    let size = start;
    ctx.font = `${weight} ${size}px ${SANS}`;
    while (size > 13 && ctx.measureText(value).width > WIDTH - PAD - VALUE_X) {
      size -= 1;
      ctx.font = `${weight} ${size}px ${SANS}`;
    }
    return size;
  };

  let y = 360;
  for (const row of receiptRows(doc)) {
    if (row.emphasis) {
      rule(y - 40);
      write(row.label, PAD, y, `500 21px ${SANS}`, MUTED);
      write(row.value, VALUE_X, y, `700 ${fit(row.value, 28, 700)}px ${SANS}`, INK);
      y += 76;
    } else {
      write(row.label, PAD, y, `400 21px ${SANS}`, MUTED);
      write(row.value, VALUE_X, y, `500 ${fit(row.value, 23, 500)}px ${SANS}`, INK);
      y += 56;
    }
  }

  y += 24;
  rule(y);
  y += 44;
  ctx.font = `400 19px ${SANS}`;
  ctx.fillStyle = MUTED;
  let note = "";
  for (const word of receiptNote(doc).split(/\s+/)) {
    const next = note ? `${note} ${word}` : word;
    if (ctx.measureText(next).width > WIDTH - PAD * 2) {
      ctx.fillText(note, PAD, y);
      y += 30;
      note = word;
    } else {
      note = next;
    }
  }
  if (note) ctx.fillText(note, PAD, y);

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The receipt image could not be encoded."))), "image/png")
  );
}

/** Trigger a client-side download for a generated blob. */
export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoked on the next tick: Safari reads the object URL asynchronously.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
