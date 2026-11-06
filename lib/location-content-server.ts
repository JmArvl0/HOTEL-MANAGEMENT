// Server-only data boundary. Import the pure location-content module from clients.
import { supabase } from "@/lib/supabase";
import { cache } from "react";
import { EMPTY_LOCATION, type LocationContent } from "@/lib/location-content";

export const getPublishedLocation = cache(async (): Promise<{ content: LocationContent; unavailable: boolean }> => {
  if (!supabase) return { content: EMPTY_LOCATION, unavailable: false };
  try {
    const { data, error } = await supabase.rpc("website_location_public");
    if (error || !data) return { content: EMPTY_LOCATION, unavailable: true };
    return { content: data as LocationContent, unavailable: false };
  } catch { return { content: EMPTY_LOCATION, unavailable: true }; }
});
