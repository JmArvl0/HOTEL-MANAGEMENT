// Guest Loyalty & Rewards — pure tier/points math plus source-scan contracts
// pinning the guarantees: append-only ledger, idempotent award, guarded
// redemption, reason-required adjustments, and role-gated routes.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  normalizeTier, tierForSpend, pointsForStay, nextTier, spendToNextTier, tierProgress, tierLabel,
  TIER_THRESHOLDS, TIER_MULTIPLIERS, POINTS_TO_PESO
} from "./loyalty";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("tier math", () => {
  it("thresholds are 0 / 20000 / 50000 lifetime settled spend", () => {
    expect(TIER_THRESHOLDS).toEqual({ silver: 0, gold: 20000, platinum: 50000 });
    expect(tierForSpend(0)).toBe("silver");
    expect(tierForSpend(19999.99)).toBe("silver");
    expect(tierForSpend(20000)).toBe("gold");
    expect(tierForSpend(49999.99)).toBe("gold");
    expect(tierForSpend(50000)).toBe("platinum");
  });

  it("multipliers are 1 / 1.25 / 1.5 with 1 point per PHP 100", () => {
    expect(TIER_MULTIPLIERS).toEqual({ silver: 1, gold: 1.25, platinum: 1.5 });
    expect(pointsForStay(10000, "silver")).toBe(100);
    expect(pointsForStay(10000, "gold")).toBe(125);
    expect(pointsForStay(10000, "platinum")).toBe(150);
    expect(pointsForStay(9999, "silver")).toBe(99); // floor, never rounds up
    expect(pointsForStay(0, "gold")).toBe(0);
    expect(pointsForStay(-50, "silver")).toBe(0);
  });

  it("normalizes legacy and messy tier values to the governed set", () => {
    expect(normalizeTier("Gold")).toBe("gold");
    expect(normalizeTier("Member")).toBe("silver");
    expect(normalizeTier(null)).toBe("silver");
    expect(normalizeTier("  PLATINUM ")).toBe("platinum");
    expect(tierLabel("gold")).toBe("Gold");
  });

  it("progress reports spend remaining and band position", () => {
    expect(nextTier("silver")).toBe("gold");
    expect(nextTier("platinum")).toBeNull();
    expect(spendToNextTier(5000, "silver")).toBe(15000);
    expect(spendToNextTier(60000, "platinum")).toBe(0);
    expect(tierProgress(10000, "silver")).toBeCloseTo(0.5);
    expect(tierProgress(60000, "platinum")).toBe(1);
  });

  it("redemption is worth PHP 1 per point", () => {
    expect(POINTS_TO_PESO).toBe(1);
  });
});

describe("loyalty migration (20261015010000_guest_loyalty_submodule.sql)", () => {
  const migration = read("supabase/migrations/20261015010000_guest_loyalty_submodule.sql");

  it("governs tiers, backfills legacy values, and tracks lifetime spend", () => {
    expect(migration).toContain("lifetime_spend");
    expect(migration).toContain("guests_loyalty_tier_check");
    expect(migration).toContain("('silver','gold','platinum')");
    expect(migration).toContain("Member");
  });

  it("creates an append-only ledger with one-earned-per-stay idempotency", () => {
    expect(migration).toContain("create table if not exists public.guest_loyalty_ledger");
    expect(migration).toContain("'earned','redeemed','adjusted','expired'");
    expect(migration).toContain("guest_loyalty_one_earned_per_stay");
    expect(migration).toContain("protect_loyalty_ledger");
    expect(migration).toContain("LOYALTY_LEDGER_IMMUTABLE");
  });

  it("awards on checkout with locks, tier multipliers, and no-downgrade upgrades", () => {
    expect(migration).toContain("create or replace function public.award_stay_loyalty_points");
    expect(migration).toContain("for update");
    expect(migration).toContain("LOYALTY_STAY_NOT_COMPLETED");
    expect(migration).toContain("already_awarded");
    expect(migration).toContain("loyalty_award_on_checkout");
    expect(migration).toContain("loyalty_award_failed"); // fail-safe: never breaks checkout
    expect(migration).toContain("actor is null or actor"); // null-safe guard rule
  });

  it("redeems against balance with ownership, folio, and idempotency guards", () => {
    expect(migration).toContain("create or replace function public.redeem_loyalty_points");
    expect(migration).toContain("LOYALTY_INSUFFICIENT_POINTS");
    expect(migration).toContain("LOYALTY_NOT_YOUR_POINTS");
    expect(migration).toContain("LOYALTY_ALREADY_REDEEMED");
    expect(migration).toContain("financial_adjustments");
    expect(migration).toContain("'credit','credit'");
  });

  it("restricts adjustments to manager/owner/admin with a required reason", () => {
    expect(migration).toContain("create or replace function public.adjust_loyalty_points");
    expect(migration).toContain("LOYALTY_ADJUST_FORBIDDEN");
    expect(migration).toContain("LOYALTY_REASON_REQUIRED");
    expect(migration).toContain("'adjusted'");
  });

  it("locks everything to the service role with null-safe actor guards", () => {
    expect(migration).toContain("to service_role");
    expect(migration).toContain("from anon,authenticated");
  });
});

describe("loyalty route contracts", () => {
  it("guest routes are guest-only and delegate to the RPCs", () => {
    const get = read("app/api/account/loyalty/route.ts");
    expect(get).toContain('role !== "guest"');
    expect(get).toContain('from("guest_loyalty_ledger")');
    const redeem = read("app/api/account/loyalty/redeem/route.ts");
    expect(redeem).toContain('rpc("redeem_loyalty_points"');
    expect(redeem).toContain("LOYALTY_INSUFFICIENT_POINTS");
    expect(redeem).toContain("idempotencyKey");
  });

  it("staff adjustment is manager/owner/admin with amount + reason validation", () => {
    const adjust = read("app/api/staff/guests/[id]/loyalty/route.ts");
    expect(adjust).toMatch(/\["manager",\s*"owner",\s*"admin"\]/);
    expect(adjust).toContain('rpc("adjust_loyalty_points"');
  });

  it("the dossier carries tier, points, and lifetime spend", () => {
    expect(read("lib/staff-data.ts")).toContain("loyalty_tier,loyalty_points,lifetime_spend");
  });
});

describe("loyalty surface contracts", () => {
  it("guest nav, panel, dossier badge, and redemption widget exist", () => {
    expect(read("components/customer/customer-shell.tsx")).toContain("/account/loyalty");
    const panel = read("components/customer/loyalty-card-panel.tsx");
    expect(panel).toContain("progressbar");
    expect(panel).toContain("/api/account/loyalty");
    const dossier = read("components/manager/manager-dashboard-client.tsx");
    expect(dossier).toContain("badge-loyalty-");
    const widget = read("components/booking/loyalty-redemption-selector.tsx");
    expect(widget).toContain("/api/account/loyalty/redeem");
    expect(widget).toContain("1 point = ₱1");
  });
});
