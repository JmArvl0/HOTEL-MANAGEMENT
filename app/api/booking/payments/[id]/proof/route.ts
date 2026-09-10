import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { PROOF_BUCKET } from "@/lib/payment-proof";

/**
 * Short-lived signed URL for a payment proof. The DB stores storage paths,
 * never URLs; each view mints a 60-second URL server-side.
 *
 * Access is deliberately narrower than payment listing: only the paying
 * guest (payment → reservation.user_id) and Accounting (the verifier).
 * Front Desk and Manager can list payments but never see the proof image;
 * housekeeping/maintenance have no route here at all.
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return NextResponse.json({ error: "Sign in to view this payment proof." }, { status: 401 });
  if (!supabase) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid payment record." }, { status: 400 });
  try {
    const { data: payment } = await supabase
      .from("payments")
      .select("id,proof_storage_path,reservations(user_id)")
      .eq("id", id)
      .maybeSingle();
    if (!payment || !payment.proof_storage_path) return NextResponse.json({ error: "No payment proof on file." }, { status: 404 });
    const owner = (payment.reservations as { user_id?: string } | null)?.user_id;
    const allowed = session.user.role === "accounting" || owner === session.user.id;
    if (!allowed) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const { data, error } = await supabase.storage.from(PROOF_BUCKET).createSignedUrl(payment.proof_storage_path, 60);
    if (error || !data?.signedUrl) return NextResponse.json({ error: "Unable to load the payment proof." }, { status: 500 });
    return NextResponse.json({ url: data.signedUrl, expiresInSeconds: 60 });
  } catch {
    return NextResponse.json({ error: "Unable to load the payment proof." }, { status: 500 });
  }
}
