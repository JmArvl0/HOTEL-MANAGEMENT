import { supabase } from "@/lib/supabase";

/**
 * Privacy-conscious AI interaction audit. We store WHO asked WHAT FEATURE and
 * how it went — never prompt or response bodies, which may echo operational
 * data. Retention decision: audit rows are kept indefinitely (they contain no
 * guest data), prompts/responses are never stored at all.
 */

export type AiFeature = "brief" | "ask" | "explain" | "report_summary";

export interface AiInteractionRecord {
  userId: string;
  role: string;
  feature: AiFeature;
  toolCalls: string[];
  status: "ok" | "unavailable" | "invalid" | "rate_limited" | "error";
  model?: string;
  latencyMs?: number;
}

// ponytail: demo-mode rate limiting is per-process in memory; production uses
// the durable ai_interactions count. Fine for a single-instance deployment.
const demoCounts = new Map<string, number[]>();

export async function recordAiInteraction(record: AiInteractionRecord): Promise<void> {
  if (supabase) {
    await supabase.from("ai_interactions").insert({
      user_id: record.userId,
      role: record.role,
      feature: record.feature,
      tool_calls_used: record.toolCalls,
      status: record.status,
      model: record.model ?? null,
      latency_ms: record.latencyMs ?? null
    });
    return;
  }
  const key = `${record.userId}:${record.feature}`;
  const now = Date.now();
  const counts = (demoCounts.get(key) ?? []).filter((time) => now - time < 60_000);
  counts.push(now);
  demoCounts.set(key, counts);
}

export async function aiRateLimited(userId: string, feature: AiFeature, limit: number, windowMinutes: number): Promise<boolean> {
  if (supabase) {
    const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();
    const { count } = await supabase.from("ai_interactions").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("feature", feature).gte("created_at", since);
    return (count ?? 0) >= limit;
  }
  const key = `${userId}:${feature}`;
  const windowMs = windowMinutes * 60_000;
  return (demoCounts.get(key) ?? []).filter((time) => Date.now() - time < windowMs).length >= limit;
}
