/**
 * Customer cancellation preview — pure, display-only math.
 *
 * Mirrors the authoritative `cancel_reservation` RPC semantics (booking-time
 * snapshot first, hotel-timezone day count, paid-deposit basis, basis points)
 * so the modal can show consequences BEFORE the customer commits. The RPC
 * always recalculates on execution; this helper never writes anything and its
 * output is never trusted for settlement.
 */
export type CancellationEligibility = "full" | "partial" | "none";

export interface CancellationPolicyWindows {
  fullRefundDays: number;
  partialRefundDays: number;
  partialRefundBasisPoints: number;
  hotelTimezone: string;
}

export interface CancellationPreview {
  eligibility: CancellationEligibility;
  eligibleAmount: number;
  depositPaid: number;
  basisPoints: number;
  daysBefore: number;
  policySummary: string;
}

const DEFAULTS: CancellationPolicyWindows = {
  fullRefundDays: 14,
  partialRefundDays: 7,
  partialRefundBasisPoints: 5000,
  hotelTimezone: "Asia/Manila",
};

const num = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/** Read cancellation windows from a booking-time snapshot (camelCase, as frozen by the snapshot trigger). */
export function cancellationWindowsFromSnapshot(snapshot: unknown): CancellationPolicyWindows {
  const row = (snapshot ?? {}) as Record<string, unknown>;
  const tz = typeof row.hotelTimezone === "string" && row.hotelTimezone ? row.hotelTimezone : DEFAULTS.hotelTimezone;
  return {
    fullRefundDays: num(row.cancellationFullRefundDays, DEFAULTS.fullRefundDays),
    partialRefundDays: num(row.cancellationPartialRefundDays, DEFAULTS.partialRefundDays),
    partialRefundBasisPoints: num(row.cancellationPartialRefundBasisPoints, DEFAULTS.partialRefundBasisPoints),
    hotelTimezone: tz,
  };
}

export function previewCancellationRefund(input: {
  checkIn: string;
  today: string;
  policy: CancellationPolicyWindows;
  depositPaid: number;
}): CancellationPreview {
  const daysBefore = Math.round(
    (Date.parse(`${input.checkIn}T00:00:00Z`) - Date.parse(`${input.today}T00:00:00Z`)) / 86400000,
  );
  const basisPoints =
    daysBefore >= input.policy.fullRefundDays
      ? 10000
      : daysBefore >= input.policy.partialRefundDays
        ? input.policy.partialRefundBasisPoints
        : 0;
  // Centavo-exact, matching round(deposit_paid * basis / 10000, 2) in the RPC.
  const eligibleAmount = Math.max(0, Math.round(Number(input.depositPaid) * basisPoints) / 100) / 100;
  const eligibility: CancellationEligibility =
    basisPoints >= 10000 ? "full" : basisPoints > 0 ? "partial" : "none";
  const rate = input.policy.partialRefundBasisPoints / 100;
  const policySummary =
    `Full refund for cancellations ${input.policy.fullRefundDays}+ days before check-in · ` +
    `${rate}% refund ${input.policy.partialRefundDays}–${Math.max(input.policy.partialRefundDays, input.policy.fullRefundDays - 1)} days before · ` +
    `no refund within ${input.policy.partialRefundDays} days.`;
  return {
    eligibility,
    eligibleAmount,
    depositPaid: Math.max(0, Number(input.depositPaid) || 0),
    basisPoints,
    daysBefore,
    policySummary,
  };
}
