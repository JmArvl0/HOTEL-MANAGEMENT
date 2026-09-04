import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { estimateTransfer, getTransportVehicleTypes, rideFare, TransferError, TRANSFER_CODES } from "@/lib/transfer";

const quoteSchema = z.object({ pickupAddress: z.string().trim().min(5, "Enter the pickup address.").max(200) });

// Live fare estimate for one pickup->hotel transfer: TomTom geocodes the pickup, routes it to
// the hotel, and prices every active vehicle type. This is an ESTIMATE for display only — the
// holds route re-derives the fare server-side and stores its own value.
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return NextResponse.json({ error: "Sign in to continue your reservation." }, { status: 401 });
  if (session.user.role !== "guest") return NextResponse.json({ error: "Customer access required." }, { status: 403 });
  const parsed = quoteSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Enter a pickup address." }, { status: 400 });
  const { pickupAddress } = parsed.data;
  try {
    const estimate = await estimateTransfer(pickupAddress);
    const vehicles = await getTransportVehicleTypes();
    return NextResponse.json({
      pickupAddress: estimate.pickupAddress,
      dropoffLabel: estimate.dropoffLabel,
      distanceKm: Number(estimate.distanceKm.toFixed(2)),
      durationMin: Number(estimate.durationMin.toFixed(1)),
      vehicles: vehicles.map((vehicle) => ({
        id: vehicle.id,
        name: vehicle.name,
        description: vehicle.description,
        seats: vehicle.seats,
        baseFare: vehicle.baseFare,
        perKm: vehicle.perKm,
        perMinute: vehicle.perMinute,
        bookingFee: vehicle.bookingFee,
        fare: rideFare(vehicle, estimate.distanceKm, estimate.durationMin),
      })),
    });
  } catch (error) {
    if (error instanceof TransferError) {
      if (error.code === TRANSFER_CODES.NOT_CONFIGURED) return NextResponse.json({ error: "Transfers are not available right now." }, { status: 503 });
      return NextResponse.json({ error: error.message }, { status: error.code === TRANSFER_CODES.ROUTE ? 503 : 422 });
    }
    return NextResponse.json({ error: "We could not estimate this transfer right now. Please try again." }, { status: 503 });
  }
}
