import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { createXenditSession, getXenditSession, testCheckoutUrl, XenditError, xenditChannel, xenditConfigured } from "@/lib/xendit";
import { attachXenditSession } from "@/lib/xendit-store";

const schema = z.object({ holdToken: z.string().uuid(), channel: xenditChannel.optional(), paymentChoice: z.enum(["deposit", "full"]).optional() }).strict();
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "guest") return NextResponse.json({ error: "Customer access required." }, { status: 403 });
  if (!supabase || !xenditConfigured()) return NextResponse.json({ error: "Xendit sandbox is not configured. Contact the hotel." }, { status: 503 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Select a valid payment amount and wallet for this booking." }, { status: 400 });
  const { data, error } = await supabase.rpc("hotel_begin_xendit_checkout", {
    p_token: parsed.data.holdToken, p_user_id: session.user.id, p_channel: parsed.data.channel ?? null,
    p_payment_choice: parsed.data.paymentChoice ?? null,
  });
  if (error) {
    console.warn("[xendit] checkout rejected", { code: error.code });
    const message = error.message === "XENDIT_AMOUNT_ALREADY_SELECTED"
      ? "This booking already has a checkout with a different amount. Refresh to reopen the existing checkout."
      : "This booking cannot start payment. Refresh availability and try again.";
    return NextResponse.json({ error: message }, { status: 409 });
  }
  const attempt = data as { paymentId: string; reservationId: string; status: string; reference: string; checkoutUrl: string | null; sessionId: string | null;
    expiresAt: string; amount: number; create: boolean; firstName: string; lastName: string; channel?: "GCASH" | "PAYMAYA"; paymentChoice: "deposit" | "full" };
  const confirmationUrl = `/booking/confirmation/${encodeURIComponent(attempt.reservationId)}`;
  if (attempt.checkoutUrl && attempt.sessionId) {
    try {
      const current = await getXenditSession(attempt.sessionId);
      if (current.reference_id !== attempt.reference || current.amount !== Number(attempt.amount)) throw new Error("XENDIT_SESSION_MISMATCH");
      if (current.status === "ACTIVE") return NextResponse.json({ data: { checkoutUrl: testCheckoutUrl(attempt.checkoutUrl), confirmationUrl } });
      if (current.status === "EXPIRED" || current.status === "CANCELED") {
        const closed = await supabase.rpc("hotel_process_xendit_event", { p_event: "payment_session.expired", p_reference: current.reference_id,
          p_session: current.payment_session_id, p_amount: current.amount, p_currency: current.currency, p_transaction: null, p_channel: null });
        if (closed.error) throw new Error("XENDIT_CLOSE_RETRY_REQUIRED");
      }
      return NextResponse.json({ data: { confirmationUrl }, message: "Checkout status updated. A completed payment still awaits its verified notification." });
    } catch { return NextResponse.json({ error: "Unable to check your existing sandbox checkout. Please retry shortly." }, { status: 503 }); }
  }
  if (!attempt.create) return NextResponse.json({ data: { confirmationUrl }, message: "Your payment attempt is being checked. No duplicate checkout was created." });
  try {
    const checkout = await createXenditSession({ reference: attempt.reference, amount: Number(attempt.amount),
      reservationId: attempt.reservationId, expiresAt: attempt.expiresAt, firstName: attempt.firstName, lastName: attempt.lastName,
      channel: attempt.channel, paymentChoice: attempt.paymentChoice });
    await attachXenditSession(supabase, checkout);
    return NextResponse.json({ data: { checkoutUrl: checkout.payment_link_url, confirmationUrl } });
  } catch (failure) {
    const code = failure instanceof XenditError ? failure.code : "XENDIT_REQUEST_UNCERTAIN";
    console.warn("[xendit] session creation outcome", { paymentId: attempt.paymentId, code });
    if (failure instanceof XenditError && failure.definitive) {
      const reset = await supabase.rpc("hotel_xendit_creation_rejected", { p_payment: attempt.paymentId });
      if (reset.error) console.error("[xendit] creation reset failed", { paymentId: attempt.paymentId, code: reset.error.code });
      return NextResponse.json({ error: code === "XENDIT_CHANNEL_UNAVAILABLE"
        ? "Xendit cannot offer this wallet in the current sandbox account. Check channel availability in the Xendit Dashboard, or try the other wallet."
        : "Xendit rejected sandbox checkout. Check test key permissions and sandbox setup, then retry." }, { status: 502 });
    }
    // A timeout may hide a created session. Never issue another chargeable link.
    return NextResponse.json({ data: { confirmationUrl }, message: "Xendit has not confirmed checkout creation. We are keeping this attempt pending to prevent duplicates." });
  }
}
