import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

/**
 * Pre-arrival ID review: Front Desk verifies an uploaded guest ID before
 * arrival, enabling express self-check-in. Writes identity_status through
 * the existing verify_guest_identity RPC — the only writer, unchanged.
 */
const allowed = new Set(["front_desk"]);

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!allowed.has(session.user.role)) return NextResponse.json({ error: "Front Desk access required." }, { status: 403 });
  if (!supabase) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });

  const { error } = await supabase.rpc("verify_guest_identity", {
    p_reservation_id: (await params).id,
    p_staff_user_id: session.user.id,
  });
  if (error)
    return NextResponse.json({ error: "Identity verification is not permitted for this reservation." }, { status: 409 });
  await supabase
    .from("guest_id_documents")
    .update({ status: "verified", reviewed_by: session.user.id, reviewed_at: new Date().toISOString() })
    .eq("reservation_id", (await params).id)
    .eq("status", "pending_review");
  return NextResponse.json({ ok: true });
}
