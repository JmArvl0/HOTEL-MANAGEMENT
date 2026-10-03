import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase"; import { maintenanceBlockedRoomIds } from "@/lib/room-rack";

const allowed = new Set(["front_desk", "manager", "owner"]);

const query = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  days: z.coerce.number().int().min(1).max(14).default(7),
});

/**
 * Front Office rack snapshot — one batched read-only payload for the fused
 * Room Reservations view (front_desk operates, manager/owner oversee):
 * room inventory with readiness, reservations overlapping the window, and
 * the unassigned-arrivals queue. All writes still
 * go through the existing assign / check-in / prioritize routes and RPCs.
 */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!allowed.has(session.user.role)) return NextResponse.json({ error: "Front Office access required." }, { status: 403 });
  if (!supabase) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });

  const parsed = query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Invalid date window." }, { status: 400 });
  const from = parsed.data.from ?? new Date().toISOString().slice(0, 10);
  const toDate = new Date(`${from}T00:00:00Z`);
  toDate.setUTCDate(toDate.getUTCDate() + parsed.data.days);
  const to = toDate.toISOString().slice(0, 10);

  const [{ data: rooms }, { data: reservations }, { data: invoices }, { data: types }, { data: orders }] = await Promise.all([
    supabase
      .from("rooms")
      .select("id,number,floor,wing,type,status,housekeeping,administratively_active")
      .order("floor", { ascending: true })
      .order("number", { ascending: true }),
    supabase
      .from("reservations")
      .select("id,confirmation_number,guest_name,room_type,room_id,room_number,check_in,check_out,status,payment_status,identity_status,source,total")
      .lt("check_in", to)
      .gt("check_out", from)
      .not("status", "in", "(cancelled,no_show)")
      .order("check_in", { ascending: true }),
    supabase.from("invoices").select("reservation_id,balance").not("reservation_id", "is", null),
    supabase.from("room_types").select("name,badge_color_key"), supabase.from("maintenance_orders").select("room_id,room_number,status,serviceability_impact").in("status", ["open", "assigned", "in_progress", "waiting_parts", "deferred"]).in("serviceability_impact", ["blocked", "out_of_service"]),
  ]);

  const colors = new Map(
    ((types ?? []) as { name: string; badge_color_key: string | null }[]).map((row) => [
      String(row.name),
      row.badge_color_key,
    ])
  );

  const balances = new Map(
    ((invoices ?? []) as { reservation_id: string; balance: number | string }[]).map((row) => [
      row.reservation_id,
      Number(row.balance ?? 0),
    ])
  );

  const blockedRoomIds = [...maintenanceBlockedRoomIds(((orders ?? []) as Record<string, unknown>[]).map((row) => ({ room_id: row.room_id, room_number: row.room_number, status: row.status, serviceability_impact: row.serviceability_impact })), ((rooms ?? []) as Record<string, unknown>[]).map((row) => ({ id: String(row.id), number: row.number })))];  return NextResponse.json({
    data: {
      from,
      blockedRoomIds,
      days: parsed.data.days,
      rooms: ((rooms ?? []) as Record<string, unknown>[]).map((row) => ({
        ...row,
        room_type_color: colors.get(String(row.type)) ?? null,
      })),
      reservations: ((reservations ?? []) as Record<string, unknown>[]).map((row) => ({
        ...row,
        folio_balance: balances.get(String(row.id)) ?? null,
      })),
    },
  });
}
