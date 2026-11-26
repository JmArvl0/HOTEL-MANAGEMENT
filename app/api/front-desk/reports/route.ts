import { publicJson } from "@/lib/server-errors";
import { getServerSession } from "next-auth";

import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { buildDailyReport, isReportDate, listFrontDeskReports } from "@/lib/front-desk-reports";
import { canGenerateFrontDeskReport, canReviewFrontDeskReports } from "@/lib/permissions";
import type { Role } from "@/lib/types";

const submitSchema = z.object({ reportDate: z.string(), previewVersion: z.string().regex(/^[a-f0-9]{32}$/), supersedes: z.string().uuid().optional() });

const unauthorized = publicJson({ error: "Please sign in to continue." }, { status: 401 });
const unavailable = publicJson({ error: "This service is temporarily unavailable. Please try again shortly." }, { status: 503 });

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled || session.user.otpPending) return unauthorized;
  const role = session.user.role as Role;
  const allowed = canGenerateFrontDeskReport(role) || canReviewFrontDeskReports(role) || role === "owner";
  if (!allowed) return publicJson({ error: "Reports access required." }, { status: 403 });
  if (!supabase) return unavailable;
  const date = new URL(request.url).searchParams.get("date");
  try {
    if (date) {
      if (!isReportDate(date)) return publicJson({ error: "Enter a valid report date (YYYY-MM-DD)." }, { status: 400 });
      if (!canGenerateFrontDeskReport(role)) return publicJson({ error: "Front Desk report generation required." }, { status: 403 });
      return publicJson({ data: await buildDailyReport(date) });
    }
    const page = Number(new URL(request.url).searchParams.get("page") ?? "0");
    return publicJson({ data: await listFrontDeskReports(Number.isFinite(page) ? page : 0) });
  } catch {
    return publicJson({ error: "Unable to load reports." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled || session.user.otpPending) return unauthorized;
  if (!canGenerateFrontDeskReport(session.user.role as Role)) return publicJson({ error: "Only Front Desk submits the daily operations report." }, { status: 403 });
  if (!supabase) return unavailable;
  const parsed = submitSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isReportDate(parsed.data.reportDate)) return publicJson({ error: "A valid report date (YYYY-MM-DD) is required." }, { status: 400 });
  try {
    const { data, error } = await supabase.rpc("submit_front_desk_daily_snapshot", {
      p_date: parsed.data.reportDate,
      p_supersedes: parsed.data.supersedes ?? null,
      p_actor: session.user.id,
      p_preview_version: parsed.data.previewVersion,
    });
    if (error) {
      const messages: Record<string, string> = {
        REPORT_PREVIEW_CHANGED: "Hotel activity changed since this preview. Generate it again before submitting.",
        REPORT_SUBMIT_FORBIDDEN: "Only Front Desk submits the daily operations report.",
        REPORT_DATE_INVALID: "Pick today or a past date.",
        REPORT_SUPERSEDES_INVALID: "Only a returned report for the same date can be resubmitted.",
        front_desk_reports_one_live_per_date: "A submitted report for this date is already awaiting manager review."
      };
      const key = Object.keys(messages).find((item) => error.message.includes(item));
      return publicJson({ error: key ? messages[key] : "Unable to submit this report." }, { status: key === "REPORT_SUBMIT_FORBIDDEN" ? 403 : key === "REPORT_DATE_INVALID" ? 400 : key ? 409 : 503 });
    }
    return publicJson({ data: Array.isArray(data) ? data[0] : data });
  } catch {
    return publicJson({ error: "Unable to build this report." }, { status: 503 });
  }
}
