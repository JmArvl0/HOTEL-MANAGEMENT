import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { z } from "zod";
import { supabase } from "@/lib/supabase";

/**
 * Pre-arrival ID review: Front Desk verifies an uploaded guest ID before
 * arrival, enabling express self-check-in. Writes identity_status through
 * the existing verify_guest_identity RPC — the only writer, unchanged.
 */
const allowed = new Set(["front_desk"]);

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!allowed.has(session.user.role)) return NextResponse.json({ error: "Front Desk access required." }, { status: 403 });
  if (!supabase) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  const id = (await params).id;
  const [reservation, docs] = await Promise.all([supabase.from("reservations").select("identity_status,status").eq("id", id).single(), supabase.from("guest_id_documents").select("id,status,storage_path,created_at,reviewed_at").eq("reservation_id", id).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1)]);
  if (reservation.error || docs.error) return NextResponse.json({ error: "Unable to load the identity review. Refresh to try again." }, { status: 503 });
  const doc = docs.data?.[0];
  let url: string | null = null;
  if (doc) {
    const signed = await supabase.storage.from("guest-ids").createSignedUrl(doc.storage_path, 60);
    if (signed.error) return NextResponse.json({ error: "The private document could not be opened. Refresh to try again." }, { status: 503 });
    url = signed.data.signedUrl;
  }
  return NextResponse.json({ data: { identityStatus: reservation.data.identity_status, document: doc ? { id: doc.id, status: doc.status, createdAt: doc.created_at, reviewedAt: doc.reviewed_at, url } : null } }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!allowed.has(session.user.role)) return NextResponse.json({ error: "Front Desk access required." }, { status: 403 });
  if (!supabase) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });

  const input = z.object({ documentId: z.string().uuid() }).safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Select the uploaded document you reviewed and refresh if it was replaced." }, { status: 400 });
  const { error } = await supabase.rpc("hms_verify_uploaded_id", { p_actor: session.user.id, p_reservation: (await params).id, p_document: input.data.documentId });
  if (error) return NextResponse.json({ error: error.message.includes("DOCUMENT_STALE") ? "This document was replaced or already reviewed. Refresh before verifying." : "Identity review could not be saved. Neither review status was changed." }, { status: error.message.includes("FORBIDDEN") ? 403 : 409 });
  return NextResponse.json({ ok: true });
}
