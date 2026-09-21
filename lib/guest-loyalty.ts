/** Guest loyalty-tier filtering helpers.
 *
 * Source of truth: `guests.loyalty_tier` is free `text` with a database
 * default of `'Member'` (see `supabase/migrations/20260826125341_*`). There
 * is no loyalty enum, config table, or assignment service anywhere in HAVEN —
 * the only values ever recorded are Member, Silver, and Gold. These helpers
 * therefore derive the filter options from the loaded rows (canonical tiers
 * first, any other real database values alphabetically after) and never
 * invent tiers. They read loyalty data only; assignments are never modified.
 */

export const ALL_LOYALTY_TIERS = "all";
export const NO_LOYALTY_TIER = "__none__";
export const NO_LOYALTY_TIER_LABEL = "No tier";
export const ALL_LOYALTY_TIERS_LABEL = "All loyalty tiers";

/** Tiers HAVEN actually uses, in display order. Anything else found in real
 * rows is appended alphabetically by `distinctLoyaltyTiers`. */
const CANONICAL_TIERS = ["Member", "Silver", "Gold"] as const;

const isTiered = (value: unknown): value is string =>
  typeof value === "string" && value.trim() !== "";

/** Normalized filter key for one guest row. Records with NULL, empty, or
 * whitespace-only tiers share the `NO_LOYALTY_TIER` key. */
export function guestLoyaltyKey(
  item: Record<string, unknown> | null | undefined,
): string {
  const raw = item?.loyalty_tier;
  return isTiered(raw) ? raw : NO_LOYALTY_TIER;
}

/** Distinct tier options from the FULL loaded dataset (call with pre-search
 * rows so options never disappear while the user types). Canonical tiers
 * first, extra real values alphabetically after. */
export function distinctLoyaltyTiers(
  rows: readonly (Record<string, unknown> | null | undefined)[],
): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    const raw = row?.loyalty_tier;
    if (isTiered(raw)) seen.add(raw);
  }
  const canonical = CANONICAL_TIERS.filter((tier) => seen.has(tier));
  const extra = [...seen]
    .filter((tier) => !(CANONICAL_TIERS as readonly string[]).includes(tier))
    .sort((a, b) => a.localeCompare(b));
  return [...canonical, ...extra];
}

/** Whether any loaded row lacks a tier — the only case where the
 * `NO_LOYALTY_TIER` option is offered. */
export function hasUntieredGuests(
  rows: readonly (Record<string, unknown> | null | undefined)[],
): boolean {
  return rows.some((row) => !isTiered(row?.loyalty_tier));
}

export type LoyaltyTierOption = { value: string; label: string };

/** Dropdown options: "All loyalty tiers" first, then real tiers, then
 * "No tier" only when untiered rows actually exist. */
export function loyaltyTierOptions(
  rows: readonly (Record<string, unknown> | null | undefined)[],
): LoyaltyTierOption[] {
  const options: LoyaltyTierOption[] = [
    { value: ALL_LOYALTY_TIERS, label: ALL_LOYALTY_TIERS_LABEL },
    ...distinctLoyaltyTiers(rows).map((tier) => ({ value: tier, label: tier })),
  ];
  if (hasUntieredGuests(rows))
    options.push({ value: NO_LOYALTY_TIER, label: NO_LOYALTY_TIER_LABEL });
  return options;
}

/** Tier predicate — ANDed with the existing search match. `"all"` disables
 * the tier restriction (untiered guests included). */
export function matchesLoyaltyTier(
  item: Record<string, unknown> | null | undefined,
  tier: string,
): boolean {
  return tier === ALL_LOYALTY_TIERS || guestLoyaltyKey(item) === tier;
}
