import { NextRequest, NextResponse } from "next/server";
import { ModuleRequestSchema, ModuleAssistantSchema, ModuleAssistantResponseSchema } from "@/lib/ai/schemas";
import { aiConfigured, generateJson, geminiModel } from "@/lib/ai/gemini-client";
import { moduleGuardFailed, guardModuleAiSession } from "@/lib/ai/guard";
import { reserveModuleAiInteraction, finishModuleAiInteraction, type AiInteractionStatus } from "@/lib/ai/audit";
import { MODULE_ASSISTANT_RULES, MODULE_AI_DISCLOSURE, MODULE_AI_UNAVAILABLE_MESSAGE } from "@/lib/ai/prompts";
import { getModuleAssistant, resolveModuleAnswer, type ModuleAssistantDefinition } from "@/lib/ai/modules.server";

const FAILURE_MESSAGE = "HAVEN could not produce a grounded summary. Check the operational records directly and try again.";

function formatModuleInput(moduleId: string, focus: string | null, context: Awaited<ReturnType<ModuleAssistantDefinition["buildContext"]>>, definition: ModuleAssistantDefinition) {
  return JSON.stringify(
    { module: moduleId, focus, facts: context.facts, action_options: Object.entries(definition.actions).map(([id, action]) => ({ id, action: action.action })) },
    null,
    2
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ module: string }> }
) {
  const { module } = await params;
  const session = await guardModuleAiSession(module);
  if (moduleGuardFailed(session)) return session;

  if (!aiConfigured()) {
    return NextResponse.json({ data: null, message: MODULE_AI_UNAVAILABLE_MESSAGE }, { status: 200 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = ModuleRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a valid topic." }, { status: 400 });
  }

  const definition = getModuleAssistant(session.module.id);
  if (!definition) {
    return NextResponse.json({ error: "Module not found" }, { status: 404 });
  }
  const topic = parsed.data.topic ? definition.metadata.topics.find((item) => item.id === parsed.data.topic) : null;
  if (parsed.data.topic && !topic) return NextResponse.json({ error: "Choose a valid topic." }, { status: 400 });

  const reservation = await reserveModuleAiInteraction(
    session.userId,
    session.role,
    definition.metadata.id,
    definition.metadata.rateLimit.limit,
    definition.metadata.rateLimit.windowMinutes
  );

  if (reservation.status === "unavailable") {
    return NextResponse.json(
      { error: "AI usage controls are unavailable. AI assistance is disabled until storage is restored." },
      { status: 503 }
    );
  }

  if (reservation.status === "limited") {
    return NextResponse.json(
      { error: "This assistant's limit has been reached. Try again later." },
      { status: 429 }
    );
  }

  try {
    const context = await definition.buildContext(session.role);
    const contents = formatModuleInput(definition.metadata.id, topic?.label ?? null, context, definition);
    const result = await generateJson({
      systemInstruction: `${MODULE_ASSISTANT_RULES}\n\n${definition.task}`,
      contents,
      responseSchema: ModuleAssistantResponseSchema,
      schema: ModuleAssistantSchema,
      temperature: 0.2
    });

    if (!result.ok) {
      const status: AiInteractionStatus = result.reason === "rate_limited"
        ? "provider_quota"
        : result.reason === "invalid"
        ? "invalid"
        : "unavailable";
      console.error(`[ai] module ${module} fallback — reason=${result.reason} httpStatus=${result.httpStatus ?? "n/a"} errorCode=${result.errorCode ?? "n/a"}`);
      await finishModuleAiInteraction(reservation.interactionId, status, geminiModel(), 0);
      return NextResponse.json({ data: null, message: FAILURE_MESSAGE }, { status: 200 });
    }

    const resolved = resolveModuleAnswer(result.data, context);
    if (!resolved.ok) {
      await finishModuleAiInteraction(reservation.interactionId, "invalid", result.model, result.latencyMs);
      return NextResponse.json({ data: null, message: FAILURE_MESSAGE }, { status: 200 });
    }

    const audited = await finishModuleAiInteraction(reservation.interactionId, "ok", result.model, result.latencyMs);

    if (!audited) {
      console.error(`[ai] module ${module} audit finalization failed`);
      return NextResponse.json({ data: null, message: FAILURE_MESSAGE }, { status: 200 });
    }

    return NextResponse.json({
      data: resolved.data,
      model: result.model,
      generatedAt: context.generatedAt,
      disclosure: MODULE_AI_DISCLOSURE
    });
  } catch (err) {
    console.error(`[ai] module ${module} unexpected error`, err);
    await finishModuleAiInteraction(reservation.interactionId, "error");
    return NextResponse.json({ data: null, message: FAILURE_MESSAGE }, { status: 200 });
  }
}
