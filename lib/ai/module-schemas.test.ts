import { describe, expect, it } from "vitest";
import { ModuleRequestSchema, ModuleAssistantSchema, ModuleAssistantResponseSchema, type ModuleAssistant } from "./schemas";
import { resolveModuleAnswer } from "./modules.server";
import type { ModuleContext, ModuleFact } from "./module-metadata";

const makeFact = (id: string, label: string, display: string, basis: ModuleFact["basis"], source: string): ModuleFact => ({
  id, label, display, basis, source, asOf: "2026-11-18T00:00:00.000Z"
});

const CONTEXT: ModuleContext = {
  moduleId: "front_desk",
  generatedAt: "2026-11-18T00:00:00.000Z",
  facts: [
    makeFact("front_desk.date", "Operating date", "2026-11-18", "FACT", "HAVEN hotel calendar"),
    makeFact("front_desk.arrivals_today", "Arrivals today", "1", "FACT", "HAVEN reservations"),
    makeFact("front_desk.occupancy_tonight", "Booked occupancy tonight", "25% booked", "FACT", "HAVEN occupancy model")
  ]
};

describe("ModuleRequestSchema", () => {
  it("accepts an empty object or safe topic ID", () => {
    expect(ModuleRequestSchema.safeParse({}).success).toBe(true);
    expect(ModuleRequestSchema.safeParse({ topic: "arrivals" }).success).toBe(true);
  });
  it("rejects free text, extra keys, and malformed topic IDs", () => {
    expect(ModuleRequestSchema.safeParse({ question: "What about arrivals?" }).success).toBe(false);
    expect(ModuleRequestSchema.safeParse({ topic: "arrivals", role: "owner" }).success).toBe(false);
    expect(ModuleRequestSchema.safeParse({ module: "front_desk" }).success).toBe(false);
    expect(ModuleRequestSchema.safeParse({ topic: "Alice Smith" }).success).toBe(false);
  });
});

describe("ModuleAssistantSchema", () => {
  it("accepts only fact and action selections", () => {
    const answer = { fact_ids: ["front_desk.arrivals_today"], action_ids: ["review_arrivals"], unanswered: false };
    expect(ModuleAssistantSchema.safeParse(answer).success).toBe(true);
    expect(ModuleAssistantResponseSchema.required).toEqual(["fact_ids", "action_ids", "unanswered"]);
  });
  it("rejects model-authored operational prose even when it contains no digits", () => {
    const r = ModuleAssistantSchema.safeParse({
      fact_ids: ["front_desk.arrivals_today"], action_ids: [], unanswered: false,
      summary: "One hundred arrivals are expected."
    });
    expect(r.success).toBe(false);
  });
  it("rejects missing or malformed fact selections", () => {
    expect(ModuleAssistantSchema.safeParse({ fact_ids: [], action_ids: [], unanswered: false }).success).toBe(false);
    expect(ModuleAssistantSchema.safeParse({ fact_ids: ["front desk.arrivals"], action_ids: [], unanswered: false }).success).toBe(false);
    expect(ModuleAssistantSchema.safeParse({ fact_ids: ["front_desk.date"], action_ids: ["bad action"], unanswered: false }).success).toBe(false);
  });
});

describe("resolveModuleAnswer", () => {
  it("composes factual text and actions from server-owned data", () => {
    const answer: ModuleAssistant = { fact_ids: ["front_desk.arrivals_today"], action_ids: ["review_arrivals"], unanswered: false };
    const r = resolveModuleAnswer(answer, CONTEXT);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.facts).toEqual([CONTEXT.facts[1]]);
      expect(r.data.summary).toContain("Front Desk Operations Summary");
      expect(r.data.findings).toEqual([{ fact_ids: ["front_desk.arrivals_today"], explanation: "Source: HAVEN reservations." }]);
      expect(r.data.suggested_actions[0].action).toBe("Review arrivals");
      expect(r.data.limitations).toEqual([]);
    }
  });
  it("rejects unknown fact or action IDs", () => {
    expect(resolveModuleAnswer({ fact_ids: ["front_desk.unknown"], action_ids: [], unanswered: false }, CONTEXT).ok).toBe(false);
    expect(resolveModuleAnswer({ fact_ids: ["front_desk.date"], action_ids: ["unknown"], unanswered: false }, CONTEXT).ok).toBe(false);
  });
  it("uses a fixed limitation when the supplied facts cannot answer the question", () => {
    const r = resolveModuleAnswer({ fact_ids: ["front_desk.date"], action_ids: [], unanswered: true }, CONTEXT);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.limitations).toEqual(["The supplied facts cannot answer the question. Check the relevant HAVEN records."]);
  });
});
