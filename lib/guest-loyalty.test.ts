import { describe, expect, it } from "vitest";
import {
  ALL_LOYALTY_TIERS,
  NO_LOYALTY_TIER,
  distinctLoyaltyTiers,
  guestLoyaltyKey,
  hasUntieredGuests,
  loyaltyTierOptions,
  matchesLoyaltyTier,
} from "./guest-loyalty";

const rows = [
  { id: "GST-1", name: "Ava Thompson", loyalty_tier: "Gold" },
  { id: "GST-2", name: "Marcus Chen", loyalty_tier: "Silver" },
  { id: "GST-3", name: "Samantha Lee", loyalty_tier: "Member" },
  { id: "GST-4", name: "John Rivera", loyalty_tier: "Gold" },
  { id: "GST-5", name: "No Tier Guest", loyalty_tier: null },
  { id: "GST-6", name: "Blank Tier Guest", loyalty_tier: "  " },
];

describe("guest loyalty tiers", () => {
  it("keys rows by stored tier and groups null/blank tiers as no-tier", () => {
    expect(guestLoyaltyKey(rows[0])).toBe("Gold");
    expect(guestLoyaltyKey(rows[4])).toBe(NO_LOYALTY_TIER);
    expect(guestLoyaltyKey(rows[5])).toBe(NO_LOYALTY_TIER);
    expect(guestLoyaltyKey(null)).toBe(NO_LOYALTY_TIER);
  });

  it("orders canonical tiers Member/Silver/Gold, extra real values after", () => {
    expect(distinctLoyaltyTiers(rows)).toEqual(["Member", "Silver", "Gold"]);
    const withExtra = [...rows, { id: "GST-7", loyalty_tier: "Platinum" }];
    expect(distinctLoyaltyTiers(withExtra)).toEqual([
      "Member",
      "Silver",
      "Gold",
      "Platinum",
    ]);
  });

  it("derives options from the full dataset, independent of search", () => {
    // Options come from pre-search rows: a search for "Ava" must not shrink them.
    const searched = rows.filter((r) =>
      JSON.stringify(r).toLowerCase().includes("ava"),
    );
    expect(searched).toHaveLength(1);
    expect(loyaltyTierOptions(rows).map((o) => o.value)).toEqual([
      ALL_LOYALTY_TIERS,
      "Member",
      "Silver",
      "Gold",
      NO_LOYALTY_TIER,
    ]);
  });

  it("defaults to All loyalty tiers and only offers No tier when justified", () => {
    const options = loyaltyTierOptions(rows);
    expect(options[0]).toEqual({
      value: ALL_LOYALTY_TIERS,
      label: "All loyalty tiers",
    });
    const tieredOnly = rows.filter((r) => guestLoyaltyKey(r) !== NO_LOYALTY_TIER);
    expect(hasUntieredGuests(tieredOnly)).toBe(false);
    expect(
      loyaltyTierOptions(tieredOnly).some((o) => o.value === NO_LOYALTY_TIER),
    ).toBe(false);
  });

  it("filters by tier, restores with All, and combines with search", () => {
    const gold = rows.filter((r) => matchesLoyaltyTier(r, "Gold"));
    expect(gold.map((r) => r.id)).toEqual(["GST-1", "GST-4"]);
    // Search "john" AND Gold → only John Rivera.
    const combined = rows.filter(
      (r) =>
        JSON.stringify(r).toLowerCase().includes("john") &&
        matchesLoyaltyTier(r, "Gold"),
    );
    expect(combined.map((r) => r.id)).toEqual(["GST-4"]);
    // Search must not affect tier scope: All restores everything.
    expect(rows.filter((r) => matchesLoyaltyTier(r, ALL_LOYALTY_TIERS))).toHaveLength(
      rows.length,
    );
    // No-tier option matches only untiered records.
    expect(rows.filter((r) => matchesLoyaltyTier(r, NO_LOYALTY_TIER))).toHaveLength(2);
  });

  it("empty tier result is detectable for the empty state", () => {
    expect(rows.filter((r) => matchesLoyaltyTier(r, "Platinum"))).toHaveLength(0);
  });
});
