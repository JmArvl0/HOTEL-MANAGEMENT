import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { FakeDb, FakeSupabaseOptions } from "@/lib/fake-supabase";

const fake = vi.hoisted(() => ({
  db: {} as FakeDb,
  options: {} as FakeSupabaseOptions,
  session: null as { user: { id: string; role: string } } | null,
  context: null as unknown
}));

vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => fake.session) }));
vi.mock("@/lib/supabase", async () => {
  const { fakeSupabase } = await import("@/lib/fake-supabase");
  return {
    get supabase() {
      return fakeSupabase(fake.db, fake.options);
    }
  };
});
vi.mock("@/lib/ai/gemini-client", () => ({
  aiConfigured: () => true,
  geminiModel: () => "gemini-test",
  generateJson: vi.fn(),
  generateWithTools: vi.fn()
}));
vi.mock("@/lib/ai/module-context", () => ({
  buildFrontDeskContext: vi.fn(async () => fake.context)
}));
vi.mock("@/lib/ai/module-context-phase2", () => ({
  buildPhase2Context: vi.fn(async () => fake.context)
}));

const { POST } = await import("./route");
const { generateJson } = await import("@/lib/ai/gemini-client");
const { generateWithTools } = await import("@/lib/ai/gemini-client");
const { buildPhase2Context } = await import("@/lib/ai/module-context-phase2");

const CONTEXT = {
  moduleId: "front_desk",
  generatedAt: "2026-11-18T00:00:00.000Z",
  facts: [
    { id: "front_desk.date", label: "Operating date", display: "2026-11-18", basis: "FACT", source: "HAVEN hotel calendar", asOf: "2026-11-18T00:00:00.000Z" },
    { id: "front_desk.arrivals_today", label: "Arrivals today", display: "1", basis: "FACT", source: "HAVEN reservations", asOf: "2026-11-18T00:00:00.000Z" }
  ]
};

const VALID_ANSWER = {
  fact_ids: ["front_desk.arrivals_today"],
  action_ids: ["review_arrivals"],
  unanswered: false
};

function makeRequest(body: unknown, module = "front_desk") {
  return new NextRequest(`http://localhost/api/ai/module/${module}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" }
  });
}

beforeEach(() => {
  fake.db = {};
  fake.options = {};
  fake.session = { user: { id: "u1", role: "front_desk" } };
  fake.context = CONTEXT;
  vi.clearAllMocks();
});

describe("module route", () => {
  it("returns 200 with grounded data on success", async () => {
    vi.mocked(generateJson).mockResolvedValue({ ok: true, data: VALID_ANSWER, model: "gemini-test", latencyMs: 12 });
    const res = await POST(makeRequest({}), { params: Promise.resolve({ module: "front_desk" }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toBeDefined();
    expect(json.data.summary).toContain("Front Desk Operations Summary");
    expect(json.data.facts).toHaveLength(1);
    expect(json.data.facts[0].id).toBe("front_desk.arrivals_today");
    expect(json.disclosure).toBeDefined();
    expect(generateJson).toHaveBeenCalledTimes(1);
  });

  it("returns 200 fallback with provider_quota when Gemini rate limited", async () => {
    vi.mocked(generateJson).mockResolvedValue({ ok: false, reason: "rate_limited", message: "quota" });
    const res = await POST(makeRequest({}), { params: Promise.resolve({ module: "front_desk" }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toBeNull();
    expect(json.message).toBeDefined();
    const rows = fake.db.ai_interactions;
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("provider_quota");
  });

  it("returns 429 when app rate limit reached without extending the window", async () => {
    fake.db.ai_interactions = Array.from({ length: 10 }, (_, i) => ({
      user_id: "u1",
      feature: "module_assistant",
      module_id: "front_desk",
      created_at: new Date(Date.now() - i * 60000).toISOString()
    }));
    const res = await POST(makeRequest({}), { params: Promise.resolve({ module: "front_desk" }) });
    expect(res.status).toBe(429);
    expect(fake.db.ai_interactions).toHaveLength(10);
    expect(generateJson).not.toHaveBeenCalled();
  });

  it("reserves at most the module limit under concurrent requests", async () => {
    vi.mocked(generateJson).mockResolvedValue({ ok: true, data: VALID_ANSWER, model: "gemini-test", latencyMs: 10 });
    const responses = await Promise.all(Array.from({ length: 11 }, () => POST(makeRequest({}), { params: Promise.resolve({ module: "front_desk" }) })));
    expect(responses.filter((response) => response.status === 429)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 200)).toHaveLength(10);
    expect(fake.db.ai_interactions).toHaveLength(10);
  });

  it("returns 503 when storage unavailable and does not call Gemini", async () => {
    fake.options.failTables = ["ai_interactions"];
    const res = await POST(makeRequest({}), { params: Promise.resolve({ module: "front_desk" }) });
    expect(res.status).toBe(503);
    expect(generateJson).not.toHaveBeenCalled();
  });

  it("returns 200 fallback when resolver rejects unknown fact ID", async () => {
    const badAnswer = { ...VALID_ANSWER, fact_ids: ["front_desk.unknown"] };
    vi.mocked(generateJson).mockResolvedValue({ ok: true, data: badAnswer, model: "gemini-test", latencyMs: 10 });
    const res = await POST(makeRequest({}), { params: Promise.resolve({ module: "front_desk" }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toBeNull();
    expect(fake.db.ai_interactions[0].status).toBe("invalid");
  });

  it("returns 400 for strict body validation (no extra keys)", async () => {
    const res = await POST(makeRequest({ role: "owner" }), { params: Promise.resolve({ module: "front_desk" }) });
    expect(res.status).toBe(400);
    expect(generateJson).not.toHaveBeenCalled();
  });

  it("rejects free-text guest details before the provider call", async () => {
    const res = await POST(makeRequest({ question: "What should we do for Alice Smith?" }), { params: Promise.resolve({ module: "front_desk" }) });
    expect(res.status).toBe(400);
    expect(generateJson).not.toHaveBeenCalled();
  });

  it("returns 403 for unauthorized role", async () => {
    fake.session = { user: { id: "u1", role: "accounting" } };
    const res = await POST(makeRequest({}), { params: Promise.resolve({ module: "front_desk" }) });
    expect(res.status).toBe(403);
  });

  it("serves an authorized Phase 2 module with only its server facts", async () => {
    fake.session = { user: { id: "u1", role: "housekeeping" } };
    fake.context = { moduleId: "housekeeping", generatedAt: "2026-11-18T00:00:00.000Z", facts: [
      { id: "housekeeping.open_tasks", label: "Open Housekeeping tasks", display: "4", basis: "FACT", source: "HAVEN Housekeeping dashboard", asOf: "2026-11-18T00:00:00.000Z" }
    ] };
    vi.mocked(generateJson).mockResolvedValue({ ok: true, data: { fact_ids: ["housekeeping.open_tasks"], action_ids: ["review_tasks"], unanswered: false }, model: "gemini-test", latencyMs: 10 });
    const res = await POST(makeRequest({ topic: "tasks" }, "housekeeping"), { params: Promise.resolve({ module: "housekeeping" }) });
    expect(res.status).toBe(200);
    expect((await res.json()).data.facts[0].display).toBe("4");
    expect(buildPhase2Context).toHaveBeenCalledWith("housekeeping", "housekeeping");
  });

  it("rejects unknown focus topics before using Gemini", async () => {
    const res = await POST(makeRequest({ topic: "private_details" }), { params: Promise.resolve({ module: "front_desk" }) });
    expect(res.status).toBe(400);
    expect(generateJson).not.toHaveBeenCalled();
  });

  it("returns 404 for unknown module", async () => {
    const res = await POST(makeRequest({}), { params: Promise.resolve({ module: "not_a_module" }) });
    expect(res.status).toBe(404);
  });

  it("does not call generateWithTools (no tools)", async () => {
    vi.mocked(generateJson).mockResolvedValue({ ok: true, data: VALID_ANSWER, model: "gemini-test", latencyMs: 10 });
    await POST(makeRequest({}), { params: Promise.resolve({ module: "front_desk" }) });
    expect(generateWithTools).not.toHaveBeenCalled();
  });

  it("returns 200 fallback when audit finalization fails after Gemini", async () => {
    fake.options.failUpdates = ["ai_interactions"];
    vi.mocked(generateJson).mockResolvedValue({ ok: true, data: VALID_ANSWER, model: "gemini-test", latencyMs: 10 });
    const res = await POST(makeRequest({}), { params: Promise.resolve({ module: "front_desk" }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toBeNull();
  });
});

