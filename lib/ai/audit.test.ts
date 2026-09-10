// AI interaction audit: WHO used WHICH feature and how it went — never prompt or
// response bodies. The durable ai_interactions rows double as the rate-limit counter.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type FakeDb } from "@/lib/fake-supabase";

const fake = vi.hoisted(() => ({ db: {} as FakeDb }));
vi.mock("@/lib/supabase", async () => {
  const { fakeSupabase: make } = await import("@/lib/fake-supabase");
  return { supabase: make(fake.db) };
});

const { aiRateLimited, recordAiInteraction } = await import("@/lib/ai/audit");

const USER = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  for (const key of Object.keys(fake.db)) delete (fake.db as Record<string, unknown>)[key];
  fake.db.ai_interactions = [];
});

describe("recordAiInteraction", () => {
  it("stores user, role, feature, tools, status, model and latency — no prompt or response bodies", async () => {
    await recordAiInteraction({ userId: USER, role: "manager", feature: "ask", toolCalls: ["getOccupancyForecast", "getHousekeepingForecast"], status: "ok", model: "gemini-2.5-flash", latencyMs: 1834 });
    expect(fake.db.ai_interactions).toHaveLength(1);
    const row = fake.db.ai_interactions![0];
    expect(row).toMatchObject({ user_id: USER, role: "manager", feature: "ask", status: "ok", model: "gemini-2.5-flash", latency_ms: 1834 });
    // The privacy decision, asserted: nothing that could echo operational data is persisted.
    expect(Object.keys(row).some((key) => /prompt|response|question|answer|content|body/i.test(key))).toBe(false);
  });
});

describe("aiRateLimited", () => {
  it("counts only this user's recent rows for the feature against the limit", async () => {
    const now = Date.now();
    fake.db.ai_interactions = [
      { user_id: USER, feature: "ask", created_at: new Date(now - 1 * 60_000).toISOString() },
      { user_id: USER, feature: "ask", created_at: new Date(now - 2 * 60_000).toISOString() },
      { user_id: USER, feature: "ask", created_at: new Date(now - 3 * 60_000).toISOString() },
      { user_id: USER, feature: "explain", created_at: new Date(now - 1 * 60_000).toISOString() }, // other feature
      { user_id: "22222222-2222-2222-2222-222222222222", feature: "ask", created_at: new Date(now - 1 * 60_000).toISOString() }, // other user
      { user_id: USER, feature: "ask", created_at: new Date(now - 30 * 60_000).toISOString() } // outside a 10-minute window
    ];
    expect(await aiRateLimited(USER, "ask", 3, 10)).toBe(true);
    expect(await aiRateLimited(USER, "ask", 4, 10)).toBe(false);
    expect(await aiRateLimited(USER, "explain", 3, 10)).toBe(false);
  });

  it("is not limited with no history", async () => {
    expect(await aiRateLimited(USER, "brief", 3, 10)).toBe(false);
  });
});
