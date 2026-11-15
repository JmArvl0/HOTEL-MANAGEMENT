import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getXenditSession, testCheckoutUrl, xenditSessionSchema, type XenditSession } from "@/lib/xendit";

const webhookReference = z.object({ reference_id: z.string().min(1).max(64) });

export async function attachXenditSession(client: SupabaseClient, session: XenditSession) {
  if (!session.payment_link_url) throw new Error("XENDIT_SESSION_MISMATCH");
  const { error } = await client.rpc("hotel_attach_xendit_session", {
    p_reference: session.reference_id, p_session: session.payment_session_id,
    p_url: testCheckoutUrl(session.payment_link_url), p_expires: session.expires_at, p_amount: session.amount,
  });
  if (error) throw new Error(error.message);
}

export async function settleKnownXenditSession(client: SupabaseClient, session: XenditSession) {
  if (session.status === "ACTIVE") return { outcome: "active" };
  const completed = session.status === "COMPLETED";
  if (completed && !session.payment_id) throw new Error("XENDIT_TRANSACTION_REQUIRED");
  const { data, error } = await client.rpc("hotel_process_xendit_event", {
    p_event: completed ? "payment_session.completed" : "payment_session.expired",
    p_reference: session.reference_id, p_session: session.payment_session_id, p_amount: session.amount,
    p_currency: session.currency, p_transaction: completed ? session.payment_id : null,
    p_channel: completed ? session.channel_code ?? null : null,
  });
  if (error) throw new Error(error.message);
  return data as { outcome: string; reservationId: string };
}

export async function reconcileXenditAttempts(client: SupabaseClient) {
  const queued = await client.rpc("queue_uncertain_xendit_sessions");
  if (queued.error) throw new Error("XENDIT_REVIEW_QUEUE_UNAVAILABLE");
  const { data, error } = await client.from("payments").select("id,provider_reference_id,gateway_reference_id,gateway_checkout_amount,amount")
    .eq("payment_gateway", "xendit").eq("purpose", "reservation_deposit")
    .in("status", ["pending_verification", "expired"]).not("gateway_reference_id", "is", null)
    .is("gateway_payment_id", null)
    .or(`gateway_reconciled_at.is.null,gateway_reconciled_at.lt.${new Date(Date.now() - 6 * 3600000).toISOString()}`)
    .gt("created_at", new Date(Date.now() - 7 * 86400000).toISOString()).order("gateway_reconciled_at", { ascending: true, nullsFirst: true }).limit(12);
  if (error) throw new Error("XENDIT_REVIEW_QUEUE_UNAVAILABLE");
  const results = await Promise.allSettled((data ?? []).map(async attempt => {
    const current = await getXenditSession(String(attempt.gateway_reference_id));
    if (current.reference_id !== attempt.provider_reference_id || current.amount !== Number(attempt.gateway_checkout_amount ?? attempt.amount)) {
      throw new Error("XENDIT_SESSION_MISMATCH");
    }
    const result = await settleKnownXenditSession(client, current);
    const update = await client.from("payments").update({ gateway_reconciled_at: new Date().toISOString() }).eq("id", attempt.id);
    if (update.error) throw new Error("XENDIT_REVIEW_QUEUE_UNAVAILABLE");
    return result.outcome;
  }));
  return { checked: results.length, errors: results.filter(result => result.status === "rejected").length };
}

export async function processXenditEvent(client: SupabaseClient, input: unknown) {
  const event = input as { event?: unknown; data?: unknown } | null;
  if (!event || !["payment_session.completed", "payment_session.expired"].includes(String(event.event))) return { outcome: "ignored" };
  const { reference_id: reference } = webhookReference.parse(event.data);
  const known = await client.from("payments").select("id").eq("payment_gateway", "xendit").eq("provider_reference_id", reference).maybeSingle();
  if (known.error) throw new Error("XENDIT_LOOKUP_RETRY_REQUIRED");
  // Local attempts commit before provider creation. Unmatched Dashboard samples
  // and unrelated payments can be acknowledged without changing a booking.
  if (!known.data) return { outcome: "ignored_unmatched_reference" };
  const data = xenditSessionSchema.parse(event.data);
  const expected = event.event === "payment_session.completed" ? "COMPLETED" : "EXPIRED";
  if (data.status !== expected) throw new Error("XENDIT_SESSION_MISMATCH");
  // The test API credential independently verifies account/mode and prevents
  // binding forged IDs, including a webhook arriving before the create response.
  const trusted = await getXenditSession(data.payment_session_id);
  const staleExpiry = expected === "EXPIRED" && trusted.status === "COMPLETED";
  if (trusted.payment_session_id !== data.payment_session_id || trusted.reference_id !== data.reference_id ||
      trusted.amount !== data.amount || (!staleExpiry && (trusted.status !== expected || (trusted.payment_id ?? null) !== (data.payment_id ?? null))))
    throw new Error("XENDIT_SESSION_MISMATCH");
  await attachXenditSession(client, trusted);
  return settleKnownXenditSession(client, trusted);
}
