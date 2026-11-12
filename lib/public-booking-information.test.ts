import { describe, expect, it } from "vitest";
import { DEFAULT_OPERATIONAL_POLICY } from "./hotel-policy";
import { publicCancellationSummary, publicHotelTime } from "./public-booking-information";
describe("public policy information", () => {
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
