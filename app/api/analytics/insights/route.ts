import { publicJson } from "@/lib/server-errors";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { generateInsights } from "@/lib/analytics/runner";
import { readRecordedOccupancy } from "@/lib/analytics/evaluation-data";
import { shiftDate } from "@/lib/analytics/types";
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
  if (!session || session.user.disabled || session.user.otpPending) return publicJson({ error: "Please sign in to continue." }, { status: 401 });
  if (!FULL_ROLES.has(session.user.role) && session.user.role !== FRONT_DESK_ROLE) {
    return publicJson({ error: "Analytics access required." }, { status: 403 });
  }
  try {
    const insights = await generateInsights();
    const full = FULL_ROLES.has(session.user.role);

    // Last persisted snapshot time (run history is written by the cron / manual refresh).
    let lastSnapshotAt: string | null = null;
    let snapshotCount = 0;
    let snapshotUnavailable = false;
    if (supabase) {
      const { data, error } = await supabase.from("analytics_model_runs").select("generated_at").eq("status", "completed").order("generated_at", { ascending: false }).limit(100);
      snapshotUnavailable = Boolean(error);
      snapshotCount = data?.length ?? 0;
      lastSnapshotAt = data?.[0]?.generated_at ?? null;
    }

    if (!full) {
      // Front Desk operational subset: occupancy + housekeeping only.
      return publicJson({
        data: {
          generatedAt: insights.generatedAt,
          lastSnapshotAt,
          snapshotCount,
          occupancy: insights.occupancy,
          housekeeping: insights.housekeeping
        }
      });
    }

    // Closed-night evidence is optional. Its absence must not hide the live outlook.
    const today = insights.occupancy.today;
    const history = await readRecordedOccupancy(shiftDate(today, -14), shiftDate(today, -1))
      .catch(() => null);
    return publicJson({
      data: {
        generatedAt: insights.generatedAt,
        lastSnapshotAt,
        snapshotCount,
        snapshotUnavailable,
        occupancy: {
          historyUnavailable: history === null,
          ...insights.occupancy,
          history: Array.from({ length: 14 }, (_, index) => {
            const date = shiftDate(today, index - 14);
            return { date, percent: history?.get(date)?.percent ?? null };
          })
        },
        housekeeping: insights.housekeeping,
        inventory: insights.inventory,
        maintenance: insights.maintenance,
        databaseMode: supabase ? "supabase" : "demo"
      }
    });
  } catch {
    return publicJson({ error: "Unable to load predictions." }, { status: 500 });
  }
}
