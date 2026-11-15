import { phoneInput } from "@/lib/input-validation";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { allowedFleetTrackingUrl, fleetTrackingSchema } from "@/lib/fleet-safety";
import { FLEET_CONTRACT } from "@/lib/fleet-wire";

/** Supplied local wire. Production activation deliberately has no code path yet. */
export function fleetConfiguration(env: Partial<NodeJS.ProcessEnv> = process.env) {
  if (env.HAVEN_FLEET_MODE !== "staging") return null;
  if (env.HAVEN_FLEET_CONTRACT !== FLEET_CONTRACT) return null;
  const callbackKey = env.HAVEN_FLEET_CALLBACK_KEY ?? "";
  const photoKey = env.HAVEN_FLEET_PHOTO_KEY ?? "";
  const outboundKey = env.HAVEN_FLEET_OUTBOUND_KEY ?? "";
  const credentials = [callbackKey, photoKey, outboundKey];
  if (credentials.some(key => key.length < 32) || new Set(credentials).size !== 3) return null;
  try {
    const endpoint = new URL(env.HAVEN_FLEET_CREATE_URL ?? "");
    const loopbackTest = env.NODE_ENV === "test" && ["localhost", "127.0.0.1"].includes(endpoint.hostname);
    if ((endpoint.protocol !== "https:" && !loopbackTest) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) return null;
    return { endpoint: endpoint.toString(), callbackKey, photoKey, outboundKey };
  } catch { return null; }
}

export function authorizeFleet(request: Request, key: string): boolean {
  const authorization = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${key}`);
  const supplied = Buffer.from(authorization);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export async function limitedBytes(request: Request | Response, maximum: number): Promise<Uint8Array> {
  if (Number(request.headers.get("content-length")) > maximum) throw new Error("PAYLOAD_TOO_LARGE");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("INVALID_JSON");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) throw new Error("PAYLOAD_TOO_LARGE");
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally { await reader.cancel().catch(() => {}); }
}

export async function limitedJson(request: Request | Response, maximum = 32768): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new Error("INVALID_JSON");
  return JSON.parse(Buffer.from(await limitedBytes(request, maximum)).toString("utf8"));
}

const reference = z.union([z.string().trim().min(1).max(200), z.number().int().nonnegative()]).transform(String);
export const fleetStatusSchema = z.object({
  event_id: z.string().trim().min(1).max(200),
  source_system: z.literal("PMS"),
  external_request_id: z.string().min(1).max(200).optional(),
  external_booking_id: z.string().min(1).max(200).optional(),
  fleet_reference: reference,
  status: z.enum(["RECEIVED", "ACCEPTED", "SCHEDULED", "ASSIGNED", "IN_TRANSIT", "COMPLETED", "CANCELLED", "REJECTED"]),
  request_version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  assignment_active: z.boolean().optional(),
  assignment_reference: z.string().trim().min(1).max(200).nullable().optional(),
  tracking: fleetTrackingSchema.nullable().optional(),
  occurred_at: z.string().datetime({ offset: true }),
  // Keep reviewed evidence, never feed these fields into the local assignment/fare RPC.
  driver: z.object({ name: z.string().max(201).optional(), phone: z.string().max(30).optional() }).nullable().optional(),
  vehicle: z.object({ plate_number: z.string().max(50).nullable().optional(), description: z.string().max(510).nullable().optional() }).nullable().optional(),
  eta: z.string().max(100).nullable().optional(),
}).passthrough().superRefine((event, ctx) => {
  if (!event.external_request_id && !event.external_booking_id) ctx.addIssue({ code: "custom", message: "Request reference required." });
  if (event.external_request_id && event.external_booking_id && event.external_request_id !== event.external_booking_id) ctx.addIssue({ code: "custom", message: "Request references conflict." });
  if (event.tracking && (!event.request_version || !event.assignment_active || !["ASSIGNED", "IN_TRANSIT"].includes(event.status) || !event.vehicle?.plate_number?.trim() || event.tracking.assignment_reference !== event.assignment_reference)) ctx.addIssue({ code: "custom", message: "Tracking requires a versioned active vehicle assignment." });
  if (event.tracking && !allowedFleetTrackingUrl(event.tracking.url, process.env.HAVEN_FLEET_TRACKING_ORIGINS ?? "")) ctx.addIssue({ code: "custom", message: "Tracking origin is not configured." });
});

export const pickupProfileSchema = z.object({
  travelerName: z.string().trim().min(2, "Enter the passenger name.").max(120),
  phone: phoneInput,
  email: z.union([z.string().trim().email().max(254), z.literal("")]).default(""),
  sharingEnabled: z.boolean(),
  removePhoto: z.boolean().default(false),
  expectedVersion: z.number().int().nonnegative(),
  ridePreferences: z.array(z.enum(["QUIET_RIDE", "HELP_WITH_LUGGAGE", "COOL_CABIN"])).max(3).refine(values => new Set(values).size === values.length, "Choose each preference once.").default([]),
  luggageCount: z.number().int().min(0).max(20).default(0),
  luggageNotes: z.string().trim().max(300).default(""),
  rideNotes: z.string().trim().max(500).default(""),
});
