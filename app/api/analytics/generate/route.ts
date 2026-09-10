import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { generateAndPersistInsights, generationCoolingDown, generateInsights, markDemoGeneration, GENERATION_COOLDOWN_MS } from "@/lib/analytics/runner";
import { supabase } from "@/lib/supabase";

/**
 * Analytics snapshot generation. Two authorized entry paths:
 *   1. Vercel's daily cron (18:35 UTC ≈ 02:35 Manila) with `Authorization: Bearer $CRON_SECRET`.
 *   2. An authorized Manager/Owner/Admin session pressing [Refresh predictions].
 * Both respect the same cooldown so the cron and manual refreshes cannot stampede.
 */

const AUTHORIZED_ROLES = new Set(["manager", "owner", "admin"]);

async function authorized(request: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret && request.headers.get("authorization") === `Bearer ${secret}`) return true;
  const session = await getServerSession(authOptions);
  return Boolean(session && !session.user.disabled && AUTHORIZED_ROLES.has(session.user.role));
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}

async function run(request: NextRequest) {
  if (!(await authorized(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    if (await generationCoolingDown()) {
      return NextResponse.json({ error: `Predictions were generated recently. Try again within the hour (cooldown ${Math.round(GENERATION_COOLDOWN_MS / 60000)} minutes).` }, { status: 429 });
    }
    if (supabase) {
      const result = await generateAndPersistInsights();
      return NextResponse.json({ data: { generatedAt: result.generatedAt, persisted: true, occupancyDays: result.occupancy.days.length, inventoryShortages: result.inventory.shortageCount, maintenanceElevated: result.maintenance.elevatedCount } });
    }
    const demo = await generateInsights();
    markDemoGeneration();
    return NextResponse.json({ data: { generatedAt: demo.generatedAt, persisted: false, occupancyDays: demo.occupancy.days.length, inventoryShortages: demo.inventory.shortageCount, maintenanceElevated: demo.maintenance.elevatedCount, note: "Demo mode: forecasts computed in-memory; snapshots require a database." } });
  } catch {
    return NextResponse.json({ error: "Unable to generate predictions." }, { status: 500 });
  }
}
