import { describe, expect, it } from "vitest";
import { effectiveTheme, parseMode } from "./theme";

describe("theme mode resolution", () => {
  it("only 'system' follows the OS", () => {
    expect(effectiveTheme("system", true)).toBe("dark");
    expect(effectiveTheme("system", false)).toBe("light");
    expect(effectiveTheme("light", true)).toBe("light");
    expect(effectiveTheme("dark", false)).toBe("dark");
  });

  it("falls back to 'system' for missing or junk storage values", () => {
    expect(parseMode(null)).toBe("system");
    expect(parseMode("nope")).toBe("system");
    expect(parseMode("dark")).toBe("dark");
  });
});
