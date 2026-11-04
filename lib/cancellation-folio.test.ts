import { describe, expect, it } from "vitest";
import { previewCancellationRefund } from "@/lib/cancellation-preview";

import { folioMoney } from "@/lib/customer";

const policy = { fullRefundDays: 14, partialRefundDays: 7, partialRefundBasisPoints: 5000, hotelTimezone: "Asia/Manila" };
describe("explicit cancellation preview", () => {
  it("separates the policy fee from the resulting refundable credit", () => {
    const result = previewCancellationRefund({ checkIn: "2026-11-13", today: "2026-11-03", depositPaid: 5000, netPaid: 7000, policy });
    expect(result.feeAmount).toBe(2500);
    expect(result.eligibleAmount).toBe(4500);
  });
  it("rounds a half-cent refund before deriving the fee", () => {
    const result = previewCancellationRefund({ checkIn: "2026-11-13", today: "2026-11-03", depositPaid: 0.03, policy });
    expect(result.feeAmount).toBe(0.01);
    expect(result.eligibleAmount).toBe(0.02);
  });
});

it("shows received payments including the unapplied refundable credit", () => {
  expect(folioMoney({total:10000,invoice:{amount:2500,paid:2500,credit_balance:2500,balance:0,status:"refund_pending"}}).paid).toBe(5000);
});

it("preserves independent service charges when calculating the refund", () => {
  expect(previewCancellationRefund({checkIn:"2026-11-13",today:"2026-11-03",depositPaid:5000,retainedCharges:500,policy}).eligibleAmount).toBe(2000);
});
