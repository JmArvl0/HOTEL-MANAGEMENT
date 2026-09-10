import { NextRequest, NextResponse } from "next/server";
import { aiConfigured, generateJson, geminiModel } from "@/lib/ai/gemini-client";
import { aiGuardFailed, guardAiSession } from "@/lib/ai/guard";
import { aiRateLimited, recordAiInteraction } from "@/lib/ai/audit";
import { HAVEN_SYSTEM_PROMPT, AI_UNAVAILABLE_MESSAGE } from "@/lib/ai/prompts";
import { BriefResponseSchema, BriefSchema } from "@/lib/ai/schemas";
import { buildBriefInput, formatBriefInput } from "@/lib/ai/brief";

/**
 * HAVEN AI daily operations brief. One Gemini call per hotel day (cached
 * per server instance); an explicit refresh is rate-limited. The brief is
 * always derived from HAVEN's own analytics output.
 */

const BRIEF_TASK = `Produce the HAVEN AI daily operations brief from the JSON operational input below.
Rules:
- Every number must come from the input. Do not invent or recompute figures.
- Distinguish FACT (observed data), PREDICTION (HAVEN analytics output) and RECOMMENDATION (your suggestion) in your wording.
- summary: 3-6 sentences covering tomorrow's occupancy outlook, arrivals/departures, housekeeping workload and the most pressing risks.
- priority_actions: 1-4 ordered actions the Manager should consider, each with a short rationale.
- warnings: anything needing attention (inventory shortages, recurring maintenance, escalated requests).
- prediction_explanations: one entry per forecast you reference, labeled with the forecast name and noting its data quality when limited.`;

// ponytail: per-instance in-memory cache; on serverless each warm instance
// shares it. The rate limit is the real guard against quota burn.
let cachedBrief: { date: string; brief: unknown; model: string; generatedAt: string } | null = null;
const hotelDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export async function GET(request: NextRequest) {
  const session = await guardAiSession();
  if (aiGuardFailed(session)) return session;

  if (!aiConfigured()) {
    return NextResponse.json({ data: null, message: AI_UNAVAILABLE_MESSAGE }, { status: 200 });
  }

  const refresh = request.nextUrl.searchParams.get("refresh") === "1";
  const today = hotelDay();
  if (!refresh && cachedBrief?.date === today) {
    return NextResponse.json({ data: cachedBrief.brief, model: cachedBrief.model, generatedAt: cachedBrief.generatedAt, cached: true });
  }

  if (refresh && await aiRateLimited(session.userId, "brief", 3, 10)) {
    await recordAiInteraction({ userId: session.userId, role: session.role, feature: "brief", toolCalls: [], status: "rate_limited" });
    return NextResponse.json({ error: "Brief refresh limit reached. Try again in a few minutes." }, { status: 429 });
  }

  try {
    const input = await buildBriefInput();
    const result = await generateJson({
      systemInstruction: `${HAVEN_SYSTEM_PROMPT}\n\n${BRIEF_TASK}`,
      contents: formatBriefInput(input),
      responseSchema: BriefResponseSchema,
      schema: BriefSchema,
      temperature: 0.2
    });
    await recordAiInteraction({
      userId: session.userId, role: session.role, feature: "brief", toolCalls: [],
      status: result.ok ? "ok" : result.reason === "rate_limited" ? "rate_limited" : "unavailable",
      model: geminiModel(), latencyMs: result.ok ? result.latencyMs : undefined
    });
    if (!result.ok) {
      // TEMPORARY AI DEBUG (revert to AI_UNAVAILABLE_MESSAGE after live testing)
      console.error(`[ai] brief served fallback — reason=${result.reason} httpStatus=${result.httpStatus ?? "n/a"} errorCode=${result.errorCode ?? "n/a"}`);
      return NextResponse.json({ data: null, message: `[AI DEBUG] brief failed — reason=${result.reason} httpStatus=${result.httpStatus ?? "n/a"} errorCode=${result.errorCode ?? "n/a"} :: ${(result.message ?? "").slice(0, 200)}` }, { status: 200 });
    }
    cachedBrief = { date: today, brief: result.data, model: result.model, generatedAt: new Date().toISOString() };
    return NextResponse.json({ data: result.data, model: result.model, generatedAt: cachedBrief.generatedAt });
  } catch {
    await recordAiInteraction({ userId: session.userId, role: session.role, feature: "brief", toolCalls: [], status: "error" });
    return NextResponse.json({ data: null, message: AI_UNAVAILABLE_MESSAGE }, { status: 200 });
  }
}
