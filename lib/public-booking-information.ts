import type { DepositPolicy } from "./booking";
import type { OperationalPolicy } from "./hotel-policy";

export type PublicBookingInformation = { deposit: DepositPolicy; operations: OperationalPolicy };
export function publicDepositLabel(deposit: DepositPolicy) {
  return deposit.calculationType === "percentage" ? `${deposit.percentageBasisPoints / 100}%` : new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(deposit.fixedAmount);
}
export function publicHotelTime(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 0, 1, hour, minute)));
}
export function publicCancellationSummary(policy: OperationalPolicy) {
  const full = policy.cancellationFullRefundDays, partial = policy.cancellationPartialRefundDays;
  const middle = partial < full ? `${partial}–${full - 1} days before check-in: ${policy.cancellationPartialRefundBasisPoints / 100}% of that deposit. ` : "";
  const none = partial > 0 ? `Fewer than ${Math.min(partial, full)} days: no deposit refund. ` : "";
  return `Cancel ${full} or more calendar days before check-in: 100% refund of the verified deposit paid. ${middle}${none}Days use ${policy.hotelTimezone}.`;
}
