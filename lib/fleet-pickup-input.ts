import { z } from "zod";
import { phoneInput } from "@/lib/input-validation";

export const ridePreferenceOptions = [
  ["QUIET_RIDE", "Quiet ride"],
  ["HELP_WITH_LUGGAGE", "Help with luggage"],
] as const;

export const fleetOptionsSchema = z.object({
  sharingEnabled: z.boolean().refine(Boolean, "Confirm that Fleet can receive the pickup details."),
  ridePreferences: z.array(z.enum(["QUIET_RIDE", "HELP_WITH_LUGGAGE", "COOL_CABIN"]))
    .max(3).refine(values => new Set(values).size === values.length, "Choose each preference once."),
});

export const fleetPickupSchema = fleetOptionsSchema.extend({
  travelerName: z.string().trim().min(2, "Enter the passenger name.").max(120),
  phone: phoneInput,
});

export function readFleetOptions(form: FormData) {
  return {
    sharingEnabled: form.has("sharingEnabled"),
    ridePreferences: form.getAll("ridePreference").map(String),
  };
}
