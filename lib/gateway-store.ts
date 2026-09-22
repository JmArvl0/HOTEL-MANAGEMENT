import type { SupabaseClient } from "@supabase/supabase-js";
import { gatewayEventAmountCentavos, gatewayEventRef } from "@/lib/gateway";

/**
 * Webhook event handling (testable domain). Maps a provider event to the
 * confirm_gateway_payment RPC: lookup by gateway_reference_id, RPC owns
 * idempotency via webhook_event_id (replays return existing state). Returns
 * "ignored" for non-payment events — the caller answers 200 without touching
 * money, because erroring on provider input would only trigger retries.
 */

/** Event types that represent money actually collected from the guest. */
const PAID_EVENT_TYPES = ["checkout_session.payment.paid", "payment.paid", "source.chargeable"];

export type GatewayEventOutcome =
  | { reservationId: string; status: string }
  | "ignored";

export async function confirmGatewayEvent(
  client: SupabaseClient,
  event: unknown
): Promise<GatewayEventOutcome> {
  const type =
    event && typeof event === "object" && "type" in event
      ? String((event as { type: unknown }).type)
      : "";
  const ref = gatewayEventRef(event);
  if (!ref || !PAID_EVENT_TYPES.includes(type)) return "ignored";

  const { data: payment } = await client
    .from("payments")
    .select("id,amount")
    .eq("gateway_reference_id", ref.sessionId)
    .maybeSingle();
  if (!payment) throw new Error("PAYMENT_NOT_FOUND");

  // Amount guard: when the provider payload carries the paid amount, it must
  // match the pending payment to the centavo before any state change. The
  // confirming RPC re-verifies the database-side equality regardless.
  const paidCentavos = gatewayEventAmountCentavos(event);
  if (paidCentavos !== null) {
    const expected = Math.round(Number((payment as { amount: number }).amount) * 100);
    if (!Number.isFinite(expected) || paidCentavos !== expected)
      throw new Error("PAYMENT_AMOUNT_MISMATCH");
  }

  const { data, error } = await client.rpc("confirm_gateway_payment", {
    p_payment_id: (payment as { id: string }).id,
    p_gateway_ref: ref.sessionId,
    p_webhook_id: ref.eventId,
  });
  if (error) throw new Error(error.message.split(":")[0].trim() || "Webhook failed.");
  const row = (Array.isArray(data) ? data[0] : data) as {
    reservation_id: string;
    reservation_status: string;
  };
  return { reservationId: row.reservation_id, status: row.reservation_status };
}
