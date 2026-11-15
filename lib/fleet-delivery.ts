import { randomUUID } from "node:crypto";
import { fleetConfiguration, limitedJson } from "@/lib/fleet-contract";
import { fleetCreateEnvelopeSchema, fleetWireAcceptanceSchema, normalizeFleetSnapshot, type FleetWireSnapshot } from "@/lib/fleet-wire";
import type { supabase } from "@/lib/supabase";

type Client = NonNullable<typeof supabase>;

export async function deliverFleetRequest(client: Client, id: string) {
  const config = fleetConfiguration();
  if (!config) return { state: "DISABLED" };
  const lease = randomUUID();
  const claimed = await client.rpc("claim_fleet_transport", { p_id: id, p_lease: lease });
  if (claimed.error) throw new Error("FLEET_CLAIM_FAILED");
  if (!claimed.data) return { state: "NOT_DUE" };
  const payload = claimed.data.payload as { external_request_id: string; event_id: string };
  let reference: string | null = null;
  let error: string | null = null;
  let review = false;
  let snapshot: FleetWireSnapshot | null = null;
  try {
    if (!fleetCreateEnvelopeSchema.safeParse(claimed.data.payload).success) throw new Error("FLEET_PREPARED_CONTRACT_INVALID");
    const response = await fetch(config.endpoint, {
      method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(8000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.outboundKey}`, "Idempotency-Key": payload.event_id },
      body: JSON.stringify(claimed.data.payload),
    });
    if (!response.ok) {
      review = response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status);
      error = review ? "FLEET_REJECTED_REVIEW_REQUIRED" : "FLEET_TEMPORARILY_UNAVAILABLE";
      await response.body?.cancel();
    } else {
      const ack = fleetWireAcceptanceSchema.safeParse(await limitedJson(response, 16384));
      if (!ack.success || ack.data.data.external_request_id !== payload.external_request_id || ack.data.data.external_revision !== 1) {
        error = "FLEET_ACK_REVIEW_REQUIRED"; review = true;
      } else { reference = String(ack.data.data.fleet_request_id); snapshot = ack.data.data; }
    }
  } catch (e) {
    review = e instanceof Error && e.message === "FLEET_PREPARED_CONTRACT_INVALID";
    error = review ? "FLEET_PREPARED_CONTRACT_INVALID" : "FLEET_DELIVERY_UNCERTAIN";
  }
  const finished = await client.rpc("finish_fleet_contract_create", { p_id: id, p_lease: lease, p_reference: reference, p_snapshot: snapshot, p_event: snapshot ? normalizeFleetSnapshot(snapshot) : null, p_error: error, p_review: review });
  if (finished.error) throw new Error("FLEET_RESULT_SAVE_FAILED");
  return { state: !finished.data ? "NEEDS_REVIEW" : review ? "NEEDS_REVIEW" : error ? "FAILED" : "SENT" };
}
