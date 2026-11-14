import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { supabase } from "@/lib/supabase";
import { verifyXenditToken, xenditConfig } from "@/lib/xendit";
import { processXenditEvent } from "@/lib/xendit-store";

export async function POST(request: Request) {
  let token: string;
  try { token = xenditConfig().webhookToken; } catch { return NextResponse.json({ error: "Webhook unavailable." }, { status: 503 }); }
  if (!verifyXenditToken(request.headers.get("x-callback-token"), token)) {
    console.warn("[xendit] webhook unauthorized");
    return NextResponse.json({ error: "Invalid callback token." }, { status: 401 });
  }
  if (!supabase) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  let input: unknown;
  try { input = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  try {
    const result = await processXenditEvent(supabase, input);
    console.info("[xendit] webhook processed", result);
    return NextResponse.json({ received: true, ...result });
  } catch (error) {
    const invalid = error instanceof ZodError || (error instanceof Error && /XENDIT_SESSION_MISMATCH|XENDIT_TRANSACTION_REQUIRED/.test(error.message));
    console.error("[xendit] webhook processing failed", { outcome: invalid ? "invalid_details" : "retry_required" });
    // Transient API/DB failures and a racing creation need Xendit's retry.
    return NextResponse.json({ error: invalid ? "Invalid payment details." : "Payment notification needs retry." }, { status: invalid ? 400 : 503 });
  }
}
