import { NextResponse } from "next/server";
import { hotelGuard, hotelRpc } from "@/lib/hotel-operations-route";
import { publicJson } from "@/lib/server-errors";

export async function GET(request: Request) {
  const context = await hotelGuard(["front_desk"]);
  if (context instanceof NextResponse) return context;
  const ids = [...new Set(new URL(request.url).searchParams.getAll("id"))];
  if (ids.length > 20 || ids.some(id => !id || id.length > 60)) return publicJson({ error: "Review up to 20 arrivals at a time." }, { status: 400 });
  return ids.length ? hotelRpc(context, "hotel_staff_arrival_readiness", { p_reservation_ids: ids }) : publicJson({ data: {} });
}
