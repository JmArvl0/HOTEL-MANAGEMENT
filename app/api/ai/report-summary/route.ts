import { NextRequest, NextResponse } from "next/server";
import { aiConfigured, generateJson, geminiModel } from "@/lib/ai/gemini-client";
import { aiGuardFailed, guardAiSession } from "@/lib/ai/guard";
import { aiRateLimited, recordAiInteraction } from "@/lib/ai/audit";
import { AI_DISCLOSURE, AI_UNAVAILABLE_MESSAGE, HAVEN_SYSTEM_PROMPT } from "@/lib/ai/prompts";
import { ReportSummaryResponseSchema, ReportSummarySchema } from "@/lib/ai/schemas";
import { buildDailyReport, isReportDate } from "@/lib/front-desk-reports";
import { hotelToday } from "@/lib/booking";

/**
 * AI-assisted summary of the Daily Front Desk Operations Report. The report
 * snapshot itself remains the authoritative record — the summary is always
 * labeled AI-assisted and never written back.
 */

const SUMMARY_TASK = `Summarize HAVEN's Daily Front Desk Operations Report snapshot below for a manager.
Rules:
- Every figure must come from the snapshot. Do not invent or recompute numbers.
- summary: 3-6 sentences covering the day's activity (reservations, collections, housekeeping turnover, notable counts).
- highlights: 2-5 one-line notable items (e.g. collection total, peak workload).
- variance_notes: cash shift variances or other discrepancies worth review, if any; empty if none.
- The rooms section is a point-in-time snapshot at generation, not a per-day history — treat it as such.`;

export async function POST(request: NextRequest) {
  const session = await guardAiSession();
  if (aiGuardFailed(session)) return session;

  if (!aiConfigured()) {
    return NextResponse.json({ data: null, message: AI_UNAVAILABLE_MESSAGE }, { status: 200 });
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const date = body && typeof body === "object" && "date" in body ? String((body as { date: unknown }).date) : hotelToday();
  if (!isReportDate(date)) {
    return NextResponse.json({ error: "A valid report date (YYYY-MM-DD) is required." }, { status: 400 });
  }

  if (await aiRateLimited(session.userId, "report_summary", 20, 10)) {
    await recordAiInteraction({ userId: session.userId, role: session.role, feature: "report_summary", toolCalls: [], status: "rate_limited" });
    return NextResponse.json({ error: "Summary limit reached. Try again in a few minutes." }, { status: 429 });
  }

  try {
    const report = await buildDailyReport(date);
    const result = await generateJson({
      systemInstruction: `${HAVEN_SYSTEM_PROMPT}\n\n${SUMMARY_TASK}`,
      contents: `Report date: ${report.reportDate}\n\n${JSON.stringify(report, null, 2)}`,
      responseSchema: ReportSummaryResponseSchema,
      schema: ReportSummarySchema,
      temperature: 0.2
    });
    await recordAiInteraction({
      userId: session.userId, role: session.role, feature: "report_summary", toolCalls: [],
      status: result.ok ? "ok" : result.reason === "rate_limited" ? "rate_limited" : "unavailable",
      model: geminiModel(), latencyMs: result.ok ? result.latencyMs : undefined
    });
    if (!result.ok) {
      // TEMPORARY AI DEBUG (revert to AI_UNAVAILABLE_MESSAGE after live testing)
      console.error(`[ai] report_summary served fallback — reason=${result.reason} httpStatus=${result.httpStatus ?? "n/a"} errorCode=${result.errorCode ?? "n/a"}`);
      return NextResponse.json({ data: null, message: `[AI DEBUG] report summary failed — reason=${result.reason} httpStatus=${result.httpStatus ?? "n/a"} errorCode=${result.errorCode ?? "n/a"} :: ${(result.message ?? "").slice(0, 200)}` }, { status: 200 });
    }
    return NextResponse.json({ data: result.data, model: result.model, reportDate: report.reportDate, disclosure: AI_DISCLOSURE });
  } catch (error) {
    if (error instanceof Error && error.message === "Database unavailable.") {
      return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
    }
    await recordAiInteraction({ userId: session.userId, role: session.role, feature: "report_summary", toolCalls: [], status: "error" });
    return NextResponse.json({ error: "Unable to build the report summary." }, { status: 500 });
  }
}
