// Server-only data boundary. Import the pure location-content module from clients.
import { supabase } from "@/lib/supabase";
import { cache } from "react";
import { EMPTY_LOCATION, type LocationContent } from "@/lib/location-content";

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

function isLocationResponse(value: unknown): value is LocationContent {
  if (!isRecord(value) || (value.hotel !== null && !isRecord(value.hotel))) return false;
  return [value.categories, value.places, value.routes].every(rows => Array.isArray(rows) && rows.every(isRecord));
}

export const getPublishedLocation = cache(async (): Promise<{ content: LocationContent; unavailable: boolean }> => {
  if (!supabase) return { content: EMPTY_LOCATION, unavailable: false };
  try {
    const { data, error } = await supabase.rpc("website_location_public");
    if (error || !isLocationResponse(data)) return { content: EMPTY_LOCATION, unavailable: true };
    return { content: data, unavailable: false };
  } catch { return { content: EMPTY_LOCATION, unavailable: true }; }
});
