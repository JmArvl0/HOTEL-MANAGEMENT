// @vitest-environment jsdom
// The PNG painter, exercised against a stubbed 2D context.
//
// jsdom ships no canvas backend and this repo adds no dependencies, so the test
// supplies the smallest context that records draw calls. That is enough to prove
// the two things that matter: the image is painted from the SAME receiptRows()
// list the modal and PDF use (so a value cannot diverge), and it is a painted
// document — not a page capture that could pick up the sidebar, header or bell.
import { afterEach, describe, expect, it, vi } from "vitest";
import { receiptPng, saveBlob } from "@/lib/receipt-image";
import { receiptNote, receiptRows, type ReceiptDocument } from "@/lib/receipt";
import { formatPeso } from "@/lib/format";

const doc: ReceiptDocument = {
  documentNumber: "RCP-260918-A1B2C3",
  paymentReference: "pay-alfa",
  reservationNumber: "HVN-alfa",
  guestName: "Guest alfa",
  roomType: "Deluxe King",
  checkIn: "2026-09-15",
  checkOut: "2026-09-18",
  purposeLabel: "Reservation deposit",
  methodLabel: "GCash",
  settlementReference: "0001234567",
  verifiedAt: "2026-09-01T01:00:00Z",
  currency: "PHP",
  amount: 1740,
  tax: { netSubtotal: 1412.34, serviceCharge: 141.23, vatAmount: 186.43, grossTotal: 1740, serviceChargeRate: "10%", vatRate: "12%" },
};

/** Every string handed to fillText, in draw order. */
function paintedText(): string[] {
  const written: string[] = [];
  const context = {
    fillStyle: "", strokeStyle: "", lineWidth: 0, font: "", textBaseline: "",
    fillRect: () => {},
    fillText: (value: string) => written.push(value),
    // Deterministic advance width, so the shrink-to-fit loop behaves predictably.
    measureText: (value: string) => ({ width: value.length * Number(/(\d+)px/.exec(context.font)?.[1] ?? 16) * 0.55 }),
    beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => {},
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(new Blob(["png"], { type: "image/png" })));
  return written;
}

afterEach(() => vi.restoreAllMocks());

describe("the receipt PNG", () => {
  it("paints every row of the shared list — the same values the modal shows", async () => {
    const written = paintedText();
    const blob = await receiptPng(doc);
    expect(blob.type).toBe("image/png");

    for (const row of receiptRows(doc)) {
      expect(written).toContain(row.label);
      expect(written).toContain(row.value);
    }
    // The amount is the model's number in the on-screen currency — identical to
    // the preview, unlike the PDF which must spell the currency out.
    expect(written).toContain(formatPeso(doc.amount));
    expect(written).toContain("Gross total");
  });

  it("paints the note and only the receipt's own content", async () => {
    const written = paintedText();
    await receiptPng(doc);
    const allowed = new Set([
      "HAVEN HOTEL & RESIDENCES",
      "OFFICIAL PAYMENT RECORD",
      "Payment receipt",
      ...receiptRows(doc).flatMap((row) => [row.label, row.value]),
      ...receiptNote(doc).split(/\s+/),
    ]);
    // A page capture would drag in navigation ("Your stay", "Sign Out", …).
    for (const value of written) expect(allowed.has(value) || receiptNote(doc).includes(value)).toBe(true);
  });

  it("omits the receipt number when none was ever issued", async () => {
    const written = paintedText();
    await receiptPng({ ...doc, documentNumber: null });
    expect(written).not.toContain("Receipt number");
    expect(written).not.toContain("RCP-260918-A1B2C3");
  });

  it("downloads under the shared file name", () => {
    const clicks: HTMLAnchorElement[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push(this);
    });
    saveBlob(new Blob(["png"], { type: "image/png" }), "HAVEN-Receipt-HVN-alfa.png");
    expect(click).toHaveBeenCalledTimes(1);
    expect(clicks[0].download).toBe("HAVEN-Receipt-HVN-alfa.png");
    expect(clicks[0].href.startsWith("blob:")).toBe(true);
    // The temporary anchor never stays in the document.
    expect(document.querySelectorAll("a")).toHaveLength(0);
  });

  it("reports a browser with no canvas rather than downloading nothing", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    await expect(receiptPng(doc)).rejects.toThrow(/Canvas 2D is unavailable/);
  });

  it("rejects when the encoder refuses, so the UI can toast a failure", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      fillRect: () => {}, fillText: () => {}, measureText: () => ({ width: 0 }),
      beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => {},
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(null));
    await expect(receiptPng(doc)).rejects.toThrow(/could not be encoded/);
  });
});
