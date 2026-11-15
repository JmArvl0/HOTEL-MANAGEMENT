import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { env } from "@/lib/env";
import { supabase } from "@/lib/supabase";

type Operation = "login" | "register" | "password_reset";
type IncomingHeaders = Headers | Record<string, string | string[] | undefined> | undefined;

export async function authRequestBudget(operation: Operation, email: string, headers?: IncomingHeaders) {
  if (!supabase || !env.authSecret) return "unavailable";
  const read = (name: string) => headers instanceof Headers ? headers.get(name) : headers?.[name];
  const forwarded = read("x-vercel-forwarded-for") ?? (!env.isProduction ? read("x-forwarded-for") : undefined);
  const address = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
  const digest = (value: string) => createHmac("sha256", env.authSecret).update(value).digest("hex");
  const { data, error } = await supabase.rpc("consume_auth_request_budget", {
    p_operation: operation, p_subject: digest(email.trim().toLowerCase()),
    p_network: address && isIP(address) ? digest(address) : null,
  });
  return error ? "unavailable" : data === true ? "allowed" : "limited";
}
