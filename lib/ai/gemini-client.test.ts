// Gemini client discipline: every call returns a discriminated result and never
// throws, the API key is read only inside the client constructor (server-side,
// never returned), and each failure mode maps to its reason. @google/genai is
// mocked — no live call, no real key.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const genai = vi.hoisted(() => ({
  generateContent: vi.fn(),
  constructedWith: [] as Array<{ apiKey?: string }>
}));
vi.mock("@google/genai", () => ({
  Type: { OBJECT: "OBJECT", STRING: "STRING", ARRAY: "ARRAY", NUMBER: "NUMBER", BOOLEAN: "BOOLEAN", INTEGER: "INTEGER" },
  GoogleGenAI: class {
    models = { generateContent: genai.generateContent };
    constructor(options: { apiKey?: string }) { genai.constructedWith.push(options); }
  },
  ApiError: class extends Error {
    status: number;
    constructor(status: number, message: string) { super(message); this.status = status; }
  }
}));

const { aiConfigured, generateJson, generateText, geminiModel } = await import("@/lib/ai/gemini-client");
const { BriefSchema } = await import("@/lib/ai/schemas");

const TEST_KEY = "test-only-key";
const originalKey = process.env.GEMINI_API_KEY;
const originalModel = process.env.GEMINI_MODEL;

const validBrief = {
  summary: "Tomorrow runs at 75% booked with a predicted final 82%.",
  priority_actions: [{ action: "Schedule an extra room attendant", rationale: "7 checkout cleans before the check-in window." }],
  warnings: [],
  prediction_explanations: []
};

beforeEach(() => { process.env.GEMINI_API_KEY = TEST_KEY; genai.generateContent.mockReset(); genai.constructedWith.length = 0; });
afterEach(() => {
  if (originalKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalKey;
  if (originalModel === undefined) delete process.env.GEMINI_MODEL; else process.env.GEMINI_MODEL = originalModel;
});

describe("configuration", () => {
  it("reports configured status by presence of the key only — never the value", () => {
    expect(aiConfigured()).toBe(true);
    expect(geminiModel()).toBe("gemini-3.6-flash"); // documented default (verified live: 2.5-flash is retired for new keys)
    process.env.GEMINI_MODEL = "gemini-9-pro-想象";
    expect(geminiModel()).toBe("gemini-9-pro-想象");
    delete process.env.GEMINI_API_KEY;
    expect(aiConfigured()).toBe(false);
  });
});

describe("generateJson", () => {
  it("validates structured output against the zod schema before returning it", async () => {
    genai.generateContent.mockResolvedValue({ text: JSON.stringify(validBrief) });
    const result = await generateJson({ contents: "brief input", schema: BriefSchema, responseSchema: {} as never });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.summary).toContain("75%");
    // First call constructs the SDK client with the server-side key…
    expect(genai.constructedWith[0]?.apiKey).toBe(TEST_KEY);
    // …and the key never travels back in a result.
    expect(JSON.stringify(result)).not.toContain(TEST_KEY);
  });

  it("reuses the constructed client and never echoes the key in any result", async () => {
    genai.generateContent.mockResolvedValue({ text: JSON.stringify(validBrief) });
    const constructedBefore = genai.constructedWith.length;
    const result = await generateJson({ contents: "x", schema: BriefSchema });
    expect(genai.constructedWith.length).toBe(constructedBefore); // cached — no second construction
    expect(JSON.stringify(result)).not.toContain(TEST_KEY);
  });

  it("fails as unconfigured without making any API call when the key is absent", async () => {
    delete process.env.GEMINI_API_KEY;
    const result = await generateJson({ contents: "x", schema: BriefSchema });
    expect(result).toMatchObject({ ok: false, reason: "unconfigured" });
    expect(genai.generateContent).not.toHaveBeenCalled();
    expect(genai.constructedWith).toHaveLength(0); // beforeEach cleared it and nothing reconstructed
  });

  it("rejects unparseable JSON as invalid", async () => {
    genai.generateContent.mockResolvedValue({ text: "not json at all" });
    const result = await generateJson({ contents: "x", schema: BriefSchema });
    expect(result).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("rejects JSON that does not match the schema as invalid", async () => {
    genai.generateContent.mockResolvedValue({ text: JSON.stringify({ summary: "", priority_actions: [] }) });
    const result = await generateJson({ contents: "x", schema: BriefSchema });
    expect(result).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("maps an HTTP 429 to rate_limited without throwing", async () => {
    const { ApiError } = await import("@google/genai");
    // The mock's ApiError takes (status, message); the real constructor type doesn't declare status.
    const ApiErrorCtor = ApiError as unknown as new (status: number, message: string) => Error;
    genai.generateContent.mockRejectedValue(new ApiErrorCtor(429, "quota exceeded"));
    const result = await generateJson({ contents: "x", schema: BriefSchema });
    expect(result).toMatchObject({ ok: false, reason: "rate_limited", httpStatus: 429 });
  });

  it("carries Google's safe error category on auth/project denials (403) and bad requests (400)", async () => {
    const { ApiError } = await import("@google/genai");
    const ApiErrorCtor = ApiError as unknown as new (status: number, message: string) => Error;
    genai.generateContent.mockRejectedValueOnce(new ApiErrorCtor(403, "Your project has been denied access. Please contact support."));
    const denied = await generateJson({ contents: "x", schema: BriefSchema });
    expect(denied).toMatchObject({ ok: false, reason: "unavailable", httpStatus: 403 });

    // Non-ApiError shape: some SDK/network errors carry the category on the JSON body.
    const bodyError = Object.assign(new Error("denied"), { code: 403, error: { status: "PERMISSION_DENIED" } });
    genai.generateContent.mockRejectedValueOnce(bodyError);
    const carried = await generateJson({ contents: "x", schema: BriefSchema });
    expect(carried).toMatchObject({ ok: false, reason: "unavailable", httpStatus: 403, errorCode: "PERMISSION_DENIED" });

    genai.generateContent.mockRejectedValueOnce(new ApiErrorCtor(400, "Unsupported parameter."));
    const bad = await generateJson({ contents: "x", schema: BriefSchema });
    expect(bad).toMatchObject({ ok: false, reason: "unavailable", httpStatus: 400 });
    // The safe category never drags the key into the result.
    expect(JSON.stringify(denied)).not.toContain(TEST_KEY);
  });

  it("maps an abort/timeout error to timeout and anything else to unavailable", async () => {
    const timeout = new Error("timed out");
    timeout.name = "TimeoutError";
    genai.generateContent.mockRejectedValueOnce(timeout);
    expect(await generateJson({ contents: "x", schema: BriefSchema })).toMatchObject({ ok: false, reason: "timeout" });

    genai.generateContent.mockRejectedValueOnce(new Error("connection reset"));
    expect(await generateJson({ contents: "x", schema: BriefSchema })).toMatchObject({ ok: false, reason: "unavailable" });
  });
});

describe("generateText", () => {
  it("refuses empty model output as invalid", async () => {
    genai.generateContent.mockResolvedValue({ text: "   " });
    expect(await generateText({ contents: "x" })).toMatchObject({ ok: false, reason: "invalid" });
  });
});
