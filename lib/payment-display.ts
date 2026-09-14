import type { RecordItem } from "@/lib/types";

export const HOTEL_TIME_ZONE = "Asia/Manila";

export function paymentSearchText(item: RecordItem) {
  const reservation = item.reservation as RecordItem | null | undefined;
  return [
    reservation?.guest_name,
    reservation?.confirmation_number,
    item.reservation_id,
    item.reference,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

const paymentStamp = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: HOTEL_TIME_ZONE,
});

export function formatPaymentSubmittedAt(value: unknown) {
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime())
    ? String(value ?? "—")
    : paymentStamp.format(date);
}
