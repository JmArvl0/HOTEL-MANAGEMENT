import { createHash, randomBytes } from "node:crypto";
import QRCode from "qrcode";
import { supabase } from "@/lib/supabase";

/**
 * QR token infrastructure. QR codes carry ONLY an opaque 256-bit random token
 * — never guest data. The database stores the SHA-256 hash, so a database
 * leak cannot forge scannable codes. Resolve always re-checks the current
 * resource state and the scanner's session; the token is a lookup key, not a
 * credential. Every resolution attempt with a known token is audit-logged to
 * qr_scan_events.
 */

export type QrResourceType = "reservation" | "room";
export type QrScanResult = "authorized" | "invalid" | "expired" | "revoked" | "unauthorized" | "ineligible";

export interface QrTokenRow {
  id: string;
  token_hash: string;
  resource_type: QrResourceType;
  resource_id: string;
  purpose: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
}

export const generateQrToken = () => randomBytes(32).toString("base64url");
export const hashQrToken = (token: string) => createHash("sha256").update(token).digest("hex");

export const qrDataUrl = (token: string) => QRCode.toDataURL(token, { margin: 1, width: 320 });

export async function findQrToken(token: string): Promise<QrTokenRow | null> {
  if (!supabase) return null;
  const { data } = await supabase.from("qr_tokens").select("*").eq("token_hash", hashQrToken(token)).maybeSingle();
  return (data as QrTokenRow) ?? null;
}

export async function logQrScan(params: {
  tokenId: string;
  scannerUserId: string;
  scannerRole: string;
  resourceType: string;
  resourceId: string;
  action: string;
  result: QrScanResult;
}): Promise<void> {
  if (!supabase) return;
  await supabase.from("qr_scan_events").insert({
    qr_token_id: params.tokenId,
    scanner_user_id: params.scannerUserId,
    scanner_role: params.scannerRole,
    resource_type: params.resourceType,
    resource_id: params.resourceId,
    action: params.action,
    result: params.result
  });
}

const revokeActive = async (resourceType: QrResourceType, resourceId: string) => {
  if (!supabase) return;
  await supabase.from("qr_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("resource_type", resourceType).eq("resource_id", resourceId).is("revoked_at", null);
};

/**
 * Reservation stay-lifecycle QR. One stable identity per active reservation:
 * ensure returns the existing live token (re-rendered from the
 * reservations.qr_code mirror) instead of rotating, so the code the guest
 * sees, downloads, or prints stays scannable for the whole stay. expires_at
 * stays NULL — the reservation status owns validity and resolve re-checks it
 * server-side on every scan. Only confirmed/checked_in reservations hold a
 * QR; terminal states are refused here AND at resolve time.
 */
export const RESERVATION_QR_ACTIVE_STATUSES = ["confirmed", "checked_in"] as const;

export async function ensureReservationQrToken(reservationId: string, createdBy: string | null): Promise<{ dataUrl: string } | null> {
  if (!supabase) return null;
  const { data: reservation } = await supabase.from("reservations").select("id,status,qr_code").eq("id", reservationId).maybeSingle();
  if (!reservation || !(RESERVATION_QR_ACTIVE_STATUSES as readonly string[]).includes(reservation.status)) return null;
  if (reservation.qr_code) {
    const existing = await findQrToken(reservation.qr_code);
    if (existing && !existing.revoked_at && existing.resource_type === "reservation" && existing.resource_id === reservationId) {
      return { dataUrl: await qrDataUrl(reservation.qr_code) };
    }
  }
  // First view after the lifecycle migration, or a superseded mirror: issue
  // exactly one replacement and revoke every other active row so only one
  // reservation QR can ever be live.
  await revokeActive("reservation", reservationId);
  const token = generateQrToken();
  const { error } = await supabase.from("qr_tokens").insert({
    token_hash: hashQrToken(token), resource_type: "reservation", resource_id: reservationId,
    purpose: "check_in", created_by: createdBy, expires_at: null
  });
  if (error) return null;
  const { error: mirrorError } = await supabase.from("reservations").update({ qr_code: token }).eq("id", reservationId);
  if (mirrorError) return null;
  return { dataUrl: await qrDataUrl(token) };
}

/**
 * Staff-controlled recovery for a compromised active QR: revokes the live
 * token and issues a fresh stable successor. Terminal reservations stay
 * refused — rotation can never resurrect a completed stay.
 */
export async function rotateReservationQrToken(reservationId: string, createdBy: string | null): Promise<{ dataUrl: string } | null> {
  if (!supabase) return null;
  const { data: reservation } = await supabase.from("reservations").select("id,status").eq("id", reservationId).maybeSingle();
  if (!reservation || !(RESERVATION_QR_ACTIVE_STATUSES as readonly string[]).includes(reservation.status)) return null;
  await revokeActive("reservation", reservationId);
  await supabase.from("reservations").update({ qr_code: null }).eq("id", reservationId);
  return ensureReservationQrToken(reservationId, createdBy);
}

/**
 * Room operations QR. Persistent (no expiry) so printed placards stay valid;
 * only an explicit manager rotation revokes it. The plaintext lives in the
 * existing rooms.qr_code column so the placard page can re-render it — safe
 * because the QR grants nothing without a valid staff/guest session, which
 * resolve re-checks on every scan. The hash row in qr_tokens remains the
 * authoritative validation record.
 */
export async function ensureRoomQrToken(roomId: string, createdBy: string | null): Promise<string | null> {
  if (!supabase) return null;
  const { data: room } = await supabase.from("rooms").select("qr_code").eq("id", roomId).maybeSingle();
  if (room?.qr_code) {
    const existing = await findQrToken(room.qr_code);
    if (existing && !existing.revoked_at) return room.qr_code;
  }
  return rotateRoomQrToken(roomId, createdBy);
}

export async function rotateRoomQrToken(roomId: string, createdBy: string | null): Promise<string | null> {
  if (!supabase) return null;
  await revokeActive("room", roomId);
  const token = generateQrToken();
  const { error } = await supabase.from("qr_tokens").insert({
    token_hash: hashQrToken(token), resource_type: "room", resource_id: roomId,
    purpose: "room_operations", created_by: createdBy
  });
  if (error) return null;
  const { error: updateError } = await supabase.from("rooms").update({ qr_code: token }).eq("id", roomId);
  if (updateError) return null;
  return token;
}
