import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { generateInsights, evaluatePredictions } from "@/lib/analytics/runner";
import { supabase } from "@/lib/supabase";

/**
 * Predictive insights for authorized staff. Forecasts are computed live from
 * operational data (the queries are targeted and the property is small);
 * persisted snapshots exist for the run history and prediction-vs-actual
 * evaluation. Front Desk receives the operational subset only — no financial
 * or inventory detail.
 */

const FULL_ROLES = new Set(["manager", "owner", "admin"]);
const FRONT_DESK_ROLE = "front_desk";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!FULL_ROLES.has(session.user.role) && session.user.role !== FRONT_DESK_ROLE) {
    return NextResponse.json({ error: "Analytics access required." }, { status: 403 });
  }
  try {
    const insights = await generateInsights();
    const full = FULL_ROLES.has(session.user.role);

    // Last persisted snapshot time (run history is written by the cron / manual refresh).
    let lastSnapshotAt: string | null = null;
    let snapshotCount = 0;
    if (supabase) {
      const { data } = await supabase.from("analytics_model_runs").select("generated_at").order("generated_at", { ascending: false }).limit(100);
      snapshotCount = data?.length ?? 0;
      lastSnapshotAt = data?.[0]?.generated_at ?? null;
    }

    if (!full) {
      // Front Desk operational subset: occupancy + housekeeping only.
      return NextResponse.json({
        data: {
          generatedAt: insights.generatedAt,
          lastSnapshotAt,
          snapshotCount,
          occupancy: insights.occupancy,
          housekeeping: insights.housekeeping
        }
      });
    }

    const metrics = supabase ? await evaluatePredictions() : null;
    return NextResponse.json({
      data: {
        generatedAt: insights.generatedAt,
        lastSnapshotAt,
        snapshotCount,
        occupancy: insights.occupancy,
        housekeeping: insights.housekeeping,
        inventory: insights.inventory,
        maintenance: insights.maintenance,
        metrics,
        databaseMode: supabase ? "supabase" : "demo"
      }
    });
  } catch {
    return NextResponse.json({ error: "Unable to load predictions." }, { status: 500 });
  }
}
