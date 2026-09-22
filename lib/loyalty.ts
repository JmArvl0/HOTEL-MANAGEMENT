// Guest Loyalty & Rewards — pure helpers. DB authority lives in the
// 20261015010000 RPCs; these mirror the math for display only, never charges.

export type LoyaltyTier = "silver" | "gold" | "platinum";

export const LOYALTY_TIERS: LoyaltyTier[] = ["silver", "gold", "platinum"];
export const TIER_THRESHOLDS: Record<LoyaltyTier, number> = { silver: 0, gold: 20000, platinum: 50000 };
export const TIER_MULTIPLIERS: Record<LoyaltyTier, number> = { silver: 1, gold: 1.25, platinum: 1.5 };
/** 1 point redeems for PHP 1 of folio credit. */
export const POINTS_TO_PESO = 1;

export function normalizeTier(value: unknown): LoyaltyTier {
  const t = String(value ?? "").trim().toLowerCase();
  if (t === "gold") return "gold";
  if (t === "platinum") return "platinum";
  return "silver";
}

export function tierForSpend(lifetimeSpend: number): LoyaltyTier {
  const s = Number(lifetimeSpend ?? 0);
  if (s >= TIER_THRESHOLDS.platinum) return "platinum";
  if (s >= TIER_THRESHOLDS.gold) return "gold";
  return "silver";
}

/** Points earned for a stay: floor(total / 100 x tier multiplier). */
export function pointsForStay(total: number, tier: LoyaltyTier): number {
  return Math.floor(Math.max(0, Number(total ?? 0)) / 100 * TIER_MULTIPLIERS[tier]);
}

export function nextTier(tier: LoyaltyTier): LoyaltyTier | null {
  if (tier === "silver") return "gold";
  if (tier === "gold") return "platinum";
  return null;
}

/** Spend remaining to reach the next tier (0 when at platinum). */
export function spendToNextTier(lifetimeSpend: number, tier: LoyaltyTier): number {
  const next = nextTier(tier);
  if (!next) return 0;
  return Math.max(0, TIER_THRESHOLDS[next] - Number(lifetimeSpend ?? 0));
}

/** 0-1 progress within the current tier band (1 at platinum). */
export function tierProgress(lifetimeSpend: number, tier: LoyaltyTier): number {
  const next = nextTier(tier);
  if (!next) return 1;
  const base = TIER_THRESHOLDS[tier];
  const span = TIER_THRESHOLDS[next] - base;
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (Number(lifetimeSpend ?? 0) - base) / span));
}

export function tierLabel(tier: LoyaltyTier): string {
  return tier === "silver" ? "Silver" : tier === "gold" ? "Gold" : "Platinum";
}
