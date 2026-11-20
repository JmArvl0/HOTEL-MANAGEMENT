import { NextResponse } from "next/server";
import { authorizeFleet, fleetConfiguration, fleetStatusSchema, limitedJson } from "@/lib/fleet-contract";
import { supabase } from "@/lib/supabase";
import { fleetWireSnapshotSchema, normalizeFleetSnapshot } from "@/lib/fleet-wire";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const config = fleetConfiguration();
  if (!config || !supabase) return NextResponse.json({ delivered: false, error: "The Fleet connection is unavailable." }, { status: 503 });
  if (!authorizeFleet(request, config.callbackKey)) return NextResponse.json({ delivered: false }, { status: 401 });
  let body: unknown;
  try { body = await limitedJson(request); }
  catch (error) { return NextResponse.json({ delivered: false }, { status: error instanceof Error && error.message === "PAYLOAD_TOO_LARGE" ? 413 : 400 }); }
  if ((body as { source_system?: string } | null)?.source_system === "PMS") {
    const legacy = fleetStatusSchema.safeParse(body);
    if (!legacy.success || request.headers.get("idempotency-key") !== legacy.data.event_id) return NextResponse.json({ delivered: false }, { status: 422 });
    const result = await supabase.rpc("replay_fleet_transport_status", { p_event: legacy.data });
    return result.error ? NextResponse.json({ delivered: false }, { status: /CONFLICT/.test(result.error.message) ? 409 : 422 }) : NextResponse.json(result.data, { headers: { "Cache-Control": "no-store" } });
  }
  const parsed = fleetWireSnapshotSchema.safeParse(body);
  if (!parsed.success || request.headers.get("idempotency-key") !== parsed.data.event_id) return NextResponse.json({ delivered: false, error: "Invalid event or idempotency key." }, { status: 422 });
  const { data, error } = await supabase.rpc("receive_haven_fleet_snapshot", { p_snapshot: parsed.data, p_event: normalizeFleetSnapshot(parsed.data) });
  if (error) return NextResponse.json({ delivered: false, error: "Event could not be recorded." }, { status: /NOT_FOUND/.test(error.message) ? 404 : /CONFLICT/.test(error.message) ? 409 : 503 });
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
