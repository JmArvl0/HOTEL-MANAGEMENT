import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { aiConfigured, geminiModel } from "@/lib/ai/gemini-client";
import { aiRateLimited, recordAiInteraction } from "@/lib/ai/audit";
import {
  GUEST_CONCIERGE_DISCLOSURE,
  GUEST_CONCIERGE_UNAVAILABLE_MESSAGE,
  askGuestConcierge,
  buildGuestConciergeContext,
} from "@/lib/ai/guest-concierge";

const BodySchema = z.object({
  question: z.string().trim().min(3).max(600),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().trim().min(1).max(600) }))
    .max(6)
    .default([]),
  reservationId: z.string().min(1).max(80).optional(),
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "guest")
    return NextResponse.json({ error: "Customer access required." }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "A question is required (3-600 characters)." }, { status: 400 });

  // Ownership isolation: reservationId must belong to the caller.
  if (parsed.data.reservationId && supabase) {
    const { data } = await supabase
      .from("reservations")
      .select("id")
      .eq("id", parsed.data.reservationId)
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (!data) return NextResponse.json({ error: "Reservation not found." }, { status: 403 });
  }

  if (!aiConfigured())
    return NextResponse.json({ data: null, message: GUEST_CONCIERGE_UNAVAILABLE_MESSAGE }, { status: 200 });

  if (await aiRateLimited(session.user.id, "guest_concierge", 20, 60)) {
    await recordAiInteraction({
      userId: session.user.id, role: "guest", feature: "guest_concierge", toolCalls: [], status: "rate_limited",
    });
    return NextResponse.json(
      { error: "Concierge limit reached (20 per hour). Please try again later." },
      { status: 429 }
    );
  }

  const context = await buildGuestConciergeContext(session.user.id, parsed.data.reservationId);
  const result = await askGuestConcierge(context, parsed.data.question, parsed.data.history);
  if (!result.ok) {
    console.error(`[ai] guest_concierge fallback — reason=${result.reason}`);
    await recordAiInteraction({
      userId: session.user.id, role: "guest", feature: "guest_concierge", toolCalls: [],
      status: result.reason === "rate_limited" ? "rate_limited" : "unavailable",
      model: geminiModel(),
    });
    return NextResponse.json({ data: null, message: GUEST_CONCIERGE_UNAVAILABLE_MESSAGE }, { status: 200 });
  }

  // Drafts are advisory: restrict to live catalog values so Confirm always submits.
  const allowed = new Set(context.catalog.map((c) => c.value));
  const data = result.data.actionDraft &&
    !result.data.actionDraft.requestTypes.every((t) => allowed.has(t))
    ? { ...result.data, actionDraft: undefined }
    : result.data;

  await recordAiInteraction({
    userId: session.user.id, role: "guest", feature: "guest_concierge",
    toolCalls: data.actionDraft ? ["request_draft"] : [],
    status: "ok", model: result.model, latencyMs: result.latencyMs,
  });
  return NextResponse.json({ data, model: result.model, disclosure: GUEST_CONCIERGE_DISCLOSURE });
}
