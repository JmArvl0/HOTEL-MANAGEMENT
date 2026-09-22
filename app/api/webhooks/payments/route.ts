import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { resolveGatewaySecrets, verifyWebhookSignature } from "@/lib/gateway";
import { confirmGatewayEvent } from "@/lib/gateway-store";

/**
 * PayMongo webhook — NO session. The HMAC signature over the RAW body is the
 * only authority, verified before any database read. Replays return 200 with
 * existing state so the provider stops retrying. Never 5xx on provider input.
 */
export async function POST(request: Request) {
  const { webhookSecret } = resolveGatewaySecrets();
  if (!webhookSecret || !supabase) return NextResponse.json({ error: "Webhook unavailable." }, { status: 503 });

  const raw = await request.text();
  const signature =
    request.headers.get("paymongo-signature") ??
    request.headers.get("x-paymongo-signature") ??
    request.headers.get("x-webhook-signature") ??
    "";
  if (!verifyWebhookSignature(raw, signature, webhookSecret))
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });

  let event: unknown;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  try {
    const outcome = await confirmGatewayEvent(supabase, event);
    if (outcome === "ignored") return NextResponse.json({ received: true, ignored: true });
    return NextResponse.json({ received: true, ...outcome });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook failed.";
    if (message === "PAYMENT_NOT_FOUND") return NextResponse.json({ error: "Unknown payment reference." }, { status: 404 });
    if (message === "PAYMENT_AMOUNT_MISMATCH" || message === "INVALID_GATEWAY_PAYLOAD")
      return NextResponse.json({ error: "Invalid payment details." }, { status: 400 });
    if (message === "ROOM_TYPE_UNAVAILABLE" || message === "HOLD_EXPIRED")
      return NextResponse.json({ error: "Booking no longer available." }, { status: 409 });
    return NextResponse.json({ error: "Unable to confirm payment." }, { status: 500 });
  }
}
