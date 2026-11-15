import parsePhoneNumber from "libphonenumber-js/min";
import { z } from "zod";

export function isCalendarDate(value: string): boolean {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) || value.startsWith("0000")) return false;
  const time = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export const calendarDate = z.string().refine(isCalendarDate, "Choose a valid calendar date.");
export const localTimePattern = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

export function numericInput(schema: z.ZodNumber) {
  return z.preprocess(value =>
    typeof value === "string" && /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value.trim()) ? Number(value) : value,
  schema);
}

export function integerInput(min: number, max: number) {
  return z.preprocess((value) =>
    typeof value === "string" && /^-?(?:0|[1-9][0-9]*)$/.test(value.trim()) ? Number(value) : value,
  z.number().int().min(min).max(max));
}

export function pesoAmount(min: number, max: number) {
  return z.preprocess((value) =>
    typeof value === "string" && /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/.test(value.trim()) ? Number(value) : value,
  z.number().finite().min(min).max(max)
    .refine(value => /^-?[0-9]+(?:\.[0-9]{1,2})?$/.test(String(value)), "Use an amount with at most two decimal places."));
}

export const bcryptPassword = (minimum: number) => z.string()
  .min(minimum, `Use at least ${minimum} characters for your password.`)
  .refine(password => new TextEncoder().encode(password).length <= 72,
    "This password is too long. Use a shorter password; some characters take more space.");

export function normalizePhone(value: string): string | null {
  const raw = value.trim();
  if (!/^(?:\+|00)?[0-9(). -]+$/.test(raw)) return null;
  const compact = raw.replace(/[ ().-]/g, "");
  const dial = compact.startsWith("00") ? "+" + compact.slice(2)
    : /^63[0-9]{10}$/.test(compact) ? "+" + compact : compact;
  const parsed = parsePhoneNumber(dial, { defaultCountry: "PH", extract: false });
  return parsed?.isValid() ? parsed.number : null;
}

export const phoneInput = z.string().trim().max(40).transform((value, ctx) => {
  const canonical = normalizePhone(value);
  if (canonical) return canonical;
  ctx.addIssue({ code: "custom", message: "Enter a valid phone number, including the country code for an international number." });
  return z.NEVER;
});
