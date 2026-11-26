import { publicJson } from "@/lib/server-errors";
import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/authorization";
import { generateAndPersistInsights, generationCoolingDown, generateInsights, markDemoGeneration, GENERATION_COOLDOWN_MS } from "@/lib/analytics/runner";
import { supabase } from "@/lib/supabase";

/**
 * Analytics snapshot generation. Two authorized entry paths:
 *   1. Vercel's daily cron (18:35 UTC ≈ 02:35 Manila) with `Authorization: Bearer $CRON_SECRET`.
 *   2. An authorized Manager/Owner/Admin session pressing [Refresh predictions].
 * Both respect the same cooldown so the cron and manual refreshes cannot stampede.
 */

const AUTHORIZED_ROLES = new Set(["manager", "owner", "admin"]);

async function authorizationError(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret && request.headers.get("authorization") === `Bearer ${secret}`) return;
  if (request.method === "GET") return publicJson({ error: "Scheduled job authorization required." }, { status: 401 });
  const result = await requirePermission(role => AUTHORIZED_ROLES.has(role), "You don't have permission to refresh forecasts.");
  return result.error;
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}

async function run(request: NextRequest) {
  const denied = await authorizationError(request);
  if (denied) return denied;
  try {
    if (await generationCoolingDown()) {
      return publicJson({ error: `Predictions were generated recently. Try again within the hour (cooldown ${Math.round(GENERATION_COOLDOWN_MS / 60000)} minutes).` }, { status: 429 });
    }
    if (supabase) {
      const result = await generateAndPersistInsights();
      return publicJson({ data: { generatedAt: result.generatedAt, persisted: true, occupancyDays: result.occupancy.days.length, inventoryShortages: result.inventory.shortageCount, maintenanceElevated: result.maintenance.elevatedCount } });
    }
    const demo = await generateInsights();
    markDemoGeneration();
    return publicJson({ data: { generatedAt: demo.generatedAt, persisted: false, occupancyDays: demo.occupancy.days.length, inventoryShortages: demo.inventory.shortageCount, maintenanceElevated: demo.maintenance.elevatedCount, note: "Demo mode: forecasts computed in-memory; snapshots require a database." } });
  } catch (error) {
    if (error instanceof Error && error.message === "ANALYTICS_COOLDOWN")
      return publicJson({ error: "Predictions were generated recently. Try again within the hour." }, { status: 429 });
    return publicJson({ error: "Unable to generate predictions." }, { status: 500 });
  }
}
