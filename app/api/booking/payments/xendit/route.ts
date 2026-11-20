import { publicJson } from "@/lib/server-errors";
import { validationBody } from "@/lib/errors";
import { getServerSession } from "next-auth";

import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { createXenditSession, getXenditSession, testCheckoutUrl, XenditError, xenditChannel, xenditConfigured } from "@/lib/xendit";
import { attachXenditSession, settleKnownXenditSession } from "@/lib/xendit-store";
import { scheduleFleetDelivery } from "@/lib/fleet-delivery";

const schema = z.object({ holdToken: z.string().uuid(), channel: xenditChannel.optional(), paymentChoice: z.enum(["deposit", "full"]).optional() }).strict();
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled || session.user.otpPending) return publicJson({ error: "Please sign in to continue." }, { status: 401 });
  if (session.user.role !== "guest") return publicJson({ error: "Please sign in with a guest account to continue." }, { status: 403 });
  if (!supabase || !xenditConfigured()) return publicJson({ error: "Online payment is unavailable right now. Please contact Front Desk for help with your booking.", code: "ONLINE_PAYMENT_UNAVAILABLE", outcome: "not_submitted" }, { status: 503 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return publicJson(validationBody(parsed.error, { error: "Select a valid payment amount and wallet for this booking." }), { status: 400 });
  const { data, error } = await supabase.rpc("hotel_begin_xendit_checkout", {
    p_token: parsed.data.holdToken, p_user_id: session.user.id, p_channel: parsed.data.channel ?? null,
    p_payment_choice: parsed.data.paymentChoice ?? null,
  });
  if (error) {
    console.warn("[xendit] checkout rejected", { code: error.code });
    const message = error.message === "XENDIT_AMOUNT_ALREADY_SELECTED"
      ? "This booking already has a checkout with a different amount. Refresh to reopen the existing checkout."
      : "We couldn't confirm the payment setup. Check your reservation before trying again.";
    return publicJson({ error: message, code: error.message === "XENDIT_AMOUNT_ALREADY_SELECTED" ? "XENDIT_AMOUNT_ALREADY_SELECTED" : "CHECKOUT_UNCONFIRMED", outcome: error.message === "XENDIT_AMOUNT_ALREADY_SELECTED" ? "rejected" : "unknown" }, { status: 409 });
  }
  const attempt = data as { paymentId: string; reservationId: string; status: string; reference: string; checkoutUrl: string | null; sessionId: string | null;
    expiresAt: string; amount: number; create: boolean; firstName: string; lastName: string; channel?: "GCASH" | "PAYMAYA"; paymentChoice: "deposit" | "full" };
  const confirmationUrl = `/booking/confirmation/${encodeURIComponent(attempt.reservationId)}`;
  if (attempt.checkoutUrl && attempt.sessionId) {
    try {
      const current = await getXenditSession(attempt.sessionId);
      if (current.reference_id !== attempt.reference || current.amount !== Number(attempt.amount)) throw new Error("XENDIT_SESSION_MISMATCH");
      if (current.status === "ACTIVE") return publicJson({ data: { checkoutUrl: testCheckoutUrl(attempt.checkoutUrl), confirmationUrl } });
      const outcome = await settleKnownXenditSession(supabase, current);
      if (outcome.outcome === "confirmed" || outcome.outcome === "already_paid") {
        scheduleFleetDelivery(supabase, { reservationId: attempt.reservationId });
      }
      const message = outcome.outcome === "review_required" ? "Accounting is reviewing this payment. Please avoid paying again." : undefined;
      return publicJson({ data: { confirmationUrl }, message });
    } catch { return publicJson({ error: "We couldn't check your existing payment attempt. Try again shortly to reopen it; please don't start another payment." }, { status: 503 }); }
  }
  if (!attempt.create) return publicJson({ data: { confirmationUrl }, message: "Your payment attempt is being checked. No duplicate checkout was created." });
  try {
    const checkout = await createXenditSession({ reference: attempt.reference, amount: Number(attempt.amount),
      reservationId: attempt.reservationId, expiresAt: attempt.expiresAt, firstName: attempt.firstName, lastName: attempt.lastName,
      channel: attempt.channel, paymentChoice: attempt.paymentChoice });
    await attachXenditSession(supabase, checkout);
    return publicJson({ data: { checkoutUrl: checkout.payment_link_url, confirmationUrl } });
  } catch (failure) {
    const code = failure instanceof XenditError ? failure.code : "XENDIT_REQUEST_UNCERTAIN";
    console.warn("[xendit] session creation outcome", { paymentId: attempt.paymentId, code });
    if (failure instanceof XenditError && failure.definitive) {
      const reset = await supabase.rpc("hotel_xendit_creation_rejected", { p_payment: attempt.paymentId });
      if (reset.error) console.error("[xendit] creation reset failed", { paymentId: attempt.paymentId, code: reset.error.code });
      return publicJson({ error: code === "XENDIT_CHANNEL_UNAVAILABLE"
        ? "This wallet is unavailable right now. Choose another available wallet or contact Front Desk."
        : "We couldn't open online checkout. Please try again shortly or contact Front Desk.", code, outcome: "rejected" }, { status: 502 });
    }
    // A timeout may hide a created session. Never issue another chargeable link.
    const queued = await supabase.rpc("mark_xendit_session_uncertain", { p_payment: attempt.paymentId });
    if (queued.error) console.error("[xendit] review queue will retry", { code: queued.error.code });
    return publicJson({ data: { confirmationUrl }, message: "We're checking your payment attempt. Please don't start another payment. Check your reservation for updates." });
  }
}
