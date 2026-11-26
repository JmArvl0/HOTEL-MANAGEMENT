import { NextResponse } from "next/server";
import { hotelGuard, hotelRpc } from "@/lib/hotel-operations-route";
import { normalizePhone } from "@/lib/input-validation";
import { publicJson } from "@/lib/server-errors";

export async function GET(request: Request) {
  const context = await hotelGuard(["front_desk"]);
  if (context instanceof NextResponse) return context;
  const query = new URL(request.url).searchParams.get("query")?.trim() ?? "";
  if (query.length < 2 || query.length > 120) return publicJson({ data: [] });
  return hotelRpc(context, "hotel_staff_booking_guests", { p_query: normalizePhone(query) ?? query });
}
