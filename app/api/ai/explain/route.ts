import { NextRequest, NextResponse } from "next/server";
import { aiConfigured, generateJson, geminiModel } from "@/lib/ai/gemini-client";
import { aiGuardFailed, guardAiSession } from "@/lib/ai/guard";
import { aiRateLimited, recordAiInteraction } from "@/lib/ai/audit";
import { AI_DISCLOSURE, AI_UNAVAILABLE_MESSAGE, HAVEN_SYSTEM_PROMPT } from "@/lib/ai/prompts";
import { ExplanationResponseSchema, ExplanationSchema } from "@/lib/ai/schemas";
import { buildExplainContext, isExplainType } from "@/lib/ai/explain";

/**
 * "Explain with AI": the server rebuilds the named forecast from live data and
 * hands Gemini the structured output to interpret. The client never supplies
 * numbers, and Gemini never recomputes them.
 */

const EXPLAIN_TASK = `Explain HAVEN's prediction output below for a hotel manager.
Rules:
- Treat every figure in the input as HAVEN's authoritative output. Do not recompute, adjust or invent numbers.
- explanation: 2-5 plain sentences a manager can act on. Label what is KNOWN/BOOKED (fact) versus PREDICTED, and what the risk level means operationally.
- key_factors: the 1-6 main drivers of the forecast, each one line.
- data_quality_note: state plainly how much history the prediction is based on and what that means for confidence (e.g. "limited history; treat as indicative"). Never attach invented confidence percentages.`;

export async function POST(request: NextRequest) {
  const session = await guardAiSession();
  if (aiGuardFailed(session)) return session;

  if (!aiConfigured()) {
    return NextResponse.json({ data: null, message: AI_UNAVAILABLE_MESSAGE }, { status: 200 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!isExplainType(body && typeof body === "object" && "type" in body ? body.type : undefined)) {
    return NextResponse.json({ error: "Unknown prediction type." }, { status: 400 });
  }

  if (await aiRateLimited(session.userId, "explain", 20, 10)) {
    await recordAiInteraction({ userId: session.userId, role: session.role, feature: "explain", toolCalls: [], status: "rate_limited" });
    return NextResponse.json({ error: "Explanation limit reached. Try again in a few minutes." }, { status: 429 });
  }

  try {
    const type = (body as { type: "occupancy" | "housekeeping" | "inventory" | "maintenance" }).type;
    const { label, method, context } = await buildExplainContext(type);
    const result = await generateJson({
      systemInstruction: `${HAVEN_SYSTEM_PROMPT}\n\n${EXPLAIN_TASK}`,
      contents: `Prediction to explain: ${label}\nMethod used by HAVEN's analytics engine: ${method}\n\n${JSON.stringify(context, null, 2)}`,
      responseSchema: ExplanationResponseSchema,
      schema: ExplanationSchema,
      temperature: 0.2
    });
    await recordAiInteraction({
      userId: session.userId, role: session.role, feature: "explain", toolCalls: [],
      status: result.ok ? "ok" : result.reason === "rate_limited" ? "rate_limited" : "unavailable",
      model: geminiModel(), latencyMs: result.ok ? result.latencyMs : undefined
    });
    if (!result.ok) {
      // TEMPORARY AI DEBUG (revert to AI_UNAVAILABLE_MESSAGE after live testing)
      console.error(`[ai] explain served fallback — reason=${result.reason} httpStatus=${result.httpStatus ?? "n/a"} errorCode=${result.errorCode ?? "n/a"}`);
      return NextResponse.json({ data: null, message: `[AI DEBUG] explain failed — reason=${result.reason} httpStatus=${result.httpStatus ?? "n/a"} errorCode=${result.errorCode ?? "n/a"} :: ${(result.message ?? "").slice(0, 200)}` }, { status: 200 });
    }
    return NextResponse.json({ data: result.data, model: result.model, disclosure: AI_DISCLOSURE });
  } catch {
    await recordAiInteraction({ userId: session.userId, role: session.role, feature: "explain", toolCalls: [], status: "error" });
    return NextResponse.json({ error: "Unable to load prediction data." }, { status: 500 });
  }
}
