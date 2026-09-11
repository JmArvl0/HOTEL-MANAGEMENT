import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

const allowed = new Set(["front_desk"]);

type InventoryRow = {
  room_type_id: string;
  room_type_name: string;
  room_id: string;
  room_number: string;
  floor: number | null;
};

const room = (item: InventoryRow, colorKeys: Map<string, string | null>) => ({
  id: item.room_id,
  number: item.room_number,
  floor: item.floor,
  type: item.room_type_name,
  roomTypeId: item.room_type_id,
  badgeColorKey: colorKeys.get(item.room_type_name) ?? null,
});

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!allowed.has(session.user.role)) return NextResponse.json({ error: "Front Desk access required." }, { status: 403 });
  if (!supabase) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });

  const id = (await params).id;
  const { data: reservation } = await supabase
    .from("reservations")
    .select("id,room_type,check_in,check_out,status")
    .eq("id", id)
    .maybeSingle();
  if (!reservation) return NextResponse.json({ error: "Reservation not found." }, { status: 404 });

  const { data, error } = await supabase.rpc("front_desk_eligible_room_inventory", { p_reservation_id: id });
  if (error) return NextResponse.json({ error: "Unable to load eligible room inventory." }, { status: 500 });
  const inventory = (data ?? []) as InventoryRow[];
  // Room-type badge colors, one small lookup for the whole list.
  const { data: roomTypes } = await supabase.from("room_types").select("name,badge_color_key");
  const colorKeys = new Map((roomTypes ?? []).map((type) => [String(type.name), (type.badge_color_key as string | null) ?? null]));
  const search = new URL(request.url).searchParams;
  const roomTypeId = search.get("roomTypeId");
  const exceptionType = search.get("exceptionType");

  if (roomTypeId) {
    const selected = inventory.filter((item) => item.room_type_id === roomTypeId && item.room_type_name !== reservation.room_type);
    if (selected.length === 0) return NextResponse.json({ error: "Room inventory changed. No eligible rooms remain for that room type." }, { status: 409 });
    const { data: type } = await supabase.from("room_types").select("base_rate").eq("id", roomTypeId).maybeSingle();
    // Per-night resolver rates for this reservation's window — a weekend/seasonal
    // plan can price the nights differently from base_rate. Preview only; the
    // exception RPC stamps the authoritative financials.
    const { data: nights } = await supabase.rpc("room_nightly_rates", {
      p_room_type: selected[0].room_type_name, p_from: reservation.check_in, p_to: reservation.check_out,
    });
    return NextResponse.json({
      data: selected.map((item) => room(item, colorKeys)),
      selectedRoomType: { roomTypeId: selected[0].room_type_id, roomTypeName: selected[0].room_type_name, eligibleRoomCount: selected.length },
      typeRate: type?.base_rate ?? null,
      nightlyRates: (nights ?? []) as { night: string; rate: number }[],
    });
  }

  if (exceptionType) {
    const { data: approved } = await supabase
      .from("manager_approval_requests")
      .select("id,requested_action,guest_accepted_at")
      .eq("reservation_id", id)
      .eq("request_type", "room_type_exception")
      .eq("status", "approved")
      .eq("execution_status", "awaiting_execution")
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const action = (approved?.requested_action ?? {}) as Record<string, unknown>;
    const approvedType = String(action.roomType ?? "");
    const approvedTypeId = String(action.requestedRoomTypeId ?? "");
    const approvedRoomId = String(action.requestedRoomId ?? "");
    const approvedRows = approved
      ? inventory.filter((item) => item.room_type_name === approvedType && (!approvedTypeId || item.room_type_id === approvedTypeId) && (!approvedRoomId || item.room_id === approvedRoomId))
      : [];
    const { data: type } = approvedTypeId
      ? await supabase.from("room_types").select("base_rate").eq("id", approvedTypeId).eq("active", true).maybeSingle()
      : await supabase.from("room_types").select("base_rate").eq("name", approvedType).eq("active", true).maybeSingle();
    return NextResponse.json({
      data: approvedRows.map((item) => room(item, colorKeys)),
      exceptionApproved: Boolean(approved && approvedType === exceptionType),
      exceptionType: approved ? approvedType : null,
      typeRate: type?.base_rate ?? null,
      // Server-stamped financial snapshot + acceptance state (migration 20260922010000);
      // the dialog renders it, the RPCs consume it — the client never derives it.
      financials: (action.financials ?? null) as Record<string, unknown> | null,
      guestAcceptedAt: approved?.guest_accepted_at ?? null,
    });
  }

  const reservedRooms = inventory.filter((item) => item.room_type_name === reservation.room_type);
  const grouped = new Map<string, { roomTypeId: string; roomTypeName: string; eligibleRoomCount: number }>();
  for (const item of inventory) {
    if (item.room_type_name === reservation.room_type) continue;
    const current = grouped.get(item.room_type_id);
    if (current) current.eligibleRoomCount += 1;
    else grouped.set(item.room_type_id, { roomTypeId: item.room_type_id, roomTypeName: item.room_type_name, eligibleRoomCount: 1 });
  }
  const alternativeRoomTypes = [...grouped.values()].filter((type) => type.eligibleRoomCount > 0);
  const reservedTypeId = inventory.find((item) => item.room_type_name === reservation.room_type)?.room_type_id
    ?? (await supabase.from("room_types").select("id").eq("name", reservation.room_type).maybeSingle()).data?.id
    ?? null;

  // Alternative types are always offered: a guest-requested voluntary upgrade is a
  // legitimate exception even while reserved-type rooms remain (the server gates decide —
  // hotel-caused reasons are rejected with ROOM_TYPE_EXCEPTION_NOT_NEEDED when the reserved
  // type still has an eligible room, and the dialog warns before submitting).
  return NextResponse.json({
    data: reservedRooms.map((item) => room(item, colorKeys)),
    reservedRoomTypeId: reservedTypeId,
    alternativeRoomTypes,
  });
}