// The receipt contract: eligibility, the ordered row list every renderer walks,
// the file name, and the bytes the zero-dependency PDF writer emits.
//
// The load-bearing assertion is value identity — the PDF's amount string is
// built from the same ReceiptDocument as the preview's, so the two cannot
// disagree about a number. Only the currency symbol may differ (base-14 PDF
// fonts have no ₱).
import { describe, expect, it } from "vitest";
import {
  buildReceiptDocument,
  receiptAmountText,
  receiptEligible,
  receiptFileName,
  receiptMoneyFormatter,
  receiptRows,
  type ReceiptDocument,
  type ReceiptTax,
} from "@/lib/receipt";
import { receiptPdf, receiptPdfBase64 } from "@/lib/receipt-pdf";

const TAX: ReceiptTax = {
  netSubtotal: 1412.34,
  serviceCharge: 141.23,
  vatAmount: 186.43,
  grossTotal: 1740,
  serviceChargeRate: "10%",
  vatRate: "12%",
};

const doc = (over: Partial<ReceiptDocument> = {}): ReceiptDocument => ({
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
  tax: TAX,
  ...over,
});

describe("official receipt eligibility", () => {
  it("mirrors accounting_generate_document: settled and not a refund", () => {
    expect(receiptEligible({ status: "paid", purpose: "reservation_deposit" })).toBe(true);
    expect(receiptEligible({ status: "paid", purpose: "stay_payment" })).toBe(true);
    expect(receiptEligible({ status: "paid", purpose: "refund" })).toBe(false);
  });

  it("refuses every unsettled state, so no receipt exists for unverified money", () => {
    for (const status of ["pending_verification", "failed", "expired", "refunded"]) {
      expect(receiptEligible({ status, purpose: "reservation_deposit" })).toBe(false);
    }
  });
});

describe("canonical receipt document", () => {
  it("carries a real document number through, and never invents one", () => {
    expect(buildReceiptDocument(input()).documentNumber).toBe("RCP-260918-A1B2C3");
    expect(buildReceiptDocument(input({ documentNumber: null })).documentNumber).toBeNull();
  });

  it("falls back to the payment's own id and creation time rather than blank fields", () => {
    const built = buildReceiptDocument(
      input({ payment: { id: "pay-1", amount: 900, verified_at: null, created_at: "2026-09-02T00:00:00Z", reference: null, currency: null } }),
    );
    expect(built.verifiedAt).toBe("2026-09-02T00:00:00Z");
    expect(built.currency).toBe("PHP");
    expect(built.settlementReference).toBeNull();
  });

  it("keeps the reservation fallback and placeholder distinct from a real value", () => {
    const built = buildReceiptDocument(
      input({ reservation: { id: "res-9", confirmation_number: null, guest_name: null, room_type: null, check_in: "2026-09-15", check_out: "2026-09-18" } }),
    );
    expect(built.reservationNumber).toBe("res-9");
    expect(built.guestName).toBe("—");
    expect(built.roomType).toBe("—");
  });
});

function input(over: Record<string, unknown> = {}) {
  return {
    payment: { id: "pay-alfa", amount: 1740, currency: "PHP", reference: "0001234567", verified_at: "2026-09-01T01:00:00Z", created_at: "2026-09-01T00:00:00Z" },
    reservation: { id: "res-alfa", confirmation_number: "HVN-alfa", guest_name: "Guest alfa", room_type: "Deluxe King", check_in: "2026-09-15", check_out: "2026-09-18" },
    labels: { purpose: "Reservation deposit", method: "GCash" },
    tax: TAX,
    documentNumber: "RCP-260918-A1B2C3",
    ...over,
  } as Parameters<typeof buildReceiptDocument>[0];
}

describe("the ordered row list every format shares", () => {
  it("puts the receipt number first when one exists and omits it entirely when not", () => {
    expect(receiptRows(doc())[0]).toEqual({ label: "Receipt number", value: "RCP-260918-A1B2C3" });
    // A dash would read as a missing value, so the row is dropped instead.
    expect(receiptRows(doc({ documentNumber: null })).map((row) => row.label)).not.toContain("Receipt number");
  });

  it("keeps the receipt number and the payment reference as separate rows", () => {
    const rows = receiptRows(doc());
    const number = rows.find((row) => row.label === "Receipt number");
    const reference = rows.find((row) => row.label === "Payment reference");
    expect(number?.value).not.toBe(reference?.value);
    expect(reference?.value).toBe("pay-alfa");
  });

  it("drops the customer's transfer reference when there is none", () => {
    expect(receiptRows(doc({ settlementReference: null })).map((row) => row.label)).not.toContain("Their reference");
  });

  it("itemises the inclusive tax after the amount paid, and emphasises both totals", () => {
    const rows = receiptRows(doc());
    const labels = rows.map((row) => row.label);
    expect(labels.slice(-5)).toEqual(["Amount paid", "Net subtotal", "Service charge (10%)", "VAT (12%)", "Gross total"]);
    expect(rows.filter((row) => row.emphasis).map((row) => row.label)).toEqual(["Amount paid", "Gross total"]);
  });

  it("shows no tax block at all for a payment with no breakdown", () => {
    const labels = receiptRows(doc({ tax: null })).map((row) => row.label);
    expect(labels).not.toContain("VAT (12%)");
    expect(labels.at(-1)).toBe("Amount paid");
  });

  it("reconciles: net + service charge + VAT is the gross total", () => {
    const rows = receiptRows(doc(), receiptMoneyFormatter("PHP"));
    const value = (label: string) => Number(rows.find((row) => row.label === label)?.value.replace(/[^0-9.]/g, ""));
    expect(value("Net subtotal") + value("Service charge (10%)") + value("VAT (12%)")).toBeCloseTo(value("Gross total"), 2);
  });
});

describe("value identity across formats", () => {
  it("prints the same numbers in the PDF as the model carries", () => {
    const pdf = ascii(receiptPdf(doc()));
    // Every ASCII row value is reproduced verbatim; the one non-ASCII row is the
    // stay range's en dash, which the PDF spells "-". No NUMBER is ever rewritten.
    const asciiRows = receiptRows(doc(), receiptMoneyFormatter("PHP")).filter((row) => /^[\x20-\x7E]+$/.test(row.value));
    expect(asciiRows.length).toBeGreaterThan(8);
    for (const row of asciiRows) expect(pdf).toContain(row.value);
  });

  it("differs from the on-screen form only by the currency symbol", () => {
    expect(receiptAmountText(1740)).toBe("PHP 1,740.00");
    const pdf = ascii(receiptPdf(doc()));
    expect(pdf).toContain("PHP 1,740.00");
    expect(pdf).not.toContain("₱");
  });
});

describe("receipt file names", () => {
  it("names by reservation and format", () => {
    expect(receiptFileName(doc(), "pdf")).toBe("HAVEN-Receipt-HVN-alfa.pdf");
    expect(receiptFileName(doc(), "png")).toBe("HAVEN-Receipt-HVN-alfa.png");
  });

  it("cannot escape the download directory or smuggle a separator", () => {
    for (const base of ["../../etc/passwd", "HVN alfa/../x", "HVN\\..\\alfa", "RCP 260918 · A1"]) {
      const name = receiptFileName(doc({ reservationNumber: base }), "pdf");
      expect(name).toMatch(/^HAVEN-Receipt-[A-Za-z0-9._-]+\.pdf$/);
      expect(name).not.toMatch(/[/\\]/);
      expect(name).not.toContain("..");
    }
  });

  it("falls back to the document number, then the payment id, when unnamed", () => {
    expect(receiptFileName(doc({ reservationNumber: "" }), "pdf")).toBe("HAVEN-Receipt-RCP-260918-A1B2C3.pdf");
    expect(receiptFileName(doc({ reservationNumber: "", documentNumber: null }), "pdf")).toBe("HAVEN-Receipt-pay-alfa.pdf");
  });

  it("still yields a usable name when every identifier is unusable", () => {
    expect(receiptFileName(doc({ reservationNumber: "···", documentNumber: null, paymentReference: "···" }), "png")).toBe("HAVEN-Receipt-payment.png");
  });
});

describe("the zero-dependency PDF writer", () => {
  it("emits a well-formed document whose xref offsets point at real objects", () => {
    const bytes = receiptPdf(doc());
    const text = ascii(bytes);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);

    const startxref = Number(text.slice(text.lastIndexOf("startxref") + 9).trim().split(/\s/)[0]);
    expect(text.slice(startxref, startxref + 4)).toBe("xref");
    // Every entry after the free head must land on its own "N 0 obj" header.
    const entries = text.slice(startxref).split("\n").slice(2).filter((line) => /\d+ 00000 n /.test(line));
    expect(entries).toHaveLength(6);
    entries.forEach((entry, index) => {
      const offset = Number(entry.slice(0, 10));
      expect(text.slice(offset, offset + `${index + 1} 0 obj`.length)).toBe(`${index + 1} 0 obj`);
    });
  });

  it("stays inside WinAnsi so no base-14 glyph is lost or misread", () => {
    // Accented letters are dropped rather than transliterated: the xref offsets
    // are string lengths, so anything TextEncoder would widen to two UTF-8 bytes
    // has to go.
    const text = ascii(receiptPdf(doc({ guestName: "Renée — O’Brien ₱", roomType: "Suite “Deluxe”" })));
    expect(text).toContain("Rene - O'Brien PHP");
    expect(text).toContain('Suite "Deluxe"');
  });

  it("escapes the parentheses and backslashes that would corrupt an object", () => {
    const text = ascii(receiptPdf(doc({ guestName: "\\ (trap)" })));
    expect(text).toContain("\\\\ \\(trap\\)");
  });

  it("base64-encodes the same bytes, for the email attachment", () => {
    const bytes = receiptPdf(doc());
    expect(receiptPdfBase64(doc())).toBe(Buffer.from(bytes).toString("base64"));
  });

  it("renders a tax-free payment without inventing a breakdown", () => {
    const text = ascii(receiptPdf(doc({ tax: null })));
    expect(text).toContain("settled, immutable payment record");
    expect(text).not.toContain("VAT");
  });
});

/** Latin-1 view of the bytes, so the assertions can read the PDF as text. */
function ascii(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
}
