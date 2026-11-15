import type { SupabaseClient } from "@supabase/supabase-js";

export async function findAssetRoom(client: SupabaseClient, identifier: string) {
  const exact = await client.from("rooms").select("id").eq("id", identifier).maybeSingle();
  if (exact.data || exact.error) return exact;
  return client.from("rooms").select("id").eq("number", identifier).maybeSingle();
}
