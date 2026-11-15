import { authorizeFleet, fleetConfiguration, limitedJson } from "@/lib/fleet-contract";
import { PICKUP_PHOTO_BUCKET, pickupJson } from "@/lib/transport-pickup-route";
import { supabase } from "@/lib/supabase";
import { fleetPhotoRequestSchema } from "@/lib/fleet-wire";

export async function POST(request: Request) {
  const config = fleetConfiguration();
  if (!config || !supabase) return pickupJson({ error: "Fleet staging is unavailable." }, 503);
  if (!authorizeFleet(request, config.photoKey)) return pickupJson({ error: "Please sign in to continue." }, 401);
  const parsed = fleetPhotoRequestSchema.safeParse(await limitedJson(request, 2048).catch(() => null));
  if (!parsed.success) return pickupJson({ error: "Invalid photo request." }, 400);
  const profile = await supabase.rpc("authorize_fleet_pickup_photo", { p_external: parsed.data.external_request_id, p_photo: parsed.data.photo_reference, p_version: parsed.data.photo_version, p_assignment: parsed.data.assignment_reference });
  if (profile.error) return pickupJson({ error: "Photo unavailable." }, 503);
  if (!profile.data?.photo_path) return pickupJson({ error: "Photo unavailable." }, 404);
  const signed = await supabase.storage.from(PICKUP_PHOTO_BUCKET).createSignedUrl(profile.data.photo_path, 60);
  if (signed.error) return pickupJson({ error: "Photo unavailable." }, 503);
  if (!signed.data.signedUrl.startsWith("https://")) return pickupJson({ error: "Approved HTTPS image host required." }, 503);
  const audit = await supabase.from("audit_logs").insert({ action: "fleet_pickup_photo_link_issued", entity_type: "transportation_request", entity_id: profile.data.request_id, after_data: { photoVersion: profile.data.photo_version, assignmentReference: parsed.data.assignment_reference, expiresIn: 60 } });
  if (audit.error) return pickupJson({ error: "Photo unavailable." }, 503);
  return pickupJson({ url: signed.data.signedUrl, expires_at: new Date(Date.now() + 60000).toISOString(), photo_version: profile.data.photo_version });
}
