import { timingSafeEqual } from "node:crypto";
import { z } from "zod";

// Server boundary. Only a test secret and a test-hosted checkout are accepted.
export function xenditConfig() {
  const secretKey = process.env.XENDIT_SECRET_KEY?.trim() ?? "";
  const webhookToken = process.env.XENDIT_WEBHOOK_TOKEN?.trim() ?? "";
  const base = new URL(process.env.APP_BASE_URL?.trim() || "http://invalid.local");
  if (!/^xnd_development_\S+$/.test(secretKey)) throw new Error("XENDIT_TEST_KEY_REQUIRED");
  if (!webhookToken) throw new Error("XENDIT_WEBHOOK_TOKEN_REQUIRED");
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash || base.pathname !== "/")
    throw new Error("XENDIT_HTTPS_ORIGIN_REQUIRED");
  return { secretKey, webhookToken, origin: base.origin };
}

export function xenditConfigured() {
  try { xenditConfig(); return true; } catch { return false; }
}

export function verifyXenditToken(actual: string | null, expected: string) {
  if (!actual || !expected) return false;
  const a = Buffer.from(actual), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const xenditChannel = z.enum(["GCASH", "PAYMAYA"]);
export type XenditChannel = z.infer<typeof xenditChannel>;
const money = z.number().positive().refine(value => Number.isSafeInteger(Math.round(value * 100)) && Math.abs(value * 100 - Math.round(value * 100)) < 1e-6);
export const xenditSessionSchema = z.object({
  payment_session_id: z.string().regex(/^ps-[a-zA-Z0-9-]+$/),
  reference_id: z.string().min(1).max(64),
  session_type: z.literal("PAY"), mode: z.literal("PAYMENT_LINK"),
  currency: z.literal("PHP"), country: z.literal("PH"), amount: money,
  status: z.enum(["ACTIVE", "COMPLETED", "EXPIRED", "CANCELED"]),
  capture_method: z.literal("AUTOMATIC").optional(),
  payment_id: z.string().regex(/^py-[a-zA-Z0-9-]+$/).nullish(),
  payment_link_url: z.string().url().nullish(),
  expires_at: z.string().datetime({ offset: true }),
  channel_code: xenditChannel.nullish(),
});
export type XenditSession = z.infer<typeof xenditSessionSchema>;

export function testCheckoutUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      !["dev.xen.to", "checkout-staging.xendit.co"].includes(url.hostname))
    throw new Error("XENDIT_TEST_CHECKOUT_REQUIRED");
  return url.href;
}

export class XenditError extends Error {
  constructor(public readonly code: string, public readonly definitive = false) { super(code); }
}

async function xenditRequest(path: string, body?: unknown) {
  const { secretKey } = xenditConfig();
  let response: Response;
  try {
    response = await fetch(`https://api.xendit.co${path}`, {
      method: body ? "POST" : "GET", cache: "no-store", redirect: "error",
      headers: { authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`, "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000),
    });
  } catch { throw new XenditError("XENDIT_REQUEST_UNCERTAIN"); }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    // Only an allowlisted code leaves this boundary; provider text can contain PII.
    const code = data?.error_code === "INVALID_PAYMENT_CHANNEL" || data?.error_code === "CHANNEL_UNAVAILABLE"
      ? "XENDIT_CHANNEL_UNAVAILABLE" : "XENDIT_REQUEST_REJECTED";
    throw new XenditError(code, response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429);
  }
  return xenditSessionSchema.parse(await response.json());
}

export async function createXenditSession(input: {
  reference: string; amount: number; reservationId: string; expiresAt: string;
  firstName: string; lastName: string; channel?: XenditChannel; paymentChoice?: "deposit" | "full";
}) {
  const { origin } = xenditConfig();
  money.parse(input.amount);
  const destination = `${origin}/booking/confirmation/${encodeURIComponent(input.reservationId)}`;
  const session = await xenditRequest("/sessions", {
    reference_id: input.reference, session_type: "PAY", mode: "PAYMENT_LINK",
    currency: "PHP", country: "PH", capture_method: "AUTOMATIC", amount: input.amount,
    allowed_payment_channels: input.channel ? [input.channel] : ["GCASH", "PAYMAYA"],
    expires_at: input.expiresAt,
    customer: { reference_id: input.reference.replace(/[^a-zA-Z0-9]/g, ""), type: "INDIVIDUAL",
      individual_detail: { given_names: input.firstName, surname: input.lastName } },
    description: input.paymentChoice === "full" ? "Haven full stay payment — SANDBOX / no real money" : "Haven reservation deposit — SANDBOX / no real money",
    success_return_url: `${destination}?checkout=returned`, cancel_return_url: `${destination}?checkout=cancelled`,
  });
  if (session.reference_id !== input.reference || Math.round(session.amount * 100) !== Math.round(input.amount * 100) ||
      session.status !== "ACTIVE" || !session.payment_link_url || Date.parse(session.expires_at) <= Date.now() || Date.parse(session.expires_at) > Date.parse(input.expiresAt) + 1000)
    throw new XenditError("XENDIT_SESSION_MISMATCH");
  testCheckoutUrl(session.payment_link_url);
  return session;
}

export async function getXenditSession(id: string) {
  if (!/^ps-[a-zA-Z0-9-]+$/.test(id)) throw new Error("INVALID_XENDIT_SESSION");
  return xenditRequest(`/sessions/${encodeURIComponent(id)}`);
}
