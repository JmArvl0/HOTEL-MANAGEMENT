import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { runGuestReminders } from "@/lib/guest-reminders";

/**
 * Daily guest-reminder pass (roadmap Phase 4): pre-arrival emails for confirmed
 * reservations arriving tomorrow and pre-departure emails for in-house guests
 * leaving tomorrow. Two authorized entry paths, same guard pattern as
 * /api/analytics/generate:
 *   1. Vercel's daily cron (01:05 UTC ≈ 09:05 Manila) with `Authorization: Bearer $CRON_SECRET`.
 *   2. An authorized Manager/Owner/Admin session hitting it manually.
 * Sends are idempotent (unique delivery per reservation+kind), so retries and
 * re-runs never duplicate. Email failure marks the delivery failed; nothing here
 * can affect hotel operations.
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
  if (!supabase) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  try {
    const summary = await runGuestReminders();
    return NextResponse.json({ data: summary });
  } catch (error) {
    console.error("guest reminder pass failed", error);
    return NextResponse.json({ error: "Unable to run guest reminders." }, { status: 500 });
  }
}
