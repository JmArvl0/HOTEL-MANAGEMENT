import { NextResponse } from "next/server";
import { operatingDayCoverageSchema } from "@/lib/hotel-operations";
import { hotelBody, hotelGuard, hotelRpc } from "@/lib/hotel-operations-route";

export async function GET() {
  const ctx = await hotelGuard(["owner"]);
  return ctx instanceof NextResponse ? ctx : hotelRpc(ctx, "hotel_operating_day_coverage");
}

export async function PUT(request: Request) {
  const ctx = await hotelGuard(["owner"]);
  if (ctx instanceof NextResponse) return ctx;
  const body = await hotelBody(request, operatingDayCoverageSchema);
  if (body instanceof NextResponse) return body;
  return hotelRpc(ctx, "hotel_set_operating_day_coverage", {
    p_primary: body.primaryId,
    p_backup: body.backupId,
    p_version: body.expectedVersion,
    p_reason: body.reason,
  });
}
