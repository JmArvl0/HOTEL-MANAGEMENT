import { randomUUID } from "node:crypto";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

const schema = z.object({
  reservationId: z.string().min(1),
  points: z.number().int().positive().max(1000000),
  idempotencyKey: z.string().uuid().optional()
});

// Guest redeems points for a PHP 1/pt folio credit on their own reservation.
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "guest") return NextResponse.json({ error: "Guest access required." }, { status: 403 });
  if (!supabase) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Choose a reservation and a positive point amount." }, { status: 400 });
  const { data: guest } = await supabase.from("guests").select("id").eq("user_account_id", session.user.id).maybeSingle();
  if (!guest) return NextResponse.json({ error: "No guest profile found." }, { status: 404 });
  const { data, error } = await supabase.rpc("redeem_loyalty_points", {
    p_guest_id: (guest as { id: string }).id,
    p_points: parsed.data.points,
    p_reservation_id: parsed.data.reservationId,
    p_user_id: session.user.id,
    p_idempotency_key: parsed.data.idempotencyKey ?? randomUUID()
  });
  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("LOYALTY_INSUFFICIENT_POINTS")) return NextResponse.json({ error: "Not enough points for that redemption." }, { status: 409 });
    if (msg.includes("LOYALTY_ALREADY_REDEEMED")) return NextResponse.json({ error: "Already redeemed — check your folio." }, { status: 409 });
    if (msg.includes("LOYALTY_NOT_YOUR_POINTS") || msg.includes("LOYALTY_RESERVATION_MISMATCH")) return NextResponse.json({ error: "Those points or that stay are not yours." }, { status: 403 });
    if (msg.includes("LOYALTY_FOLIO_CLOSED")) return NextResponse.json({ error: "That stay's folio is closed." }, { status: 409 });
    if (msg.includes("LOYALTY_NOTHING_TO_DISCOUNT")) return NextResponse.json({ error: "Nothing left to discount on that folio." }, { status: 409 });
    return NextResponse.json({ error: "Unable to redeem points." }, { status: 409 });
  }
  return NextResponse.json({ data });
}
