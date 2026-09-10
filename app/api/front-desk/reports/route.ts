import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { buildDailyReport, isReportDate, listFrontDeskReports } from "@/lib/front-desk-reports";
import { canGenerateFrontDeskReport, canReviewFrontDeskReports } from "@/lib/permissions";
import type { Role } from "@/lib/types";

const submitSchema = z.object({ reportDate: z.string(), supersedes: z.string().uuid().optional() });

const unauthorized = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
const unavailable = NextResponse.json({ error: "Database unavailable." }, { status: 503 });

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized;
  const role = session.user.role as Role;
  const allowed = canGenerateFrontDeskReport(role) || canReviewFrontDeskReports(role);
  if (!allowed) return NextResponse.json({ error: "Reports access required." }, { status: 403 });
  if (!supabase) return unavailable;
  const date = new URL(request.url).searchParams.get("date");
  try {
    if (date) {
      if (!isReportDate(date)) return NextResponse.json({ error: "Enter a valid report date (YYYY-MM-DD)." }, { status: 400 });
      if (!canGenerateFrontDeskReport(role)) return NextResponse.json({ error: "Front Desk report generation required." }, { status: 403 });
      return NextResponse.json({ data: await buildDailyReport(date) });
    }
    const page = Number(new URL(request.url).searchParams.get("page") ?? "0");
    return NextResponse.json({ data: await listFrontDeskReports(Number.isFinite(page) ? page : 0) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load reports." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized;
  if (!canGenerateFrontDeskReport(session.user.role as Role)) return NextResponse.json({ error: "Only Front Desk submits the daily operations report." }, { status: 403 });
  if (!supabase) return unavailable;
  const parsed = submitSchema.safeParse(await request.json());
  if (!parsed.success || !isReportDate(parsed.data.reportDate)) return NextResponse.json({ error: "A valid report date (YYYY-MM-DD) is required." }, { status: 400 });
  try {
    // The snapshot is always rebuilt server-side from live records, so the
    // immutable evidence stored is exactly what the operator previewed.
    const snapshot = await buildDailyReport(parsed.data.reportDate);
    const { data, error } = await supabase.rpc("submit_front_desk_report", {
      p_report_date: parsed.data.reportDate,
      p_snapshot: snapshot,
      p_supersedes: parsed.data.supersedes ?? null,
      p_staff_user_id: session.user.id
    });
    if (error) {
      const messages: Record<string, string> = {
        REPORT_SUBMIT_FORBIDDEN: "Only Front Desk submits the daily operations report.",
        REPORT_DATE_INVALID: "Pick today or a past date.",
        REPORT_SUPERSEDES_INVALID: "Only a returned report for the same date can be resubmitted.",
        front_desk_reports_one_live_per_date: "A submitted report for this date is already awaiting manager review."
      };
      const key = Object.keys(messages).find((item) => error.message.includes(item));
      return NextResponse.json({ error: key ? messages[key] : "Unable to submit this report." }, { status: /FORBIDDEN/.test(error.message) ? 403 : 409 });
    }
    return NextResponse.json({ data: Array.isArray(data) ? data[0] : data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to build this report." }, { status: 500 });
  }
}
