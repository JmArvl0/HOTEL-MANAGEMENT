import { publicJson } from "@/lib/server-errors";
import { getServerSession } from "next-auth";

import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { PROOF_BUCKET } from "@/lib/payment-proof";

const privateResponse = { headers: { "Cache-Control": "private, no-store" } };

/**
 * Short-lived signed URL for a payment proof. The DB stores storage paths,
 * never URLs; each view mints a 60-second URL server-side.
 *
 * Access is deliberately narrower than payment listing: only the paying
 * guest (payment → reservation.user_id) and Accounting.
 * Front Desk and Manager can list payments but never see the proof image;
 * housekeeping/maintenance have no route here at all.
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return publicJson({ error: "Sign in to view this payment proof." }, { status: 401 });
  if (!supabase) return publicJson({ error: "This service is temporarily unavailable. Please try again shortly." }, { status: 503 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return publicJson({ error: "Reopen this payment from Payment history." }, { status: 400 });
  try {
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select("id,proof_storage_path,reservations(user_id)")
      .eq("id", id)
      .maybeSingle();
    if (paymentError) throw paymentError;
    const owner = (payment?.reservations as { user_id?: string } | null)?.user_id;
    const allowed = session.user.role === "accounting" || (session.user.role === "guest" && owner === session.user.id);
    if (!allowed || !payment?.proof_storage_path) return publicJson({ error: "Not found." }, { ...privateResponse, status: 404 });
    const { data, error } = await supabase.storage.from(PROOF_BUCKET).createSignedUrl(payment.proof_storage_path, 60);
    if (error || !data?.signedUrl) return publicJson({ error: "Unable to load the payment proof." }, { status: 500 });
    const { error: auditError } = await supabase.from("audit_logs").insert({
      user_id: session.user.id, action: "view_payment_proof", entity_type: "payment", entity_id: id,
    });
    if (auditError) throw auditError;
    return publicJson({ url: data.signedUrl, expiresInSeconds: 60 }, privateResponse);
  } catch {
    return publicJson({ error: "Unable to load the payment proof." }, { status: 500 });
  }
}
