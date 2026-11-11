import type { RecordItem } from "@/lib/types";

export type BillingFolio = {
  key: string;
  invoice: RecordItem | null;
  reservation: RecordItem | null;
  deposits: RecordItem[];
  activity: RecordItem[];
};

export type BillingSnapshot = { today: string; folios: BillingFolio[]; demo?: boolean };

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
      row = { key, invoice: null, reservation, deposits: [], activity: [] };
      rows.push(row);
      if (reservationId) byReservation.set(reservationId, row);
    }
    row.deposits.push(payment);
  }
  return rows;
}
