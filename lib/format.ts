/**
 * Client-safe formatting helpers.
 *
 * Deliberately imports nothing: `lib/booking.ts` pulls in `lib/supabase` (and
 * through it `lib/env`), so a "use client" component importing `formatPeso`
 * from there dragged supabase-js and the env validator into the browser bundle.
 * No secret leaked — the service-role key is never NEXT_PUBLIC_, and the
 * browser's `process.env` shim is `{}` so the validator resolved to demo mode —
 * but it was pure dead weight on every client page.
 */
export function formatPeso(value: number | string) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value));
}

export const HOTEL_TIME_ZONE = "Asia/Manila";

/** Consistent human-readable timestamp for ordinary customer and staff UI. */
export function formatHotelDateTime(value: Date | string | number | null | undefined, timeZone = HOTEL_TIME_ZONE) {
  if (value === null || value === undefined || value === "") return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

/** Refund states an operator may still act on. Shared with the dashboard client. */
export const REFUND_RETRYABLE_STATUSES = ["pending", "failed"] as const;
export const isRefundActionable = (status: string) => (REFUND_RETRYABLE_STATUSES as readonly string[]).includes(status);
