import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  session: { user: { id: "u1", role: "front_desk", disabled: false } } as { user: { id: string; role: string; disabled: boolean } } | null,
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => state.session) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/ai/gemini-client", () => ({
  aiConfigured: () => true,
  generateJson: vi.fn(async () => ({ ok: true, model: "gemini-test", latencyMs: 10, data: { answer: "Review the reservation and room readiness in HAVEN.", fact_ids: [] } })),
  geminiModel: () => "gemini-test",
}));
vi.mock("@/lib/ai/audit", () => ({
  aiRateLimitStatus: vi.fn(async () => "allowed"),
  reserveModuleAiInteraction: vi.fn(async () => ({ status: "allowed", interactionId: "audit-1" })),
  finishModuleAiInteraction: vi.fn(async () => true),
  recordAiInteraction: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/ai/modules.server", () => ({ getModuleAssistant: () => null }));

const { GET, POST } = await import("./route");
const { generateJson } = await import("@/lib/ai/gemini-client");
const { aiRateLimitStatus } = await import("@/lib/ai/audit");

const get = (module: string) => new NextRequest(`http://localhost/api/ai/placement?module=${encodeURIComponent(module)}`);
const post = (module: string, question: string) => new NextRequest("http://localhost/api/ai/placement", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ module, question }),
});

beforeEach(() => {
  state.session = { user: { id: "u1", role: "front_desk", disabled: false } };
  vi.clearAllMocks();
});

describe("live AI placement route", () => {
  it("reads a role-scoped module purpose without a Gemini call", async () => {
    const response = await GET(get("Bookings"));
    expect(response.status).toBe(200);
    expect((await response.json()).data.purpose).toBe("Booking process guide");
    expect(generateJson).not.toHaveBeenCalled();
  });

  it("denies another role's module before any Gemini call", async () => {
    state.session = { user: { id: "u1", role: "housekeeping", disabled: false } };
    expect((await GET(get("Deposit Verification"))).status).toBe(403);
    expect((await POST(post("Deposit Verification", "What is pending?"))).status).toBe(403);
    expect(generateJson).not.toHaveBeenCalled();
  });

  it("rejects personal code requests before a Gemini call", async () => {
    const response = await POST(post("Bookings", "Write Python code for my class"));
    expect(response.status).toBe(422);
    expect(generateJson).not.toHaveBeenCalled();
  });

  it("fails closed if audited usage storage is unavailable", async () => {
    vi.mocked(aiRateLimitStatus).mockResolvedValueOnce("unavailable");
    const response = await POST(post("Bookings", "How should I prepare this arrival?"));
    expect(response.status).toBe(503);
    expect(generateJson).not.toHaveBeenCalled();
  });

  it("rejects an ungrounded number in a Gemini answer", async () => {
    vi.mocked(generateJson).mockResolvedValueOnce({ ok: true, model: "gemini-test", latencyMs: 10, data: { answer: "There are 99 ready rooms.", fact_ids: [] } });
    const response = await POST(post("Bookings", "How should I prepare this arrival?"));
    expect(response.status).toBe(503);
  });

  it("answers an authorized hotel question only after explicit Ask", async () => {
    const response = await POST(post("Bookings", "How should I prepare this arrival?"));
    expect(response.status).toBe(200);
    expect((await response.json()).data.answer).toContain("reservation");
    expect(generateJson).toHaveBeenCalledTimes(1);
    const prompt = JSON.parse(String(vi.mocked(generateJson).mock.calls[0][0].contents));
    expect(prompt.allowed_modules).toContain("Lost & Found");
    expect(prompt.allowed_modules).not.toContain("Admin Governance");
  });
});
