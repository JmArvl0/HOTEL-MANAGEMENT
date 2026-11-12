import { z } from "zod";
import { hasConflictingAmenities } from "./room-amenities";

const amenities = z.array(z.string().trim().min(1).max(100)).max(100);
const roomFields = {
  floor: z.coerce.number().int().min(0).max(200),
  type: z.string().trim().min(1).max(100),
  wing: z.string().trim().max(80).optional(),
  designation: z.string().trim().max(120).optional(),
  active: z.boolean(),
  amenityAdditions: amenities.optional(),
  amenityExclusions: amenities.optional(),
  acknowledgeAmenities: z.boolean().optional().default(false),
};
const overridesAgree = (v: { amenityAdditions?: string[]; amenityExclusions?: string[] }) =>
  !hasConflictingAmenities(v.amenityAdditions, v.amenityExclusions);
export const createPhysicalRoomSchema = z.object({
  ...roomFields,
  number: z.string().trim().min(1).max(20),
  active: z.boolean().optional().default(true),
  reason: z.string().trim().max(500).optional(),
}).refine(overridesAgree, "An amenity cannot be both added and excluded.");
export const updatePhysicalRoomSchema = z.object({
  ...roomFields,
  reason: z.string().trim().min(3).max(500),
  version: z.coerce.number().int().positive(),
}).refine(overridesAgree, "An amenity cannot be both added and excluded.");
