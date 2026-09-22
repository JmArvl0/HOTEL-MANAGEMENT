import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

const allowed = new Set(["front_desk", "manager", "owner"]);

const query = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  days: z.coerce.number().int().min(1).max(14).default(7),
});

/**
 * Front Office rack snapshot — one batched read-only payload for the fused
 * Room Rack & Reservations view (front_desk operates, manager/owner oversee):
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

  const [{ data: rooms }, { data: reservations }, { data: invoices }] = await Promise.all([
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
  ]);

  const balances = new Map(
    ((invoices ?? []) as { reservation_id: string; balance: number | string }[]).map((row) => [
      row.reservation_id,
      Number(row.balance ?? 0),
    ])
  );

  return NextResponse.json({
    data: {
      from,
      days: parsed.data.days,
      rooms: rooms ?? [],
      reservations: ((reservations ?? []) as Record<string, unknown>[]).map((row) => ({
        ...row,
        folio_balance: balances.get(String(row.id)) ?? null,
      })),
    },
  });
}
