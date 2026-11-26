import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb, FakeSupabaseOptions } from "@/lib/fake-supabase";

const fake = vi.hoisted(() => ({
  db: {} as FakeDb,
  options: {} as FakeSupabaseOptions,
  session: null as { user: { id: string; role: string } } | null
}));

vi.mock("@/lib/supabase", async () => {
  const { fakeSupabase } = await import("@/lib/fake-supabase");
  return {
    get supabase() {
      return fakeSupabase(fake.db, fake.options);
    }
  };
});

vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => fake.session) }));

const {
  recordAiInteraction,
  aiRateLimitStatus,
  aiRateLimited
} = await import("./audit");

describe("audit: module_assistant feature", () => {
  beforeEach(() => {
    fake.db = {};
    fake.options = {};
    fake.session = { user: { id: "u1", role: "front_desk" } };
  });

  it("records module_assistant with module_id and provider_quota status", async () => {
    const r = await recordAiInteraction({
      userId: "u1",
      role: "front_desk",
      feature: "module_assistant",
      toolCalls: [],
      status: "provider_quota",
      moduleId: "front_desk"
    });
    expect(r.ok).toBe(true);
    expect(fake.db.ai_interactions).toHaveLength(1);
    const row = fake.db.ai_interactions[0];
    expect(row.feature).toBe("module_assistant");
    expect(row.module_id).toBe("front_desk");
    expect(row.status).toBe("provider_quota");
  });

  it("keeps ordinary Ask audit inserts compatible with the existing schema", async () => {
    const result = await recordAiInteraction({ userId: "u1", role: "front_desk", feature: "ask", toolCalls: [], status: "ok" });
    expect(result.ok).toBe(true);
    expect(fake.db.ai_interactions[0]).not.toHaveProperty("module_id");
  });

  it("records module_assistant with rate_limited status", async () => {
    await recordAiInteraction({
      userId: "u1",
      role: "front_desk",
      feature: "module_assistant",
      toolCalls: [],
      status: "rate_limited",
      moduleId: "front_desk"
    });
    expect(fake.db.ai_interactions[0].status).toBe("rate_limited");
  });

  it("aiRateLimitStatus counts per module_id", async () => {
    fake.db.ai_interactions = [
      { user_id: "u1", feature: "module_assistant", module_id: "front_desk", created_at: new Date().toISOString() },
      { user_id: "u1", feature: "module_assistant", module_id: "front_desk", created_at: new Date().toISOString() }
    ];
    expect(await aiRateLimitStatus("u1", "module_assistant", 1, 10, "front_desk")).toBe("limited");
    expect(await aiRateLimitStatus("u1", "module_assistant", 1, 10, "housekeeping")).toBe("allowed");
  });

  it("aiRateLimitStatus returns unavailable when storage fails", async () => {
    fake.options.failTables = ["ai_interactions"];
    expect(await aiRateLimitStatus("u1", "module_assistant", 1, 10, "front_desk")).toBe("unavailable");
  });

  it("recordAiInteraction returns ok:false when insert fails", async () => {
    fake.options.failInserts = ["ai_interactions"];
    const r = await recordAiInteraction({
      userId: "u1",
      role: "front_desk",
      feature: "module_assistant",
      toolCalls: [],
      status: "ok",
      moduleId: "front_desk"
    });
    expect(r.ok).toBe(false);
  });

  it("aiRateLimited returns true only for limited", async () => {
    fake.db.ai_interactions = [{ user_id: "u1", feature: "module_assistant", module_id: "front_desk", created_at: new Date().toISOString() }];
    expect(await aiRateLimited("u1", "module_assistant", 1, 10)).toBe(true);
    expect(await aiRateLimited("u1", "module_assistant", 2, 10)).toBe(false);
    fake.options.failTables = ["ai_interactions"];
    expect(await aiRateLimited("u1", "module_assistant", 1, 10)).toBe(false);
  });
});
