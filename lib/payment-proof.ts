/**
 * Payment-proof image validation shared by the staged-upload route and the
 * confirm route. The browser MIME type and filename extension are NEVER
 * trusted — the image type is derived from magic bytes in the actual content,
 * matching the private `payment-proofs` bucket's allowlist.
 */
export const PROOF_MAX_BYTES = 5 * 1024 * 1024;
export const PROOF_BUCKET = "payment-proofs";

export type ProofKind = "jpeg" | "png" | "webp";

const EXT: Record<ProofKind, string> = { jpeg: "jpg", png: "png", webp: "webp" };
const MIME: Record<ProofKind, string> = {
  jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
};

/** Sniff the image type from the leading bytes. Returns null when not a recognized image. */
export function sniffProofKind(bytes: Uint8Array): ProofKind | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "png";
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "webp";
  return null;
}

export function proofExt(kind: ProofKind) { return EXT[kind]; }
export function proofMime(kind: ProofKind) { return MIME[kind]; }

/** Path shape every staged proof takes: pending/<hold-token>/<uuid>.<ext> */
export function stagedProofPathPattern(token: string) {
  return new RegExp(`^pending/${token}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(jpg|png|webp)$`);
}

/** Display-only original filename: trimmed, basename only, hard length cap. */
export function sanitizeProofName(name: string) {
  return name.split(/[\\/]/).pop()?.slice(0, 120).trim() ?? "";
}
