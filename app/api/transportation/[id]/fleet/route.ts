import { NextResponse } from "next/server";
import { z } from "zod";
import { fleetConfiguration, limitedJson } from "@/lib/fleet-contract";
import { deliverFleetRequest } from "@/lib/fleet-delivery";
import { guardPickupRequest, pickupJson } from "@/lib/transport-pickup-route";
import { fleetTrackingConfigured, renewFleetTracking } from "@/lib/fleet-tracking-renewal";
import { revokeFleetTracking } from "@/lib/fleet-tracking-revocation";

type Context = { params: Promise<{ id: string }> };
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("prepare"), expectedVersion: z.number().int().positive() }),
  z.object({ action: z.literal("deliver"), outboxId: z.string().uuid() }),
  z.object({ action: z.literal("reconcile"), note: z.string().trim().min(5).max(500) }),
  z.object({ action: z.literal("renew"), linkId: z.string().uuid(), eventId: z.string().uuid(), expectedVersion: z.number().int().positive().max(2147483647), assignmentReference: z.string().uuid() }),
  z.object({ action: z.literal("revoke"), linkId: z.string().uuid(), expectedVersion: z.number().int().positive().max(2147483647).nullable(), confirmConflict: z.boolean().default(false) }),
]);
export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return pickupJson({ error: "Request not found." }, 404);
  const guard = await guardPickupRequest(id);
  if (guard instanceof NextResponse) return guard;
  if (guard.role === "guest") return pickupJson({ error: "Staff access required." }, 403);
  const result = await guard.client.from("fleet_transport_links").select("id,leg,external_request_id,fleet_reference,partner_status,partner_version,assignment_active,guest_safety,needs_review,reconciliation_note,reviewed_at,fleet_transport_outbox(id,state,attempts,next_attempt_at,last_error,sent_at),fleet_tracking_renewals(id,state,attempts,expected_version,assignment_reference,next_attempt_at),fleet_tracking_revocations(state,attempts,expected_version,conflict_version,next_attempt_at)").eq("request_id", id).order("leg");
  if (result.error) return pickupJson({ error: "Fleet preparation is not available yet." }, 503);
  const links = (result.data ?? []).map(({ guest_safety, ...link }) => ({ ...link, assignmentReference: guest_safety?.assignment_reference ?? null }));
  return pickupJson({ enabled: Boolean(fleetConfiguration()), renewalEnabled: Boolean(fleetConfiguration()) && fleetTrackingConfigured(), links });
}
export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return pickupJson({ error: "Request not found." }, 404);
  const guard = await guardPickupRequest(id, true);
  if (guard instanceof NextResponse) return guard;
  if (guard.role !== "front_desk") return pickupJson({ error: "Only Front Desk can perform this action. Ask Front Desk for help." }, 403);
  const parsed = schema.safeParse(await limitedJson(request, 4096).catch(() => null));
  if (!parsed.success) return pickupJson({ error: "Invalid Fleet action." }, 400);
  const action = parsed.data;
  if (action.action === "revoke") {
    const scoped = await guard.client.from("fleet_transport_links").select("id").eq("id", action.linkId).eq("request_id", id).maybeSingle();
    if (scoped.error) return pickupJson({ error: "Unable to verify the Fleet ride." }, 503);
    if (!scoped.data) return pickupJson({ error: "Fleet ride not found." }, 404);
    const queued = await guard.client.rpc("queue_fleet_tracking_revocation", { p_actor: guard.actor, p_link: action.linkId, p_expected: action.expectedVersion, p_confirm_conflict: action.confirmConflict });
    if (queued.error) return pickupJson({ error: "Review the current Fleet version before confirming revocation." }, 409);
    try { return pickupJson(await revokeFleetTracking(guard.client, action.linkId)); }
    catch { return pickupJson({ error: "Your sharing withdrawal was saved. We're still waiting for Fleet to confirm it. Check the ride status before retrying." }, 503); }
  }
  if (action.action === "renew") {
    if (!fleetConfiguration() || !fleetTrackingConfigured()) return pickupJson({ error: "Fleet staging and an approved tracking origin are required." }, 503);
    const scoped = await guard.client.from("fleet_transport_links").select("id").eq("id", action.linkId).eq("request_id", id).maybeSingle();
    if (scoped.error) return pickupJson({ error: "Unable to verify the Fleet ride." }, 503);
    if (!scoped.data) return pickupJson({ error: "Fleet ride not found." }, 404);
    const revoked = await guard.client.from("fleet_tracking_revocations").select("link_id").eq("link_id", action.linkId).maybeSingle();
    if (revoked.error) return pickupJson({ error: "Unable to verify tracking permission." }, 503);
    if (revoked.data) return pickupJson({ error: "Sharing withdrawal was requested. This leg cannot renew its tracking link." }, 409);
    const queued = await guard.client.rpc("queue_fleet_tracking_renewal", { p_actor: guard.actor, p_link: action.linkId, p_key: action.eventId, p_expected: action.expectedVersion, p_assignment: action.assignmentReference });
    if (queued.error) return pickupJson({ error: "Assignment changed or sharing is unavailable. Reload the ride before retrying." }, 409);
    try { return pickupJson(await renewFleetTracking(guard.client, String(queued.data))); }
    catch { return pickupJson({ error: "We couldn't confirm the tracking-link renewal. Reload the ride and retry the same request if it is still pending." }, 503); }
  }
  if (action.action === "prepare") {
    const result = await guard.client.rpc("prepare_fleet_transport", { p_actor: guard.actor, p_request: id, p_expected_version: action.expectedVersion });
    if (result.error) return pickupJson({ error: /CONSENT/.test(result.error.message) ? "Save the passenger contact and sharing permission first." : /RECONCILIATION/.test(result.error.message) ? "This request has already been sent to Fleet. Confirm its status with Fleet and record the result before making changes." : /REVIEW_REQUEST_FIRST/.test(result.error.message) ? "Review the request before preparing it for Fleet." : "Request changed or is no longer eligible. Refresh and retry." }, 409);
    return pickupJson({ ok: true, ...result.data });
  }
  if (action.action === "reconcile") {
    const result = await guard.client.rpc("record_fleet_coordination", { p_actor: guard.actor, p_request: id, p_note: action.note });
    if (result.error) return pickupJson({ error: "Unable to save the coordination note." }, 409);
    return pickupJson({ ok: true });
  }
  const links = await guard.client.from("fleet_transport_links").select("id").eq("request_id", id);
  if (links.error) return pickupJson({ error: "Unable to load Fleet preparation." }, 503);
  const outbox = await guard.client.from("fleet_transport_outbox").select("id").eq("id", action.outboxId).in("link_id", (links.data ?? []).map(link => link.id)).maybeSingle();
  if (outbox.error || !outbox.data) return pickupJson({ error: "Prepared request not found." }, 404);
  try { return pickupJson(await deliverFleetRequest(guard.client, outbox.data.id)); }
  catch { return pickupJson({ error: "Delivery result is uncertain. Retry using the same prepared request." }, 503); }
}
