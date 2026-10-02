import type { RecordItem } from "@/lib/types";
import { paymentSearchText } from "@/lib/payment-display";

/**
 * Staff workspace search predicate — the single rule behind every module's
 * search box. Deposit verification rows match guest/reservation/reference
 * text; every other module matches the JSON-serialized row. Extracted from
 * the dashboard so the Billing (invoices) path is unit-testable: a search
 * value in the field must always reach the visible rows and their count.
 */
export function filterStaffItems(items: RecordItem[], query: string, section: string): RecordItem[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return items;
  return items.filter((item) =>
    section === "payments"
      ? paymentSearchText(item).includes(normalized)
      : JSON.stringify(item).toLowerCase().includes(normalized),
  );
}
