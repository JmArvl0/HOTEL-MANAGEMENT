import { randomUUID } from "node:crypto";
import { fleetConfiguration, limitedJson } from "@/lib/fleet-contract";
import { fleetRenewalRequestSchema, fleetWireRenewalSuccessSchema, normalizeFleetSnapshot } from "@/lib/fleet-wire";
import type { supabase } from "@/lib/supabase";

export function fleetTrackingConfigured(origins = process.env.HAVEN_FLEET_TRACKING_ORIGINS ?? "") {
  return origins.split(",").some(value => {
    try { const url = new URL(value.trim()); return url.protocol === "https:" && url.origin === value.trim(); } catch { return false; }
  });
}
export function fleetRenewalUrl(createUrl: string, externalId: string) {
  if (!/^[A-Za-z0-9._:-]+$/.test(externalId) || [".", ".."].includes(externalId)) throw new Error("FLEET_SOURCE_ID_INVALID");
  const url = new URL(createUrl);
  url.pathname = `${url.pathname.replace(/\/$/, "")}/source/${encodeURIComponent(externalId)}/tracking/renew`;
  return url.toString();
}

/** Only explicit Front Desk actions call this; no interval/job renews tokens. */
export async function renewFleetTracking(client: NonNullable<typeof supabase>, id: string) {
  const config = fleetConfiguration();
  if (!config || !fleetTrackingConfigured()) return { state: "DISABLED" };
  const lease = randomUUID();
  const claimed = await client.rpc("claim_fleet_tracking_renewal", { p_id: id, p_lease: lease });
  if (claimed.error) throw new Error("FLEET_RENEWAL_CLAIM_FAILED");
  if (!claimed.data) return { state: "NOT_DUE" };
  const command = claimed.data;
  const payload = fleetRenewalRequestSchema.parse(command.payload);
  let error: string | null = null;
  let review = false;
  let snapshot = null;
  try {
    const response = await fetch(fleetRenewalUrl(config.endpoint, command.externalRequestId), {
      method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(8000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.outboundKey}`, "Idempotency-Key": payload.event_id }, body: JSON.stringify(payload),
    });
    if (!response.ok) {
      review = response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status);
      error = review ? "FLEET_RENEWAL_REVIEW_REQUIRED" : "FLEET_TEMPORARILY_UNAVAILABLE";
      await response.body?.cancel();
    } else {
      const result = fleetWireRenewalSuccessSchema.safeParse(await limitedJson(response, 16384));
      if (!result.success || result.data.data.external_request_id !== command.externalRequestId || result.data.data.fleet_reference !== command.fleetReference
        || result.data.data.assignment_reference !== payload.assignment_reference || result.data.data.request_version <= payload.expected_request_version
        || Date.parse(result.data.data.tracking!.expires_at) <= Date.now()
        || (command.previousTrackingUrl && result.data.data.tracking!.url === command.previousTrackingUrl)) {
        error = "FLEET_RENEWAL_ACK_INVALID"; review = true;
      } else snapshot = result.data.data;
    }
  } catch { error = "FLEET_RENEWAL_UNCERTAIN"; }
  const finished = await client.rpc("finish_fleet_tracking_renewal", {
    p_id: id, p_lease: lease, p_snapshot: snapshot, p_event: snapshot ? normalizeFleetSnapshot(snapshot) : null, p_error: error, p_review: review,
  });
  if (finished.error) throw new Error("FLEET_RENEWAL_RESULT_SAVE_FAILED");
  return { state: String(finished.data) };
}
