import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: null }));
vi.mock("@/lib/hotel-policy", () => ({
  getOperationalPolicy: async () => ({
    checkInTime: "15:00",
    checkOutTime: "12:00",
    hotelTimezone: "Asia/Manila",
    cancellationFullRefundDays: 14,
    cancellationPartialRefundDays: 7,
    cancellationPartialRefundBasisPoints: 5000,
    incidentalsDue: "At checkout",
    petsAllowed: false,
    smokingAllowed: false,
  }),
}));
vi.mock("@/lib/request-catalog", () => ({
  portalCatalogOptions: async () => [
    { value: "extra_towels", label: "Extra towels" },
    { value: "housekeeping", label: "Housekeeping request" },
  ],
}));

import {
  GUEST_CONCIERGE_UNAVAILABLE_MESSAGE,
  GuestConciergeReplySchema,
  buildGuestConciergeContext,
  guestConciergeContents,
} from "@/lib/ai/guest-concierge";

describe("guest concierge", () => {
  it("builds policy + catalog context without a stay", async () => {
    const ctx = await buildGuestConciergeContext("user-1");
    expect(ctx.policy).toContain("15:00");
    expect(ctx.catalog.map((c) => c.value)).toContain("extra_towels");
    expect(ctx.stay.reservationId).toBeNull();
  });

  it("prompt contents carry no PII fields", async () => {
    const ctx = await buildGuestConciergeContext("user-1");
    const text = guestConciergeContents(ctx, "What time is checkout?", []);
    for (const banned of ["password", "proof", "card", "folio", "payment", "email"]) {
      expect(text.toLowerCase()).not.toContain(banned);
    }
  });

  it("validates structured reply shape", () => {
    const good = {
      replyText: "Checkout is at noon.",
      suggestedPicks: ["Late checkout?"],
      actionDraft: { requestTypes: ["extra_towels"], description: "", reservationId: "RSV-1" },
    };
    expect(GuestConciergeReplySchema.safeParse(good).success).toBe(true);
    expect(GuestConciergeReplySchema.safeParse({ replyText: "" }).success).toBe(false);
  });

  it("has a friendly degraded fallback message", () => {
    expect(GUEST_CONCIERGE_UNAVAILABLE_MESSAGE).toMatch(/temporarily unavailable/);
  });
});
