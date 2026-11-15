import { isDecodableEvidenceImage } from "@/lib/location-image";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { limitedBytes, pickupProfileSchema } from "@/lib/fleet-contract";
import { PROOF_MAX_BYTES, proofExt, proofMime, sniffProofKind } from "@/lib/payment-proof";
import { guardPickupRequest, PICKUP_PHOTO_BUCKET, pickupJson } from "@/lib/transport-pickup-route";
import { deliverFleetWithdrawals } from "@/lib/fleet-tracking-revocation";

type Context = { params: Promise<{ id: string }> };
export const maxDuration = 30;
export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return pickupJson({ error: "Request not found." }, 404);
  const guard = await guardPickupRequest(id);
  if (guard instanceof NextResponse) return guard;
  const { data, error } = await guard.client.from("transport_pickup_profiles").select("traveler_name,phone,email,sharing_enabled,photo_path,photo_version,version,ride_preferences,luggage_count,luggage_notes,ride_notes").eq("request_id", id).maybeSingle();
  if (error) return pickupJson({ error: "Pickup profiles are not available yet." }, 503);
  let photoUrl: string | null = null;
  if (data?.photo_path) {
    const audit = await guard.client.from("audit_logs").insert({ user_id: guard.actor, action: "transport_pickup_photo_link_issued", entity_type: "transportation_request", entity_id: id, after_data: { photoVersion: data.photo_version, expiresIn: 60 } });
    if (!audit.error) {
      const signed = await guard.client.storage.from(PICKUP_PHOTO_BUCKET).createSignedUrl(data.photo_path, 60);
      if (!signed.error) photoUrl = signed.data.signedUrl;
    }
  }
  // Storage paths and private booking/ID files are never part of this response.
  let defaults = null;
  if (!data && guard.role === "guest") {
    const [account, guests] = await Promise.all([
      guard.client.from("user_accounts").select("name,email").eq("id", guard.actor).single(),
      guard.client.from("guests").select("phone").eq("user_account_id", guard.actor).limit(2),
    ]);
    if (!account.error && !guests.error) defaults = { travelerName: account.data.name, email: account.data.email, phone: guests.data?.length === 1 ? guests.data[0].phone ?? "" : "" };
  }
  return pickupJson({ profile: data ? { travelerName: data.traveler_name, phone: data.phone, email: data.email ?? "", sharingEnabled: data.sharing_enabled, hasPhoto: Boolean(data.photo_path), photoUrl, photoVersion: data.photo_version, version: data.version, ridePreferences: data.ride_preferences, luggageCount: data.luggage_count, luggageNotes: data.luggage_notes, rideNotes: data.ride_notes } : null, defaults });
}

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return pickupJson({ error: "Request not found." }, 404);
  const guard = await guardPickupRequest(id, true);
  if (guard instanceof NextResponse) return guard;
  if (Number(request.headers.get("content-length")) > PROOF_MAX_BYTES + 16384) return pickupJson({ error: "Choose a photo smaller than 5 MB." }, 413);
  let form: FormData;
  try {
    const bytes = await limitedBytes(request, PROOF_MAX_BYTES + 16384);
    form = await new Response(Buffer.from(bytes), { headers: { "Content-Type": request.headers.get("content-type") ?? "" } }).formData();
  } catch (error) { return pickupJson({ error: "Please check the pickup details and choose a photo no larger than 5 MB." }, error instanceof Error && error.message === "PAYLOAD_TOO_LARGE" ? 413 : 400); }
  let input: unknown;
  try { input = JSON.parse(String(form.get("profile"))); } catch { return pickupJson({ error: "Please check the passenger and pickup details." }, 400); }
  const parsed = pickupProfileSchema.safeParse(input);
  if (!parsed.success) return pickupJson({ error: parsed.error.issues[0]?.message }, 400);
  const existing = await guard.client.from("transport_pickup_profiles").select("photo_path,version").eq("request_id", id).maybeSingle();
  if (existing.error) return pickupJson({ error: "Pickup profiles are not available yet." }, 503);
  if ((existing.data?.version ?? 0) !== parsed.data.expectedVersion) return pickupJson({ error: "This profile changed. Reload it before saving." }, 409);
  let path: string | null = parsed.data.removePhoto ? null : existing.data?.photo_path ?? null;
  let uploaded: string | null = null;
  const photo = form?.get("photo");
  if (photo instanceof File && photo.size > 0) {
    if (photo.size > PROOF_MAX_BYTES) return pickupJson({ error: "Choose a photo smaller than 5 MB." }, 413);
    const bytes = new Uint8Array(await photo.arrayBuffer());
    const kind = sniffProofKind(bytes);
    if (!kind || !(await isDecodableEvidenceImage(bytes))) return pickupJson({ error: "Choose a JPEG, PNG or WebP image." }, 400);
    uploaded = `${id}/${randomUUID()}.${proofExt(kind)}`;
    const upload = await guard.client.storage.from(PICKUP_PHOTO_BUCKET).upload(uploaded, bytes, { contentType: proofMime(kind), upsert: false });
    if (upload.error) return pickupJson({ error: "Photo upload failed. Your profile has not changed." }, 503);
    path = uploaded;
  }
  const { data, error } = await guard.client.rpc("save_transport_ride_profile", { p_actor: guard.actor, p_request: id, p_expected_version: parsed.data.expectedVersion, p_details: { ...parsed.data, photoPath: path } });
  if (error) {
    // A lost response can follow a committed save. Never delete its live photo.
    if (uploaded) {
      const current = await guard.client.from("transport_pickup_profiles").select("photo_path").eq("request_id", id).maybeSingle();
      if (!current.error && current.data?.photo_path !== uploaded) await guard.client.storage.from(PICKUP_PHOTO_BUCKET).remove([uploaded]);
    }
    return pickupJson({ error: /STALE/.test(error.message) ? "This profile changed. Reload it before saving." : "Unable to save the pickup profile. Please retry." }, /FORBIDDEN/.test(error.message) ? 403 : 409);
  }
  if (existing.data?.photo_path && existing.data.photo_path !== path) await guard.client.storage.from(PICKUP_PHOTO_BUCKET).remove([existing.data.photo_path]);
  // Withdrawal was saved transactionally. A partner outage cannot undo it.
  let revocationPending = false;
  if (!parsed.data.sharingEnabled) {
    try { revocationPending = await deliverFleetWithdrawals(guard.client, id); }
    catch { revocationPending = true; }
  }
  return pickupJson({ ok: true, version: data.version, revocationPending });
}
