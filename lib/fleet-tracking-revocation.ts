import { randomUUID } from "node:crypto";
import { fleetConfiguration, limitedJson } from "@/lib/fleet-contract";
import { fleetRenewalUrl } from "@/lib/fleet-tracking-renewal";
import { fleetRevocationConflictSchema, fleetRevocationRequestSchema, fleetRevocationSuccessSchema, fleetWireSuccessSchema, normalizeFleetSnapshot, type FleetWireSnapshot } from "@/lib/fleet-wire";
import type { supabase } from "@/lib/supabase";

export function fleetRetryAfter(value: string | null, now = Date.now()): string | null {
  if (!value) return null;
  const expiry = /^\d+$/.test(value.trim()) ? now + Number(value) * 1000 : Date.parse(value);
  return Number.isFinite(expiry) && expiry > now && expiry < 8640000000000000 ? new Date(expiry).toISOString() : null;
}

/** Permanent withdrawal: retries keep the exact saved version, never auto-resolve409. */
export async function revokeFleetTracking(client: NonNullable<typeof supabase>, linkId: string) {
  const config = fleetConfiguration();
  if (!config) return { state: "DISABLED" };
  const lease = randomUUID();
  const claimed = await client.rpc("claim_fleet_tracking_revocation", { p_link: linkId, p_lease: lease });
  if (claimed.error) throw new Error("FLEET_REVOCATION_CLAIM_FAILED");
  if (!claimed.data) return { state: "NOT_DUE" };
  const command = claimed.data;
  const endpoint = fleetRenewalUrl(config.endpoint, command.externalRequestId).replace(/\/renew$/, "");
  let state = "FAILED"; let error: string | null = null; let retryAfter: string | null = null; let snapshot: FleetWireSnapshot | null = null;
  const matches = (s: FleetWireSnapshot) => s.external_request_id === command.externalRequestId && (!command.fleetReference || s.fleet_reference === command.fleetReference);
  const send = (url: string, init?: RequestInit) => fetch(url, { ...init, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(8000), headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.outboundKey}` } });
  try {
    let version: number | null = command.expectedVersion;
    if (version === null) {
      const lookup = await send(endpoint.replace(/\/tracking$/, ""));
      if (!lookup.ok) { await lookup.body?.cancel(); throw new Error("FLEET_SOURCE_LOOKUP_UNAVAILABLE"); }
      const source = fleetWireSuccessSchema.parse(await limitedJson(lookup, 16384));
      if (!matches(source.data)) throw new Error("FLEET_SOURCE_IDENTITY_CONFLICT");
      const resolved = await client.rpc("resolve_fleet_revocation_version", { p_link: linkId, p_lease: lease, p_snapshot: source.data, p_event: normalizeFleetSnapshot(source.data) });
      if (resolved.error) throw new Error("FLEET_SOURCE_SAVE_FAILED");
      version = Number(resolved.data);
    }
    const payload = fleetRevocationRequestSchema.parse({ expected_request_version: version });
    // No Origin or Idempotency-Key: this DELETE has its own version/replay contract.
    const response = await send(endpoint, { method: "DELETE", body: JSON.stringify(payload) });
    retryAfter = fleetRetryAfter(response.headers.get("retry-after"));
    if (response.status === 200) {
      const result = fleetRevocationSuccessSchema.safeParse(await limitedJson(response, 16384));
      if (!result.success || !matches(result.data.data) || result.data.data.request_version < payload.expected_request_version) { state = "NEEDS_REVIEW"; error = "FLEET_REVOCATION_ACK_INVALID"; }
      else { snapshot = result.data.data; state = "SUCCEEDED"; }
    } else if (response.status === 409) {
      const result = fleetRevocationConflictSchema.safeParse(await limitedJson(response, 16384));
      if (!result.success || !matches(result.data.data)) { state = "NEEDS_REVIEW"; error = "FLEET_REVOCATION_ACK_INVALID"; }
      else { snapshot = result.data.data; state = "CONFLICT"; error = "FLEET_REVOCATION_VERSION_CONFLICT"; }
    } else {
      state = response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status) ? "NEEDS_REVIEW" : "FAILED";
      error = state === "FAILED" ? "FLEET_REVOCATION_TEMPORARILY_UNAVAILABLE" : "FLEET_REVOCATION_REVIEW_REQUIRED";
      await response.body?.cancel();
    }
  } catch { error = "FLEET_REVOCATION_UNCERTAIN"; }
  const finished = await client.rpc("finish_fleet_tracking_revocation", { p_link: linkId, p_lease: lease, p_state: state, p_snapshot: snapshot, p_event: snapshot ? normalizeFleetSnapshot(snapshot) : null, p_error: error, p_retry_after: retryAfter });
  if (finished.error) throw new Error("FLEET_REVOCATION_RESULT_SAVE_FAILED");
  return { state: String(finished.data) };
}

export async function deliverFleetWithdrawals(client: NonNullable<typeof supabase>, requestId: string) {
  const links = await client.from("fleet_transport_links").select("id,fleet_tracking_revocations(state)").eq("request_id", requestId);
  if (links.error) return true;
  const eligible = (links.data ?? []).filter(link => {
    const value = link.fleet_tracking_revocations as unknown as { state: string } | { state: string }[] | null;
    const row = Array.isArray(value) ? value[0] : value;
    return row && row.state !== "SUCCEEDED";
  });
  const results = await Promise.allSettled(eligible.map(link => revokeFleetTracking(client, link.id)));
  return results.some(result => result.status !== "fulfilled" || result.value.state !== "SUCCEEDED");
}
