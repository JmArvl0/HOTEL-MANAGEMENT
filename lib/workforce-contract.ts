import { timingSafeEqual } from "node:crypto";
import { z } from "zod";

/** Haven's proposed inbound contract. The Workforce team must agree before activation. */
export const WORKFORCE_CONTRACT = "haven-workforce-v1";
const identifier = z.string().trim().min(1).max(120);
const timestamp = z.string().datetime({ offset: true });
export const workforceEventSchema = z.object({
  contract: z.literal(WORKFORCE_CONTRACT),
  eventId: z.string().uuid(),
  sourceSystem: identifier,
  propertyId: identifier,
  employeeId: identifier,
  version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  observedAt: timestamp,
  validUntil: timestamp,
  employmentActive: z.boolean(),
  department: z.enum(["manager", "front_desk", "housekeeping", "maintenance", "accounting"]),
  attendance: z.enum(["clocked_in", "clocked_out", "on_break", "on_leave"]),
  shift: z.object({ startsAt: timestamp, endsAt: timestamp }).strict().nullable(),
}).strict().superRefine((event, ctx) => {
  const observed = Date.parse(event.observedAt);
  const expires = Date.parse(event.validUntil);
  if (expires <= observed || expires - observed > 15 * 60_000) ctx.addIssue({ code: "custom", message: "Availability must expire within 15 minutes of observation." });
  if (event.shift && (Date.parse(event.shift.endsAt) <= Date.parse(event.shift.startsAt) || Date.parse(event.shift.endsAt) - Date.parse(event.shift.startsAt) > 24 * 60 * 60_000)) ctx.addIssue({ code: "custom", message: "Invalid shift window." });
});

export function workforceConfiguration(env: Partial<NodeJS.ProcessEnv> = process.env) {
  const key = env.HAVEN_WORKFORCE_INBOUND_TOKEN ?? "";
  return env.HAVEN_WORKFORCE_ENABLED === "true" && env.HAVEN_WORKFORCE_CONTRACT === WORKFORCE_CONTRACT && key.length >= 32 ? { key } : null;
}

export function authorizeWorkforce(request: Request, key: string) {
  const expected = Buffer.from(`Bearer ${key}`);
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

/** Bounded stream, including requests without Content-Length. Authenticate first. */
export async function readWorkforceJson(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new Error("INVALID_JSON");
  const maximum = 8192;
  if (Number(request.headers.get("content-length")) > maximum) throw new Error("PAYLOAD_TOO_LARGE");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("INVALID_JSON");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) throw new Error("PAYLOAD_TOO_LARGE");
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } finally { await reader.cancel().catch(() => {}); }
}
