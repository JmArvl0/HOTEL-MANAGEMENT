import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { breakfastOfferInput } from "@/lib/breakfast";
import { hotelBreakfastEnabled } from "@/lib/breakfast-server";
import { supabase } from "@/lib/supabase";

const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("propose"), roomTypeId: z.string().uuid(), offer: breakfastOfferInput }).strict(),
  z.object({ action: z.literal("decide"), offerId: z.string().uuid(), publish: z.boolean() }).strict(),
]);

async function actor() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled || session.user.otpPending || !["owner", "admin", "manager"].includes(session.user.role)) return null;
  return session.user;
}

export async function GET() {
  if (!await actor()) return Response.json({ error: "Hotel access required." }, { status: 403 });
  if (!hotelBreakfastEnabled()) return Response.json({ enabled: false, offers: [] });
  if (!supabase) return Response.json({ error: "Breakfast offers are unavailable." }, { status: 503 });
  const { data, error } = await supabase.from("hotel_breakfast_offers")
    .select("id,room_type_id,mode,price_minor,first_day,last_day,service_start,service_end,venue,status").in("status", ["pending", "published"]);
  if (error) return Response.json({ error: "Breakfast offers are unavailable." }, { status: 503 });
  return Response.json({ enabled: true, offers: data });
}

export async function POST(request: Request) {
  const user = await actor();
  if (!user) return Response.json({ error: "Hotel access required." }, { status: 403 });
  if (!hotelBreakfastEnabled() || !supabase) return Response.json({ error: "Breakfast offers are unavailable." }, { status: 503 });
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Check the breakfast price, dates and hours." }, { status: 400 });
  const body = parsed.data;
  if (body.action === "decide" && user.role === "manager") return Response.json({ error: "Owner or Admin approval is required." }, { status: 403 });
  const { error } = body.action === "propose"
    ? await supabase.rpc("hotel_propose_breakfast", { p_actor: user.id, p_room_type: body.roomTypeId, p_offer: body.offer })
    : await supabase.rpc("hotel_decide_breakfast", { p_actor: user.id, p_offer: body.offerId, p_publish: body.publish });
  if (error) return Response.json({ error: error.message.includes("BREAKFAST_PROPOSAL_PENDING") ? "Review the pending offer before submitting another." : "Could not save the breakfast offer. Refresh and try again." }, { status: 409 });
  return Response.json({ ok: true });
}
