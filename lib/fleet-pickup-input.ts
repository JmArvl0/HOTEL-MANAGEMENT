import { z } from "zod";
import { phoneInput } from "@/lib/input-validation";

export const ridePreferenceOptions = [
  ["QUIET_RIDE", "Quiet ride"],
  ["HELP_WITH_LUGGAGE", "Help with luggage"],
] as const;

export const vehicleSeatOptions = ["4", "6", "10"] as const;
export type VehicleSeats = typeof vehicleSeatOptions[number];

export const fleetOptionsSchema = z.object({
  sharingEnabled: z.boolean().refine(Boolean, "Confirm that Fleet can receive the pickup details."),
  vehicleSeats: z.enum(vehicleSeatOptions).optional(),
  ridePreferences: z.array(z.enum(["QUIET_RIDE", "HELP_WITH_LUGGAGE", "COOL_CABIN"]))
    .max(3).refine(values => new Set(values).size === values.length, "Choose each preference once."),
});

export const fleetPickupSchema = fleetOptionsSchema.extend({
  travelerName: z.string().trim().min(2, "Enter the passenger name.").max(120),
  phone: phoneInput,
});

export function readFleetOptions(form: FormData) {
  const ridePreferences = form.getAll("ridePreference").map(String);
  return {
    sharingEnabled: form.has("sharingEnabled"),
    vehicleSeats: String(form.get("vehicleSeats") ?? "") || undefined,
    ridePreferences,
  };
}

const vehiclePreferenceLine = (seats: VehicleSeats) => `Vehicle preference: ${seats}-seater`;

// Fleet receives this through the existing special_requests field on each leg.
export function fleetRideInstructions(notes?: string, seats?: VehicleSeats) {
  if (!seats) return notes;
  const preference = vehiclePreferenceLine(seats);
  return notes ? `${preference}\n${notes}` : preference;
}

export function editableFleetRideNotes(notes?: string, seats?: VehicleSeats) {
  if (!seats || !notes) return notes;
  const preference = vehiclePreferenceLine(seats);
  if (notes === preference) return "";
  return notes.startsWith(preference + "\n") ? notes.slice(preference.length + 1) : notes;
}

export function validateFleetVehiclePreference(passengers: number, ctx: z.RefinementCtx, seats?: VehicleSeats, notes?: string) {
  if (!seats) return;
  if (passengers > Number(seats)) {
    ctx.addIssue({ code: "custom", path: ["vehicleSeats"], message: "Choose a vehicle with enough seats for your group." });
  }
  if ((fleetRideInstructions(notes, seats)?.length ?? 0) > 500) {
    ctx.addIssue({ code: "custom", path: ["specialInstructions"], message: "Shorten the ride notes to leave room for the vehicle preference." });
  }
}
