import { NextRequest, NextResponse } from "next/server";
import type { Content, Part } from "@google/genai";
import { z } from "zod";
import { aiConfigured, buildFunctionResponseParts, extractText, generateWithTools, geminiModel, getModelContentForToolHistory } from "@/lib/ai/gemini-client";
import { normalizeAiAnswer } from "@/lib/ai/answer-format";
import { aiGuardFailed, guardAiSession } from "@/lib/ai/guard";
import { aiRateLimited, recordAiInteraction } from "@/lib/ai/audit";
import { AI_ASK_FAILURE_MESSAGE, AI_DISCLOSURE, AI_UNAVAILABLE_MESSAGE, HAVEN_SYSTEM_PROMPT } from "@/lib/ai/prompts";
import { AskReplySchema } from "@/lib/ai/schemas";
import { aiToolDeclarations, executeAiTool } from "@/lib/ai/tools";

/**
 * Ask HAVEN: an advisory Q&A loop over the explicit read-only tool registry.
 * Gemini picks tools; HAVEN executes them with its own authorization and
 * returns pre-aggregated, PII-free payloads. Conversation history is client
 * state (last few turns, validated here) — nothing is persisted.
 */

const ASK_TASK = `Answer the hotel manager's operational question.
- Use the provided read-only tools to fetch HAVEN's actual data before answering; do not answer from assumptions.
- Every figure in your answer must come from tool results. If the tools cannot answer the question, say exactly what data is missing.
- You advise; you cannot and must not claim to execute any operation. Direct the manager to the relevant HAVEN module for action.
- Format for a compact operations dashboard, kept concise: short ### headings, bullets, numbered recommendations, **bold** only for FACT/PREDICTION/RECOMMENDATION labels and item names. Plain Markdown only — no HTML, no entities, no tables, no code fences, and never backslash-escape Markdown characters.`;

const MAX_TOOL_PASSES = 5;

const AskRequestSchema = z.object({
  question: z.string().trim().min(3).max(600),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().trim().min(1).max(600) })).max(8).default([])
});

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
  const parsed = AskRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "A question is required (3-600 characters)." }, { status: 400 });
  }

  if (await aiRateLimited(session.userId, "ask", 15, 10)) {
    await recordAiInteraction({ userId: session.userId, role: session.role, feature: "ask", toolCalls: [], status: "rate_limited" });
    return NextResponse.json({ error: "Ask HAVEN limit reached. Try again in a few minutes." }, { status: 429 });
  }

  const contents: Content[] = [
    ...parsed.data.history.map((turn): Content => ({
      role: turn.role === "user" ? "user" : "model",
      parts: [{ text: turn.text }]
    })),
    { role: "user", parts: [{ text: parsed.data.question }] }
  ];

  const toolCalls: string[] = [];
  let latencyMs = 0;
  for (let pass = 0; pass < MAX_TOOL_PASSES; pass++) {
    const result = await generateWithTools({
      systemInstruction: `${HAVEN_SYSTEM_PROMPT}\n\n${ASK_TASK}`,
      contents,
      tools: aiToolDeclarations(),
      temperature: 0.3
    });
    if (!result.ok) {
      // Sanitized server log only (category, no provider body/signature/key).
      console.error(`[ai] ask served fallback — reason=${result.reason} httpStatus=${result.httpStatus ?? "n/a"} errorCode=${result.errorCode ?? "n/a"}`);
      await recordAiInteraction({
        userId: session.userId, role: session.role, feature: "ask", toolCalls,
        status: result.reason === "rate_limited" ? "rate_limited" : result.reason === "tool_context" ? "error" : "unavailable", model: geminiModel(), latencyMs
      });
      return NextResponse.json({ data: null, message: AI_ASK_FAILURE_MESSAGE }, { status: 200 });
    }
    latencyMs += result.latencyMs;

    const calls = result.data.functionCalls ?? [];
    if (!calls.length) {
      const answer = normalizeAiAnswer(extractText(result.data));
      const validated = AskReplySchema.safeParse({ answer, data_basis: toolCalls.join(", ") });
      if (!validated.success) {
        await recordAiInteraction({ userId: session.userId, role: session.role, feature: "ask", toolCalls, status: "invalid", model: result.model, latencyMs });
        return NextResponse.json({ data: null, message: AI_ASK_FAILURE_MESSAGE }, { status: 200 });
      }
      await recordAiInteraction({ userId: session.userId, role: session.role, feature: "ask", toolCalls, status: "ok", model: result.model, latencyMs });
      return NextResponse.json({ data: validated.data, model: result.model, toolCalls, disclosure: AI_DISCLOSURE });
    }

    // Preserve Gemini's full returned model content (including Gemini 3
    // thoughtSignature siblings of functionCall parts) exactly as the SDK
    // returned it. Never reconstruct {name,args} — that drops the signature
    // and the next call fails with HTTP 400. functionCalls is used only to
    // decide WHICH read-only tools to execute.
    const modelContent = getModelContentForToolHistory(result.data);
    if (!modelContent) {
      console.error(`[ai] ask tool context unrecoverable — calls=${calls.length}`);
      await recordAiInteraction({ userId: session.userId, role: session.role, feature: "ask", toolCalls, status: "error", model: result.model, latencyMs });
      return NextResponse.json({ data: null, message: AI_ASK_FAILURE_MESSAGE }, { status: 200 });
    }
    contents.push(modelContent);
    const outputs: unknown[] = [];
    for (const call of calls) {
      const name = call.name ?? "unknown";
      try {
        outputs.push(await executeAiTool(name));
        toolCalls.push(name);
      } catch {
        outputs.push({ error: "Tool unavailable." });
      }
    }
    const responses: Part[] = buildFunctionResponseParts(calls, outputs) as Part[];
    contents.push({ role: "user", parts: responses });
  }

  await recordAiInteraction({ userId: session.userId, role: session.role, feature: "ask", toolCalls, status: "error", model: geminiModel(), latencyMs });
  return NextResponse.json({ data: null, message: AI_ASK_FAILURE_MESSAGE }, { status: 200 });
}
