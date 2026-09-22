import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import type { Role } from "@/lib/types";

const schema = z.object({
  pointsDelta: z.number().int().min(-1000000).max(1000000).refine((n) => n !== 0, "Amount cannot be zero."),
  reason: z.string().trim().min(3).max(500)
});

// Manager/Owner/Admin service-recovery point adjustment. Reason required; the
// RPC appends an 'adjusted' ledger row and audits.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["manager", "owner", "admin"].includes(session.user.role as Role)) return NextResponse.json({ error: "Manager adjustment authority required." }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "A non-zero amount and a reason (3–500 chars) are required." }, { status: 400 });
  if (!supabase) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  const { data, error } = await supabase.rpc("adjust_loyalty_points", {
    p_guest_id: (await params).id,
    p_points_delta: parsed.data.pointsDelta,
    p_reason: parsed.data.reason,
    p_staff_user_id: session.user.id
  });
  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("LOYALTY_INSUFFICIENT_POINTS")) return NextResponse.json({ error: "That would drive the balance negative." }, { status: 409 });
    if (msg.includes("LOYALTY_NO_GUEST")) return NextResponse.json({ error: "Guest not found." }, { status: 404 });
    return NextResponse.json({ error: "Unable to adjust points." }, { status: 409 });
  }
  return NextResponse.json({ data });
}
