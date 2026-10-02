import type { RecordItem } from "@/lib/types";
import { paymentSearchText } from "@/lib/payment-display";

/**
 * Staff workspace search predicate — the single rule behind every module's
 * search box. Deposit verification rows match guest/reservation/reference
 * text; Billing (invoices) matches guest, booking, reference, and status
 * only, so a fragment living in some other column can never match the whole
 * ledger; every other module matches the JSON-serialized row. Extracted from
 * the dashboard so the Billing path is unit-testable: a search value in the
 * field must always reach the visible rows and their count.
 */
export function filterStaffItems(items: RecordItem[], query: string, section: string): RecordItem[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return items;
  return items.filter((item) =>
    section === "payments"
      ? paymentSearchText(item).includes(normalized)
      : section === "invoices"
        ? invoiceSearchText(item).includes(normalized)
        : JSON.stringify(item).toLowerCase().includes(normalized),
  );
}

function invoiceSearchText(item: RecordItem): string {
  return [item.guest_name, item.reservation_id, item.id, item.reference, item.status, item.method]
    .filter((value) => value !== null && value !== undefined)
    .join(" ")
    .toLowerCase();
}
