import { supabase } from "@/lib/supabase";

/**
 * Privacy-conscious AI interaction audit. We store WHO asked WHAT FEATURE and
 * how it went — never prompt or response bodies, which may echo operational
 * data. Retention decision: audit rows are kept indefinitely (they contain no
 * guest data), prompts/responses are never stored at all.
 */

export type AiFeature =
  | "brief"
  | "ask"
  | "explain"
  | "report_summary"
  | "executive_shift_summary"
  | "guest_concierge"
  | "guest_smart_request"
  | "module_assistant";

export type AiInteractionStatus =
  | "ok"
  | "unavailable"
  | "invalid"
  | "rate_limited"
  | "error"
  | "provider_quota";

export type ModuleReservation = { status: "allowed"; interactionId: string | null } | { status: "limited" } | { status: "unavailable" };

export interface AiInteractionRecord {
  userId: string;
  role: string;
  feature: AiFeature;
  toolCalls: string[];
  status: AiInteractionStatus;
  model?: string;
  latencyMs?: number;
  moduleId?: string;
}

export type AiRateLimitStatus = "allowed" | "limited" | "unavailable";

export interface AiAuditResult {
  ok: boolean;
}

// ponytail: demo-mode rate limiting is per-process in memory; production uses
// the durable ai_interactions count. Fine for a single-instance deployment.
const demoCounts = new Map<string, number[]>();

function demoKey(userId: string, feature: AiFeature, moduleId?: string): string {
  return moduleId ? `${userId}:${feature}:${moduleId}` : `${userId}:${feature}`;
}

function supabaseKey(userId: string, feature: AiFeature, moduleId?: string) {
  const client = supabase;
  if (!client) throw new Error("supabase not configured");
  const q = client.from("ai_interactions").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("feature", feature);
  if (moduleId) q.eq("module_id", moduleId);
  return q;
}

export async function recordAiInteraction(record: AiInteractionRecord): Promise<AiAuditResult> {
  const client = supabase;
  if (!client) {
    const key = demoKey(record.userId, record.feature, record.moduleId);
    const now = Date.now();
    const counts = (demoCounts.get(key) ?? []).filter((time) => now - time < 60_000);
    counts.push(now);
    demoCounts.set(key, counts);
    return { ok: true };
  }
  const { error } = await client.from("ai_interactions").insert({
    user_id: record.userId,
    role: record.role,
    feature: record.feature,
    tool_calls_used: record.toolCalls,
    status: record.status,
    model: record.model ?? null,
    latency_ms: record.latencyMs ?? null,
    ...(record.moduleId ? { module_id: record.moduleId } : {})
  });
  if (error) {
    console.error("[ai] audit insert failed", { feature: record.feature, status: record.status, moduleId: record.moduleId });
    return { ok: false };
  }
  return { ok: true };
}

/** Reserve a module call before Gemini. The database RPC serializes competing requests. */
export async function reserveModuleAiInteraction(
  userId: string, role: string, moduleId: string, limit: number, windowMinutes: number
): Promise<ModuleReservation> {
  const client = supabase;
  if (!client) {
    const key = demoKey(userId, "module_assistant", moduleId);
    const now = Date.now();
    const counts = (demoCounts.get(key) ?? []).filter((time) => now - time < windowMinutes * 60_000);
    if (counts.length >= limit) return { status: "limited" };
    counts.push(now);
    demoCounts.set(key, counts);
    return { status: "allowed", interactionId: null };
  }
  try {
    const { data, error } = await client.rpc("reserve_ai_module_interaction", {
      p_user_id: userId, p_role: role, p_module_id: moduleId, p_limit: limit, p_window_minutes: windowMinutes
    });
    if (error || !data || typeof data !== "object") throw error ?? new Error("Invalid reservation response");
    if (data.status === "limited") return { status: "limited" };
    if (data.status !== "allowed" || typeof data.id !== "string") throw new Error("Invalid reservation response");
    return { status: "allowed", interactionId: data.id };
  } catch {
    console.error("[ai] module reservation unavailable", { moduleId });
    return { status: "unavailable" };
  }
}

export async function finishModuleAiInteraction(
  interactionId: string | null, status: AiInteractionStatus, model?: string, latencyMs?: number
): Promise<boolean> {
  if (!interactionId) return true; // Demo mode has no persistent row.
  const client = supabase;
  if (!client) return false;
  const { error } = await client.from("ai_interactions")
    .update({ status, model: model ?? null, latency_ms: latencyMs ?? null })
    .eq("id", interactionId).eq("feature", "module_assistant");
  if (error) console.error("[ai] module audit finalization failed", { status });
  return !error;
}

export async function aiRateLimitStatus(
  userId: string,
  feature: AiFeature,
  limit: number,
  windowMinutes: number,
  moduleId?: string
): Promise<AiRateLimitStatus> {
  const client = supabase;
  if (!client) {
    const key = demoKey(userId, feature, moduleId);
    const windowMs = windowMinutes * 60_000;
    return (demoCounts.get(key) ?? []).filter((time) => Date.now() - time < windowMs).length >= limit ? "limited" : "allowed";
  }
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();
  try {
    const q = supabaseKey(userId, feature, moduleId).gte("created_at", since);
    const { count, error } = await q;
    if (error) throw error;
    return (count ?? 0) >= limit ? "limited" : "allowed";
  } catch {
    console.error("[ai] rate-limit storage unavailable", { feature, moduleId });
    return "unavailable";
}
}

/** Backward-compatible boolean rate limit for existing callers. */
export async function aiRateLimited(userId: string, feature: AiFeature, limit: number, windowMinutes: number): Promise<boolean> {
  const status = await aiRateLimitStatus(userId, feature, limit, windowMinutes);
  return status === "limited";
}
