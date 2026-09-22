import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { createGCashCheckoutSource, gatewayConfigured, toCentavos } from "@/lib/gateway";

const schema = z.object({ holdToken: z.string().uuid() });

/**
 * Starts a gateway checkout for the guest's own ACTIVE hold. Creates the
 * provider session first (amount from the priced hold), then records the
 * pending reservation + pending_verification payment via
 * submit_gateway_deposit. Money moves only via the signed webhook; the
 * manual GCash path is unchanged.
 */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "guest") return NextResponse.json({ error: "Customer access required." }, { status: 403 });
  if (!supabase) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  if (!gatewayConfigured())
    return NextResponse.json(
      { error: "Online payment is not configured. Please use manual GCash transfer." },
      { status: 503 }
    );

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A booking hold is required." }, { status: 400 });

  const { data: hold } = await supabase
    .from("booking_holds")
    .select("token,user_id,status,expires_at,total,deposit_required,room_type,reservation_id")
    .eq("token", parsed.data.holdToken)
    .eq("user_id", session.user.id)
    .maybeSingle();
  const h = hold as {
    token: string; status: string; expires_at: string; total: number;
    deposit_required: number; room_type: string; reservation_id: string | null;
  } | null;
  if (!h) return NextResponse.json({ error: "Booking hold not found." }, { status: 404 });
  // A submitted hold already has a pending reservation: resume its gateway row.
  if (h.reservation_id) {
    const { data: payment } = await supabase
      .from("payments")
      .select("gateway_reference_id")
      .eq("reservation_id", h.reservation_id)
      .eq("purpose", "reservation_deposit")
      .eq("status", "pending_verification")
      .eq("method", "gateway_paymongo")
      .maybeSingle();
    if (payment) {
      return NextResponse.json({
        data: { reservationId: h.reservation_id, resume: true },
        message: "A gateway payment is already pending for this booking. Complete it in your provider app or pay manually.",
      });
    }
    return NextResponse.json({ error: "This booking already has a submitted payment." }, { status: 409 });
  }
  if (h.status !== "active" || new Date(h.expires_at) <= new Date())
    return NextResponse.json({ error: "Your reservation hold expired. Please choose rooms again." }, { status: 409 });

  const origin = new URL(request.url).origin;
  let checkout: { sessionId: string; checkoutUrl: string };
  try {
    checkout = await createGCashCheckoutSource({
      amountInCentavos: toCentavos(Number(h.deposit_required)),
      description: `Haven deposit ${h.room_type}`,
      reservationReference: parsed.data.holdToken.replaceAll("-", "").slice(0, 30),
      redirectUrls: {
        success: `${origin}/booking/search?paid=1`,
        cancel: `${origin}/booking/payment/${parsed.data.holdToken}`,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to start online payment. Please use manual GCash transfer." },
      { status: 502 }
    );
  }

  const { data, error } = await supabase.rpc("submit_gateway_deposit", {
    p_token: parsed.data.holdToken,
    p_user_id: session.user.id,
    p_gateway_ref: checkout.sessionId,
  });
  if (error) {
    const code = error.message.split(":")[0].trim();
    if (code === "HOLD_EXPIRED" || code === "ROOM_TYPE_UNAVAILABLE" || code === "RATE_CHANGED")
      return NextResponse.json({ error: "This booking is no longer available at the held price." }, { status: 409 });
    return NextResponse.json({ error: "Unable to start online payment." }, { status: 500 });
  }
  const row = (Array.isArray(data) ? data[0] : data) as { reservation_id: string };
  return NextResponse.json({
    data: { checkoutUrl: checkout.checkoutUrl, reservationId: row.reservation_id },
  });
}
