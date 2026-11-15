import { logServerError, publicJson } from "@/lib/server-errors";

import { reconcileXenditAttempts } from "@/lib/xendit-store";
import { xenditConfigured } from "@/lib/xendit";
import { getServerSession } from "next-auth";
import { NextRequest } from "next/server";
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
  if (request.method === "GET") return false;
  const session = await getServerSession(authOptions);
  return Boolean(session && !session.user.disabled && !session.user.otpPending && AUTHORIZED_ROLES.has(session.user.role));
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}

async function run(request: NextRequest) {
  if (!(await authorized(request))) return publicJson({ error: "Please sign in to continue." }, { status: 401 });
  if (!supabase) return publicJson({ error: "This service is temporarily unavailable. Please try again shortly." }, { status: 503 });
  try {
    const summary = await runGuestReminders(undefined, request.method === "POST" && request.nextUrl.searchParams.get("retryFailed") === "1");
    if (request.method === "GET") {
      if (xenditConfigured()) await reconcileXenditAttempts(supabase).catch(() => console.error("Xendit reconciliation sweep failed"));
      await supabase.rpc("cleanup_auth_request_budgets");
    }
    return publicJson({ data: summary });
  } catch (error) {
    logServerError("guest reminder pass failed", error);
    return publicJson({ error: "Unable to run guest reminders." }, { status: 500 });
  }
}
