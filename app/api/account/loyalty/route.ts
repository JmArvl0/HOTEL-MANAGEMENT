import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { normalizeTier, tierProgress, spendToNextTier, nextTier, tierLabel, type LoyaltyTier } from "@/lib/loyalty";

// Guest's own loyalty dashboard: balance, tier, progress, ledger history.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "guest") return NextResponse.json({ error: "Guest access required." }, { status: 403 });
  if (!supabase) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  const { data: guest } = await supabase.from("guests").select("id,loyalty_tier,loyalty_points,lifetime_spend").eq("user_account_id", session.user.id).maybeSingle();
  if (!guest) return NextResponse.json({ data: { points: 0, tier: "silver" as LoyaltyTier, tierLabel: "Silver", lifetimeSpend: 0, nextTier: "gold" as LoyaltyTier, nextTierLabel: "Gold", spendToNext: 20000, progress: 0, ledger: [] } });
  const tier = normalizeTier((guest as { loyalty_tier?: string }).loyalty_tier);
  const lifetimeSpend = Number((guest as { lifetime_spend?: number }).lifetime_spend ?? 0);
  const { data: ledger } = await supabase.from("guest_loyalty_ledger")
    .select("id,points,transaction_type,notes,reservation_id,created_at")
    .eq("guest_id", (guest as { id: string }).id).order("created_at", { ascending: false }).limit(100);
  const upcoming = nextTier(tier);
  return NextResponse.json({
    data: {
      points: Number((guest as { loyalty_points?: number }).loyalty_points ?? 0),
      tier, tierLabel: tierLabel(tier), lifetimeSpend,
      nextTier: upcoming, nextTierLabel: upcoming ? tierLabel(upcoming) : null,
      spendToNext: spendToNextTier(lifetimeSpend, tier),
      progress: tierProgress(lifetimeSpend, tier),
      ledger: ledger ?? []
    }
  });
}
