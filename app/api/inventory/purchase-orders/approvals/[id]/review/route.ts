import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import type { Role } from "@/lib/types";

const schema = z.object({ decision: z.enum(["approve", "reject"]), reason: z.string().trim().min(3).max(1000) });

// Owner/Admin review of purchase-order exceptions (above the auto-approve threshold).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["owner", "admin"].includes(session.user.role as Role)) return NextResponse.json({ error: "Owner/Admin review authority required." }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "A decision and reason are required." }, { status: 400 });
  if (!supabase) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  const { data, error } = await supabase.rpc("review_purchase_order_approval", {
    p_approval_id: (await params).id, p_staff_user_id: session.user.id, p_decision: parsed.data.decision, p_reason: parsed.data.reason
  });
  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("PO_APPROVAL_STALE") || msg.includes("PO_APPROVAL_NOT_FOUND")) return NextResponse.json({ error: "This request has already been reviewed." }, { status: 409 });
    if (msg.includes("PO_REASON_REQUIRED")) return NextResponse.json({ error: "A reason is required to reject." }, { status: 400 });
    return NextResponse.json({ error: "Unable to review the purchase order." }, { status: 409 });
  }
  return NextResponse.json({ data });
}
