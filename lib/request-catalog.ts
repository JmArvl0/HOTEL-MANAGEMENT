import { supabase } from "@/lib/supabase";
import { portalOptions, type RequestOption } from "@/lib/request-options";

// Server-only (imports the service-role client): the guest_request_catalog
// table owns what the portal Requests module offers. Falls back to the
// built-in list when the DB is unavailable or the catalog is empty, so the
// form never renders blank.
export async function portalCatalogOptions(): Promise<RequestOption[]> {
  if (!supabase) return portalOptions();
  const { data } = await supabase.from("guest_request_catalog").select("value,label").eq("active", true).order("sort_order");
  return data?.length ? (data as { value: string; label: string }[]).map((row) => ({ value: row.value, label: row.label })) : portalOptions();
}
