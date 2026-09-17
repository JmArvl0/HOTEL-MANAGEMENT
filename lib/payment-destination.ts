import { z } from "zod";

/**
 * GCash payment-destination helpers. Pure and import-free on purpose: the
 * Owner settings panel, the customer deposit form, and the API routes all
 * share these, and client components must stay off the supabase chain
 * (see lib/format.ts). Server-only DB access lives in the routes.
 */

export const GCASH_MOBILE_RE = /^09\d{9}$/;
export const GCASH_QR_PATH_RE = /^gcash\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

/** Canonicalize a human-typed number: strip spaces/dashes, fold +63 → 0. */
export function normalizeGcashNumber(value: string) {
  const digits = value.replace(/[\s-]+/g, "");
  if (/^\+63\d{10}$/.test(digits)) return `0${digits.slice(3)}`;
  return digits;
}

/** Audit/admin-safe display: 09******8211, or a stable empty label. */
export function maskGcashNumber(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  if (!GCASH_MOBILE_RE.test(trimmed)) return "Not configured";
  return `09******${trimmed.slice(-4)}`;
}

export type PaymentDestination = {
  accountName: string | null;
  mobileNumber: string | null;
  qrStoragePath: string | null;
  enabled: boolean;
  version: number;
};

/** Complete means a guest can actually pay: every field present when enabled. */
export function isPaymentDestinationComplete(destination: Pick<PaymentDestination, "accountName" | "mobileNumber" | "qrStoragePath" | "enabled">) {
  if (!destination.enabled) return false;
  return Boolean(
    destination.accountName?.trim()
    && destination.mobileNumber?.trim()
    && GCASH_MOBILE_RE.test(destination.mobileNumber.trim())
    && destination.qrStoragePath?.trim(),
  );
}

export const paymentDestinationSchema = z.object({
  accountName: z.string().trim().max(80),
  mobileNumber: z.string().trim().max(30),
  qrStoragePath: z.string().trim().max(300).nullable(),
  enabled: z.boolean(),
  reason: z.string().trim().min(3, "Record why this payment destination is changing.").max(500),
  version: z.coerce.number().int().positive(),
}).superRefine((value, ctx) => {
  if (value.qrStoragePath && !GCASH_QR_PATH_RE.test(value.qrStoragePath)) ctx.addIssue({ code: "custom", path: ["qrStoragePath"], message: "That QR image is not a managed payment QR. Upload it again." });
  if (!value.enabled) return;
  if (!value.accountName) ctx.addIssue({ code: "custom", path: ["accountName"], message: "Account name is required while GCash deposits are enabled." });
  if (!GCASH_MOBILE_RE.test(normalizeGcashNumber(value.mobileNumber))) ctx.addIssue({ code: "custom", path: ["mobileNumber"], message: "Enter a valid GCash mobile number (09XXXXXXXXX)." });
  if (!value.qrStoragePath || !GCASH_QR_PATH_RE.test(value.qrStoragePath)) ctx.addIssue({ code: "custom", path: ["qrStoragePath"], message: "Upload the official GCash QR while deposits are enabled." });
});
