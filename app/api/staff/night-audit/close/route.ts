import { NextResponse } from "next/server";
import { closeDaySchema } from "@/lib/hotel-operations";
import { hotelBody, hotelGuard, hotelRpc } from "@/lib/hotel-operations-route";

export async function POST(request: Request) {
  const ctx = await hotelGuard(["accounting", "manager"]);
  if (ctx instanceof NextResponse) return ctx;
  const body = await hotelBody(request, closeDaySchema);
  if (body instanceof NextResponse) return body;
  return hotelRpc(ctx, "hotel_night_audit_close", {
    p_date: body.businessDate,
    p_version: body.expectedVersion,
    p_key: body.idempotencyKey,
  });
}
