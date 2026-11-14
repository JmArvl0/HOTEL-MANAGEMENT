import type { RecordItem } from "@/lib/types";

export type BillingFolio = {
  key: string;
  invoice: RecordItem | null;
  reservation: RecordItem | null;
  deposits: RecordItem[];
  activity: RecordItem[];
  charges?: RecordItem[];
  adjustments?: RecordItem[];
};

export type BillingSnapshot = { today: string; folios: BillingFolio[]; demo?: boolean };

/** Keep every recorded entry with its invoice, falling back to the reservation link for legacy rows. */
export function attachBillingEntries(
  folios: BillingFolio[], payments: RecordItem[], charges: RecordItem[], adjustments: RecordItem[],
): BillingFolio[] {
  const rows = folios.map(row => ({ ...row, activity: [] as RecordItem[], charges: [] as RecordItem[], adjustments: [] as RecordItem[] }));
  const byInvoice = new Map(rows.filter(row => row.invoice?.id).map(row => [String(row.invoice?.id), row]));
  const byReservation = new Map(rows.filter(row => row.reservation?.id || row.invoice?.reservation_id)
    .map(row => [String(row.reservation?.id ?? row.invoice?.reservation_id), row]));
  const attach = (entries: RecordItem[], key: "activity" | "charges" | "adjustments") => {
    for (const entry of entries) {
      const row = entry.invoice_id ? byInvoice.get(String(entry.invoice_id)) : undefined;
      const target = row ?? (entry.reservation_id ? byReservation.get(String(entry.reservation_id)) : undefined);
      if (target) target[key].push(entry);
    }
  };
  attach(payments, "activity");
  attach(charges, "charges");
  attach(adjustments, "adjustments");
  return rows;
}

/** Prefer the invoice link for older records and keep pre-invoice deposits visible. */
export function attachBillingDeposits(
  folios: BillingFolio[],
  pending: { payment: RecordItem; reservation: RecordItem | null }[],
) {
  const rows = folios.map(row => ({ ...row, deposits: [...row.deposits] }));
  const byInvoice = new Map(rows.map(row => [row.invoice?.id, row]));
  const byReservation = new Map<string, BillingFolio>();
  for (const row of rows) {
    const id = row.reservation?.id;
    if (id && !byReservation.has(id)) byReservation.set(id, row);
  }
  for (const { payment, reservation } of pending) {
    const reservationId = String(payment.reservation_id ?? "");
    let row = byInvoice.get(String(payment.invoice_id ?? "")) ?? byReservation.get(reservationId);
    if (!row) {
      const key = reservationId ? `reservation:${reservationId}` : `payment:${payment.id}`;
      row = { key, invoice: null, reservation, deposits: [], activity: [], charges: [], adjustments: [] };
      rows.push(row);
      if (reservationId) byReservation.set(reservationId, row);
    }
    row.deposits.push(payment);
  }
  return rows;
}
