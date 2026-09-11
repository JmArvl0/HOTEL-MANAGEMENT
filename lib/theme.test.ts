import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { effectiveTheme, parseMode } from "./theme";

describe("theme mode resolution", () => {
  it("only 'system' follows the OS", () => {
    expect(effectiveTheme("system", true)).toBe("dark");
    expect(effectiveTheme("system", false)).toBe("light");
    expect(effectiveTheme("light", true)).toBe("light");
    expect(effectiveTheme("dark", false)).toBe("dark");
  });

  it("parses only the three known modes, junk falls back to 'system' (the caller maps it to light)", () => {
    expect(parseMode(null)).toBe("system");
    expect(parseMode("nope")).toBe("system");
    expect(parseMode("system")).toBe("system");
    expect(parseMode("dark")).toBe("dark");
    expect(parseMode("light")).toBe("light");
  });
});

// The default is LIGHT everywhere: only a stored 'dark' paints dark. The store
// (lib/theme.ts) and the pre-paint script (app/layout.tsx) must resolve the same
// way or a saved theme flashes the wrong palette on load.
describe("light is the default for every account", () => {
  const store = readFileSync("lib/theme.ts", "utf8");
  const layout = readFileSync("app/layout.tsx", "utf8");

  it("the store maps missing, junk, and legacy 'system' storage to light", () => {
    expect(store).toContain('return mode === "system" ? "light" : mode');
    expect(store).toContain('catch { return "light"; }');
  });

  it("the pre-paint script adds theme-light unless the stored choice is dark, without OS sniffing", () => {
    expect(layout).toContain("localStorage.getItem('haven-dashboard-theme')!=='dark'");
    expect(layout).toContain("classList.add('theme-light')");
    expect(layout).not.toContain("prefers-color-scheme");
  });
});
