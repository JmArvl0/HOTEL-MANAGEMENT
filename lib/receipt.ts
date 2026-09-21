/**
 * The canonical customer receipt document.
 *
 * One pure model, assembled server-side by `getCustomerReceipt`, read by every
 * surface: the preview modal, the printable sheet, the PNG painter, the PDF
 * writer and the email body. `receiptRows()` is the contract — all three
 * renderers walk the same ordered list, so a value edited in one format cannot
 * drift from the others, and the PDF cannot diverge from the preview.
 *
 * Client-safe on purpose: this imports ONLY lib/format. lib/customer.ts pulls in
 * lib/supabase, and lib/accounting.ts does too — reach either from here and the
 * service-role client lands in the browser bundle (the trap documented in
 * lib/format.ts). Labels and tax rates therefore arrive already resolved.
 */

import { formatHotelDateTime, formatPeso } from "@/lib/format";

/** Inclusive VAT breakdown, resolved server-side into printable strings. */
export type ReceiptTax = {
  netSubtotal: number;
  serviceCharge: number;
  vatAmount: number;
  grossTotal: number;
  /** Pre-formatted basis points, e.g. "10%" — lib/accounting's ratePercent(). */
  serviceChargeRate: string;
  vatRate: string;
};

export type ReceiptDocument = {
  /** A real financial_documents number (RCP-…), or null when none was ever
   *  issued. Never synthesised — an invented number is fabricated data. */
  documentNumber: string | null;
  /** The settled payment's own UUID. A different thing from documentNumber,
   *  and labelled as such. */
  paymentReference: string;
  reservationNumber: string;
  guestName: string;
  roomType: string;
  checkIn: string;
  checkOut: string;
  purposeLabel: string;
  methodLabel: string;
  settlementReference: string | null;
  verifiedAt: string;
  currency: string;
  amount: number;
  tax: ReceiptTax | null;
};

export type ReceiptInput = {
  payment: {
    id: string;
    amount: number;
    currency?: string | null;
    reference?: string | null;
    verified_at?: string | null;
    created_at: string;
  };
  reservation: {
    id: string;
    confirmation_number?: string | null;
    guest_name?: string | null;
    room_type?: string | null;
    check_in: string;
    check_out: string;
  };
  /** Friendly labels, resolved by the server via lib/customer's friendlyStatus. */
  labels: { purpose: string; method: string };
  tax: ReceiptTax | null;
  documentNumber: string | null;
};

export type ReceiptRow = { label: string; value: string; emphasis?: boolean };

/**
 * Whether a payment may carry an official receipt.
 *
 * Mirrors `accounting_generate_document`'s own predicate
 * (supabase/migrations/20260928010000_tax_aware_documents.sql): settled, and
 * not a refund. A refund is money leaving the guest, not a payment to them.
 */
export function receiptEligible(payment: { status: string; purpose: string }): boolean {
  return payment.status === "paid" && payment.purpose !== "refund";
}

export function buildReceiptDocument(input: ReceiptInput): ReceiptDocument {
  const { payment, reservation, labels, tax, documentNumber } = input;
  return {
    documentNumber,
    paymentReference: payment.id,
    reservationNumber: reservation.confirmation_number ?? reservation.id,
    guestName: reservation.guest_name ?? "—",
    roomType: reservation.room_type ?? "—",
    checkIn: reservation.check_in,
    checkOut: reservation.check_out,
    purposeLabel: labels.purpose,
    methodLabel: labels.method,
    settlementReference: payment.reference ?? null,
    verifiedAt: payment.verified_at ?? payment.created_at,
    currency: payment.currency ?? "PHP",
    amount: Number(payment.amount),
    tax
  };
}

/* Date-only stay bounds. lib/customer.ts has formatStayDate, but reaching it
   would drag supabase into the client bundle — three lines here is the cheaper
   side of that trade. */
const stayDate = (value: string) =>
  new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));

/**
 * The ordered receipt rows every renderer walks.
 *
 * `money` lets the PDF swap in a WinAnsi-safe formatter ("PHP 1,740.00") — the
 * base-14 fonts it must use have no ₱ glyph. Values always come from `doc`, so
 * only the currency symbol can differ between formats, never a number.
 */
export function receiptRows(doc: ReceiptDocument, money: (value: number) => string = formatPeso): ReceiptRow[] {
  const rows: ReceiptRow[] = [];
  // Omitted rather than dashed when absent: a dash reads like a missing value.
  if (doc.documentNumber) rows.push({ label: "Receipt number", value: doc.documentNumber });
  rows.push(
    { label: "Payment reference", value: doc.paymentReference },
    { label: "Reservation", value: doc.reservationNumber },
    { label: "Guest", value: doc.guestName },
    { label: "Room", value: doc.roomType },
    { label: "Stay", value: `${stayDate(doc.checkIn)} – ${stayDate(doc.checkOut)}` },
    { label: "Payment", value: doc.purposeLabel },
    { label: "Method", value: doc.methodLabel }
  );
  // The customer's own transfer/GCash reference — never the receipt number.
  if (doc.settlementReference) rows.push({ label: "Their reference", value: doc.settlementReference });
  rows.push(
    { label: "Verified", value: formatHotelDateTime(doc.verifiedAt) },
    { label: "Amount paid", value: money(doc.amount), emphasis: true }
  );
  if (doc.tax) {
    rows.push(
      { label: "Net subtotal", value: money(doc.tax.netSubtotal) },
      { label: `Service charge (${doc.tax.serviceChargeRate})`, value: money(doc.tax.serviceCharge) },
      { label: `VAT (${doc.tax.vatRate})`, value: money(doc.tax.vatAmount) },
      { label: "Gross total", value: money(doc.tax.grossTotal), emphasis: true }
    );
  }
  return rows;
}

/** The one explanatory line every format shares. */
export function receiptNote(doc: ReceiptDocument): string {
  return doc.tax
    ? "Rates are VAT-inclusive — service charge and VAT are itemised above and already included in the amount paid."
    : "This receipt is generated from Haven's settled, immutable payment record.";
}

/** "PHP 1,740.00" — ASCII, for the PDF's base-14 fonts. */
export function receiptAmountText(amount: number, currency = "PHP"): string {
  return `${currency} ${new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(amount))}`;
}

/** A money formatter bound to the document's currency, for receiptRows(). */
export const receiptMoneyFormatter = (currency: string) => (value: number) => receiptAmountText(value, currency);

/** HAVEN-Receipt-<reservation>.<ext> — filesystem-safe on every platform. */
export function receiptFileName(doc: ReceiptDocument, ext: "pdf" | "png"): string {
  const base = doc.reservationNumber || doc.documentNumber || doc.paymentReference.slice(0, 8);
  const safe = base.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/\.{2,}/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `HAVEN-Receipt-${safe || "payment"}.${ext}`;
}
