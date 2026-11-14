import { describe, expect, it } from "vitest";
import { DEFAULT_OPERATIONAL_POLICY } from "./hotel-policy";
import { publicCancellationSummary, publicHotelTime, publicDepositEstimate } from "./public-booking-information";
import { DEFAULT_DEPOSIT_POLICY } from "./booking";
describe("public policy information", () => {
  it("estimates the configured percentage deposit with centavo rounding", () => {
    expect(publicDepositEstimate(12800, DEFAULT_DEPOSIT_POLICY)).toBe(3840);
    expect(publicDepositEstimate(100.05, DEFAULT_DEPOSIT_POLICY)).toBe(30.02);
  });
  it("caps a fixed deposit at the stay total", () => {
    expect(publicDepositEstimate(100, { ...DEFAULT_DEPOSIT_POLICY, calculationType: "fixed", fixedAmount: 500 })).toBe(100);
  });
  it("does not advertise a deposit when the policy is disabled", () => {
    expect(publicDepositEstimate(12800, { ...DEFAULT_DEPOSIT_POLICY, enabled: false })).toBeNull();
  });
  it("describes all configured cancellation tiers and the hotel timezone", () => {
    const text = publicCancellationSummary({ ...DEFAULT_OPERATIONAL_POLICY, cancellationFullRefundDays: 7, cancellationPartialRefundDays: 3, cancellationPartialRefundBasisPoints: 5000 });
    expect(text).toContain("7 or more"); expect(text).toContain("3–6 days"); expect(text).toContain("50%"); expect(text).toContain("Fewer than 3"); expect(text).toContain("Asia/Manila");
  });
  it("omits empty tiers when refund thresholds coincide or start at zero", () => {
    const text = publicCancellationSummary({ ...DEFAULT_OPERATIONAL_POLICY, cancellationFullRefundDays: 0, cancellationPartialRefundDays: 0 });
    expect(text).not.toContain("–-1"); expect(text).not.toContain("Fewer than 0"); expect(text).toContain("0 or more");
  });
  it("formats hotel wall-clock times without using the viewer timezone", () => { expect(publicHotelTime("14:00")).toBe("2:00 PM"); });
});
