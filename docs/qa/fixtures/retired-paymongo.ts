// Historical PayMongo parser for audit reproduction.
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * PayMongo payment gateway boundary. Server-only: secrets never leave the
 * server, the browser only receives a checkout URL. The manual GCash proof
 * flow is untouched — this is an additional path, not a replacement.
 *
 * Wire formats verified against PayMongo's documentation (2026-09):
 * - Checkout Sessions API `POST /v1/checkout_sessions` (amounts in centavos,
 *   Basic auth with the base64-encoded secret key).
 * - Webhook signature header `Paymongo-Signature: t=<unix>,te=<test-hex>,li=<live-hex>`
 *   where each hex value is HMAC-SHA256(secret, "<t>.<raw body>"). `te` is used
 *   for test-mode events and `li` for live-mode events.
 */

export const GATEWAY_METHOD = "gateway_paymongo";


/** Signature timestamps older than this (seconds) are treated as replays. */
const DEFAULT_SIGNATURE_TOLERANCE_SECONDS = 300;

/**
 * Server secrets, resolved once per call. Accepts the canonical PAYMONGO_*
 * names with the historical PAYMENT_GATEWAY_* names as aliases so existing
 * deployments keep working. Never log or return these to the client.
 */
export function resolveGatewaySecrets(): { secretKey: string; webhookSecret: string } {
  const secretKey =
    process.env.PAYMONGO_SECRET_KEY?.trim() || process.env.PAYMENT_GATEWAY_SECRET_KEY?.trim() || "";
  const webhookSecret =
    process.env.PAYMONGO_WEBHOOK_SECRET?.trim() || process.env.PAYMENT_GATEWAY_WEBHOOK_SECRET?.trim() || "";
  return { secretKey, webhookSecret };
}

/** The gateway path is available only when both server secrets are configured. */
export function gatewayConfigured(): boolean {
  const { secretKey, webhookSecret } = resolveGatewaySecrets();
  return Boolean(secretKey && webhookSecret);
}

/** PHP → centavos with a strict guard: whole centavos only, never negative. */
export function toCentavos(amount: number | string): number {
  const pesos =
    typeof amount === "number" ? amount : Number(String(amount).replace(/[,\s₱]/g, ""));
  if (!Number.isFinite(pesos) || pesos < 0) throw new Error("INVALID_AMOUNT");
  const centavos = Math.round(pesos * 100);
  if (Math.abs(pesos * 100 - centavos) > 1e-6) throw new Error("INVALID_AMOUNT");
  return centavos;
}

export interface PaymongoSignatureParts {
  timestamp: string;
  test?: string;
  live?: string;
}

/**
 * Parses `t=<unix>,te=<hex>,li=<hex>` (values may be empty). Returns null for
 * anything that is not that shape — most importantly for a bare hex digest,
 * which the caller may treat as the legacy pre-PayMongo format.
 */
export function parsePaymongoSignatureHeader(header: string): PaymongoSignatureParts | null {
  if (!header || !header.includes("=")) return null;
  let timestamp: string | undefined;
  let test: string | undefined;
  let live: string | undefined;
  for (const part of header.split(",")) {
    const idx = part.indexOf("=");
    if (idx <= 0) return null;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key === "t" && timestamp === undefined) timestamp = value;
    else if (key === "te" && test === undefined) test = value;
    else if (key === "li" && live === undefined) live = value;
    else return null;
  }
  if (!timestamp || (test === undefined && live === undefined)) return null;
  return { timestamp, test, live };
}

function hmacHex(secret: string, message: string): string {
  return createHmac("sha256", secret).update(message).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * Verifies the webhook signature over the RAW request body.
 *
 * Accepts the documented PayMongo header format (HMAC over "<t>.<body>",
 * selecting te/li by the secret's sk_test_/sk_live_ prefix; unprefixed secrets
 * accept either). Rejects timestamps outside the tolerance window so captured
 * requests cannot be replayed later. A bare hex digest (no t/te/li parts) is
 * still accepted as the legacy plain-body HMAC for older configurations.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  secret: string,
  options: { toleranceSeconds?: number; now?: number } = {}
): boolean {
  if (!rawBody || !signature || !secret) return false;
  const parts = parsePaymongoSignatureHeader(signature.trim());
  if (!parts) {
    // Legacy format: plain HMAC over the body (no timestamp component).
    return safeEqualHex(hmacHex(secret, rawBody), signature.trim());
  }
  const seconds = Number(parts.timestamp);
  if (!Number.isFinite(seconds)) return false;
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const tolerance = options.toleranceSeconds ?? DEFAULT_SIGNATURE_TOLERANCE_SECONDS;
  if (Math.abs(now - seconds) > tolerance) return false;

  const expected = hmacHex(secret, `${parts.timestamp}.${rawBody}`);
  const candidates = [
    secret.startsWith("sk_test_") ? parts.test : undefined,
    secret.startsWith("sk_live_") ? parts.live : undefined,
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
  const modeAgnostic = candidates.length === 0 ? [parts.test, parts.live] : candidates;
  return modeAgnostic.some((candidate) => candidate !== undefined && safeEqualHex(expected, candidate));
}

export function gatewayEventRef(event: unknown): { sessionId: string; eventId: string } | null {
  if (!event || typeof event !== "object") return null;
  const e = event as {
    data?: {
      id?: string;
      attributes?: {
        data?: {
          id?: string;
          attributes?: { checkout_session?: { id?: string }; checkout_session_id?: string };
        };
        reference_number?: string;
      };
    };
  };
  const resource = e.data?.attributes?.data;
  const sessionId =
    resource?.attributes?.checkout_session?.id ??
    resource?.attributes?.checkout_session_id ??
    resource?.id ??
    e.data?.attributes?.reference_number;
  const eventId = e.data?.id;
  if (typeof sessionId !== "string" || !sessionId) return null;
  if (typeof eventId !== "string" || !eventId) return null;
  return { sessionId, eventId };
}

/**
 * Pulls the paid amount (centavos) out of an event when the payload carries
 * one — either a direct `amount` attribute or the line-item sum. Returns null
 * when the event shape carries no verifiable amount; the confirming RPC still
 * enforces the database-side amount equality.
 */
export function gatewayEventAmountCentavos(event: unknown): number | null {
  if (!event || typeof event !== "object") return null;
  const resource = (
    event as {
      data?: { attributes?: { data?: { attributes?: { amount?: unknown; line_items?: unknown } } } };
    }
  ).data?.attributes?.data?.attributes;
  if (!resource || typeof resource !== "object") return null;
  const amount = (resource as { amount?: unknown }).amount;
  if (typeof amount === "number" && Number.isInteger(amount) && amount > 0) return amount;
  const lineItems = (resource as { line_items?: unknown }).line_items;
  if (Array.isArray(lineItems)) {
    let total = 0;
    let any = false;
    for (const item of lineItems) {
      const line = item as { amount?: unknown; quantity?: unknown };
      if (typeof line?.amount === "number" && Number.isInteger(line.amount)) {
        const quantity = typeof line.quantity === "number" ? line.quantity : 1;
        total += line.amount * quantity;
        any = true;
      }
    }
    if (any && total > 0) return total;
  }
  return null;
}
