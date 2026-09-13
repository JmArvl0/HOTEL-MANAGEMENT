// Ask HAVEN tool-history discipline (Gemini 3 thought signatures, @google/genai 2.21.0).
// The old loop rebuilt { functionCall: { name, args } } from the response.functionCalls
// getter, dropping the thoughtSignature sibling the model returned on the same Part.
// The next generateContent then failed with HTTP 400. These tests pin the fixed
// behavior: preserve candidates[0].content verbatim, fail safe when unrecoverable,
// echo call ids in order, and never leak keys/signatures to the client.
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

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

const {
  buildFunctionResponseParts,
  generateJson,
  getModelContentForToolHistory,
  isToolContextMessage
} = await import("@/lib/ai/gemini-client");
const { AI_ASK_FAILURE_MESSAGE } = await import("@/lib/ai/prompts");
const { BriefSchema } = await import("@/lib/ai/schemas");
const { AI_TOOLS, aiToolDeclarations, executeAiTool } = await import("@/lib/ai/tools");

const TEST_KEY = "test-only-key";
const SIG = "opaque-test-signature-must-never-reach-client";
const originalKey = process.env.GEMINI_API_KEY;

beforeEach(() => { process.env.GEMINI_API_KEY = TEST_KEY; genai.generateContent.mockReset(); });
afterEach(() => {
  if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalKey;
});

const toolResponse = (parts: unknown[]) =>
  ({ candidates: [{ content: { role: "model", parts } }], functionCalls: undefined }) as never;

describe("getModelContentForToolHistory", () => {
  it("preserves a single function call with its thoughtSignature sibling intact", () => {
    const parts = [{ thoughtSignature: SIG, functionCall: { name: "getHousekeepingForecast", args: {}, id: "call-1" } }];
    const content = getModelContentForToolHistory(toolResponse(parts));
    expect(content).not.toBeNull();
    expect(content?.role).toBe("model");
    // Same parts array by reference — nothing reconstructed, nothing dropped.
    expect(content?.parts).toBe(parts as never);
    expect((content?.parts?.[0] as { thoughtSignature?: string }).thoughtSignature).toBe(SIG);
  });

  it("preserves multiple parallel calls in their original order with ids", () => {
    const parts = [
      { thoughtSignature: "sig-a", functionCall: { name: "getOccupancyForecast", args: {}, id: "call-a" } },
      { thoughtSignature: "sig-b", functionCall: { name: "getInventoryRiskSummary", args: {}, id: "call-b" } }
    ];
    const content = getModelContentForToolHistory(toolResponse(parts));
    expect(content?.parts).toHaveLength(2);
    expect((content?.parts?.[0] as { functionCall: { id: string } }).functionCall.id).toBe("call-a");
    expect((content?.parts?.[1] as { functionCall: { id: string } }).functionCall.id).toBe("call-b");
  });

  it("fails safe (null) when candidates/content is missing — never reconstruct", () => {
    expect(getModelContentForToolHistory({} as never)).toBeNull();
    expect(getModelContentForToolHistory({ candidates: [] } as never)).toBeNull();
    expect(getModelContentForToolHistory({ candidates: [{}] } as never)).toBeNull();
    expect(getModelContentForToolHistory(toolResponse([]))).toBeNull();
  });
});

describe("buildFunctionResponseParts", () => {
  it("echoes one response per call in order with matching ids", () => {
    const calls = [
      { name: "getOccupancyForecast", id: "call-a" },
      { name: "getInventoryRiskSummary", id: "call-b" }
    ];
    const parts = buildFunctionResponseParts(calls, [{ days: 7 }, { items: [] }]);
    expect(parts).toHaveLength(2);
    expect(parts[0].functionResponse).toMatchObject({ name: "getOccupancyForecast", id: "call-a" });
    expect(parts[1].functionResponse).toMatchObject({ name: "getInventoryRiskSummary", id: "call-b" });
  });

  it("wraps tool failures as a safe error payload, still in order", () => {
    const parts = buildFunctionResponseParts([{ name: "getMaintenanceRiskSummary" }], [{ error: "Tool unavailable." }]);
    expect(parts[0].functionResponse.response).toMatchObject({ result: { error: "Tool unavailable." } });
    expect(parts[0].functionResponse.id).toBeUndefined();
  });
});

describe("simulated Ask HAVEN passes (no live call)", () => {
  it("single tool call: model content preserved, then final text answer", () => {
    const modelParts = [{ thoughtSignature: SIG, functionCall: { name: "getHousekeepingForecast", args: {}, id: "c1" } }];
    const history: unknown[] = [{ role: "user", parts: [{ text: "How is housekeeping workload looking this week?" }] }];
    const modelContent = getModelContentForToolHistory(toolResponse(modelParts));
    expect(modelContent).not.toBeNull();
    history.push(modelContent);
    history.push({ role: "user", parts: buildFunctionResponseParts([{ name: "getHousekeepingForecast", id: "c1" }], [{ totalTasks: 7 }]) });
    // Pass 2 would send the preserved model turn back — signature intact.
    const echoed = (history[1] as { parts: { thoughtSignature?: string }[] }).parts[0].thoughtSignature;
    expect(echoed).toBe(SIG);
  });

  it("sequential tool calls: each pass preserves its own model content", () => {
    const first = getModelContentForToolHistory(toolResponse([
      { thoughtSignature: "sig-1", functionCall: { name: "getOccupancyForecast", args: {}, id: "s1" } }
    ]));
    const second = getModelContentForToolHistory(toolResponse([
      { thoughtSignature: "sig-2", functionCall: { name: "getArrivalsSummary", args: {}, id: "s2" } }
    ]));
    expect(first?.parts).toHaveLength(1);
    expect(second?.parts).toHaveLength(1);
    expect((first?.parts?.[0] as { thoughtSignature: string }).thoughtSignature).toBe("sig-1");
    expect((second?.parts?.[0] as { thoughtSignature: string }).thoughtSignature).toBe("sig-2");
  });
});

describe("provider 400 thought-signature classification", () => {
  it("detects signature-context messages without echoing them", () => {
    expect(isToolContextMessage("Function call is missing a thought_signature in functionCall parts.")).toBe(true);
    expect(isToolContextMessage("missing thoughtSignature")).toBe(true);
    expect(isToolContextMessage("quota exceeded")).toBe(false);
    expect(isToolContextMessage("")).toBe(false);
  });

  it("maps a 400 signature error to tool_context, never unavailable", async () => {
    const { ApiError } = await import("@google/genai");
    const Ctor = ApiError as unknown as new (status: number, message: string) => Error;
    genai.generateContent.mockRejectedValueOnce(new Ctor(400, "Function call is missing a thought_signature in functionCall parts."));
    const result = await generateJson({ contents: "x", schema: BriefSchema });
    expect(result).toMatchObject({ ok: false, reason: "tool_context", httpStatus: 400 });
  });

  it("keeps other 400s as unavailable", async () => {
    const { ApiError } = await import("@google/genai");
    const Ctor = ApiError as unknown as new (status: number, message: string) => Error;
    genai.generateContent.mockRejectedValueOnce(new Ctor(400, "Unsupported parameter."));
    expect(await generateJson({ contents: "x", schema: BriefSchema })).toMatchObject({ ok: false, reason: "unavailable" });
  });
});

describe("no leaks to the client", () => {
  it("user-facing ask failure message exposes no debug internals", () => {
    expect(AI_ASK_FAILURE_MESSAGE).not.toMatch(/DEBUG|thought_signature|400|ApiError|GEMINI/i);
  });

  it("failure results never carry the key or a signature", async () => {
    const { ApiError } = await import("@google/genai");
    const Ctor = ApiError as unknown as new (status: number, message: string) => Error;
    genai.generateContent.mockRejectedValueOnce(new Ctor(400, "Function call is missing a thought_signature."));
    const result = await generateJson({ contents: "x", schema: BriefSchema });
    expect(JSON.stringify(result)).not.toContain(TEST_KEY);
    expect(JSON.stringify(result)).not.toContain(SIG);
  });
});

describe("read-only tool guarantee intact", () => {
  it("registry is unchanged: fixed read-only summaries, zero params, unknown rejected", async () => {
    expect(Object.keys(AI_TOOLS).sort()).toEqual([
      "getArrivalsSummary", "getDeparturesSummary", "getGuestRequestSummary", "getHousekeepingForecast",
      "getInventoryRiskSummary", "getMaintenanceRiskSummary", "getOccupancyForecast", "getOperationalSummary", "getTransportationSummary"
    ]);
    for (const declaration of aiToolDeclarations()) {
      expect(declaration.parameters).toEqual({ type: "OBJECT", properties: {} });
    }
    await expect(executeAiTool("dropReservations")).rejects.toThrow(/Unknown AI tool/);
    await expect(executeAiTool("verify_reservation_deposit")).rejects.toThrow(/Unknown AI tool/);
    await expect(executeAiTool("front_desk_check_in")).rejects.toThrow(/Unknown AI tool/);
  });

  it("no tool declaration exposes a write-like capability", () => {
    const names = aiToolDeclarations().map((declaration) => declaration.name ?? "").join(" ");
    expect(names).not.toMatch(/verify|refund|post|delete|update|create|approve|execute|checkin|checkout/i);
    expect(JSON.stringify(aiToolDeclarations())).not.toMatch(/sql|arbitrary/i);
  });
});
