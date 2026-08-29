import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Shared service-role client. Server-only — importing this from a client
 * component would ship the service-role key to the browser.
 *
 * `null` when running in demo mode.
 */
export const supabase = env.supabase
  ? createClient(env.supabase.url, env.supabase.serviceRoleKey, { auth: { persistSession: false } })
  : null;
