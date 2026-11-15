import { z } from "zod";

export const RIDE_PREFERENCES = [
  { value: "QUIET_RIDE", label: "Quiet ride", hint: "Minimal conversation during the ride." },
  { value: "HELP_WITH_LUGGAGE", label: "Help with luggage", hint: "Assistance loading and unloading bags." },
  { value: "COOL_CABIN", label: "Cool cabin", hint: "Air-conditioning preferred." },
] as const;

export function allowedFleetTrackingUrl(value: string, origins: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const allowed = origins.split(",").map(item => item.trim()).filter(Boolean);
    return allowed.includes(url.origin) ? url.href : null;
  } catch { return null; }
}

export const fleetTrackingSchema = z.object({
  url: z.string().url().max(2048),
  expires_at: z.string().datetime({ offset: true }),
  assignment_reference: z.string().trim().min(1).max(200),
});
const snapshotSchema = z.object({
  assignment_reference: z.string().nullable().optional(),
  driver: z.object({ name: z.string().max(201).optional() }).nullable().optional(),
  vehicle: z.object({ plate_number: z.string().trim().min(1).max(50).nullable().optional(), description: z.string().max(510).nullable().optional() }).nullable().optional(),
  tracking: fleetTrackingSchema.nullable().optional(),
});
export type FleetSafetyRow = { id: string; leg: string; partner_status: string | null; partner_version: number; assignment_active: boolean; needs_review: boolean; guest_safety: unknown };
export type FleetRideSafety = { id: string; leg: string; driverName: string | null; plateNumber: string | null; vehicleDescription: string | null; trackingUrl: string | null; trackingExpiresAt: string | null };

/** Client output excludes raw inbox evidence and all passenger contact/photo data. */
export function guestFleetSafety(rows: FleetSafetyRow[], origins: string, now = Date.now()): FleetRideSafety[] {
  return rows.flatMap(row => {
    if (!row.assignment_active || row.needs_review || row.partner_version < 1 || !["ASSIGNED", "IN_TRANSIT"].includes(row.partner_status ?? "")) return [];
    const parsed = snapshotSchema.safeParse(row.guest_safety);
    if (!parsed.success) return [];
    const data = parsed.data;
    const tracking = data.tracking;
    const url = tracking && data.assignment_reference && tracking.assignment_reference === data.assignment_reference && data.vehicle?.plate_number && new Date(tracking.expires_at).getTime() > now
      ? allowedFleetTrackingUrl(tracking.url, origins) : null;
    return [{ id: row.id, leg: row.leg, driverName: data.driver?.name ?? null, plateNumber: data.vehicle?.plate_number ?? null, vehicleDescription: data.vehicle?.description ?? null, trackingUrl: url, trackingExpiresAt: url ? tracking!.expires_at : null }];
  });
}
