import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { authorizeWorkforce, readWorkforceJson, workforceConfiguration, workforceEventSchema } from "@/lib/workforce-contract";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const config = workforceConfiguration();
  if (!config || !supabase) return NextResponse.json({ error: "Workforce receiver is not configured." }, { status: 503 });
  if (!authorizeWorkforce(request, config.key)) return NextResponse.json({ error: "Please sign in to continue." }, { status: 401 });
  let input: unknown;
  try { input = await readWorkforceJson(request); }
  catch (error) { return NextResponse.json({ error: "Please check the details and try again." }, { status: error instanceof Error && error.message === "PAYLOAD_TOO_LARGE" ? 413 : 400 }); }
  const parsed = workforceEventSchema.safeParse(input);
  if (!parsed.success || request.headers.get("idempotency-key") !== parsed.data.eventId) return NextResponse.json({ error: "Invalid availability event or idempotency key." }, { status: 422 });
  const { data, error } = await supabase.rpc("hotel_receive_workforce_availability", { p_event: parsed.data });
  if (error) {
    const status = /MAPPING_NOT_FOUND/.test(error.message) ? 404 : /CONFLICT/.test(error.message) ? 409 : /INVALID|SOURCE_MISMATCH/.test(error.message) ? 422 : 503;
    return NextResponse.json({ error: status === 404 ? "Employee mapping is required." : status === 409 ? "Event ID was already used with different data." : "Availability update could not be accepted." }, { status });
  }
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
