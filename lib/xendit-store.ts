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
  const { data: result, error } = await client.rpc("hotel_process_xendit_event", {
    p_event: staleExpiry ? "payment_session.completed" : event.event, p_reference: trusted.reference_id, p_session: trusted.payment_session_id,
    p_amount: trusted.amount, p_currency: trusted.currency, p_transaction: trusted.payment_id ?? null,
    p_channel: trusted.channel_code ?? null,
  });
  if (error) throw new Error(error.message);
  return result as { outcome: string; reservationId: string };
}
