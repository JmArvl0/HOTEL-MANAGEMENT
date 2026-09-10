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
 * Reservation check-in QR. Rotates on every fetch: the previous active token
 * is revoked and a fresh one issued, so only the QR the guest is currently
 * viewing is scannable. Expires at the end of the day after check-out.
 */
export async function issueReservationQrToken(reservationId: string, createdBy: string | null): Promise<{ dataUrl: string; expiresAt: string } | null> {
  if (!supabase) return null;
  const { data: reservation } = await supabase.from("reservations").select("check_out").eq("id", reservationId).maybeSingle();
  if (!reservation) return null;
  await revokeActive("reservation", reservationId);
  const token = generateQrToken();
  const expiresAt = new Date(Date.parse(`${reservation.check_out}T00:00:00Z`) + 2 * 86_400_000).toISOString();
  const { error } = await supabase.from("qr_tokens").insert({
    token_hash: hashQrToken(token), resource_type: "reservation", resource_id: reservationId,
    purpose: "check_in", created_by: createdBy, expires_at: expiresAt
  });
  if (error) return null;
  return { dataUrl: await qrDataUrl(token), expiresAt };
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
