import { describe, expect, it } from "vitest";
import { normalizeAiAnswer } from "./answer-format";

describe("normalizeAiAnswer", () => {
  it("normalizes an escaped heading at line start", () => {
    expect(normalizeAiAnswer("\\### Supply Risk Summary")).toBe("### Supply Risk Summary");
    expect(normalizeAiAnswer("Intro\n  \\## Tomorrow")).toBe("Intro\n  ## Tomorrow");
  });

  it("normalizes escaped unordered list markers at line start", () => {
    expect(normalizeAiAnswer("\\- **FACT:** 1 of 4 items")).toBe("- **FACT:** 1 of 4 items");
    expect(normalizeAiAnswer("List:\n  \\* nested")).toBe("List:\n  * nested");
  });

  it("normalizes escaped ordered list markers", () => {
    expect(normalizeAiAnswer("1\\. Restock shampoo.")).toBe("1. Restock shampoo.");
    expect(normalizeAiAnswer("Step 1\\. Do this")).toBe("Step 1. Do this");
  });

  it("normalizes paired escaped emphasis", () => {
    expect(normalizeAiAnswer("\\*\\*FACT:\\*\\* 1 of 4")).toBe("**FACT:** 1 of 4");
    expect(normalizeAiAnswer("\\*\\*Shampoo 40ml\\*\\*")).toBe("**Shampoo 40ml**");
  });

  it("normalizes known whitespace entities only", () => {
    expect(normalizeAiAnswer("Stock:&#x20;42")).toBe("Stock: 42");
    expect(normalizeAiAnswer("a&#32;b&nbsp;c")).toBe("a b c");
  });

  it("preserves ordinary legitimate backslashes", () => {
    expect(normalizeAiAnswer("Save to C:\\reports\\daily")).toBe("Save to C:\\reports\\daily");
    expect(normalizeAiAnswer("ratio a\\b stays")).toBe("ratio a\\b stays");
    // Unpaired escape mid-text is not Markdown syntax — left alone.
    expect(normalizeAiAnswer("a \\* b")).toBe("a \\* b");
    expect(normalizeAiAnswer("hash \\#tag stays")).toBe("hash \\#tag stays");
  });

  it("leaves already-clean Markdown untouched", () => {
    const clean = "### Title\n\n- **FACT:** ok\n\n1. Do it";
    expect(normalizeAiAnswer(clean)).toBe(clean);
  });

  it("collapses excessive blank lines and trims", () => {
    expect(normalizeAiAnswer("\n\n### T\n\n\n\nBody\n\n")).toBe("### T\n\nBody");
  });

  it("handles the reported supply-risk shape end to end", () => {
    const raw = "\\### 1. Supply Risk Summary\n\\- \\*\\*FACT:\\*\\* 1 of 4&#x20;items\n1\\. Restock";
    expect(normalizeAiAnswer(raw)).toBe("### 1. Supply Risk Summary\n- **FACT:** 1 of 4 items\n1. Restock");
  });
});
