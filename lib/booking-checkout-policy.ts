import "server-only";
import { supabase } from "@/lib/supabase";
import { xenditConfigured } from "@/lib/xendit";

export async function bookingCheckoutEnabled() {
  if (!supabase || !xenditConfigured()) return false;
  const [method, policy] = await Promise.all([
    supabase.from("hotel_operational_policies").select("deposit_method").eq("key", "default").maybeSingle(),
    supabase.from("reservation_deposit_policies").select("enabled,calculation_type,percentage_basis_points,fixed_amount")
      .eq("key", "online_reservation").lte("active_from", new Date().toISOString()).maybeSingle(),
  ]);
  if (method.error || policy.error || method.data?.deposit_method !== "xendit" || !policy.data?.enabled) return false;
  return Number(policy.data.calculation_type === "percentage" ? policy.data.percentage_basis_points : policy.data.fixed_amount) > 0;
}
