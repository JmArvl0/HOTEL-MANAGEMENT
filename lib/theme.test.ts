// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { effectiveTheme, parseMode, setMode } from "./theme";

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

describe("theme toggle view transition", () => {
  const flush = () => new Promise<void>((resolve) => { setTimeout(resolve, 20); });

  it("never leaks an unhandled rejection when the browser aborts the transition", async () => {
    const rejections: unknown[] = [];
    const onUnhandled = (reason: unknown) => { rejections.push(reason); };
    process.on("unhandledRejection", onUnhandled);
    // jsdom in this repo ships without localStorage/matchMedia — stub the
    // two browser surfaces setMode touches.
    const store = new Map<string, string>([["haven-dashboard-theme", "dark"]]);
    Object.defineProperty(window, "localStorage", {
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key)
      },
      configurable: true
    });
    Object.defineProperty(window, "matchMedia", {
      value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
      configurable: true
    });
    try {
      const aborted = (name: string) => Promise.reject(Object.assign(new Error(name), { name: "InvalidStateError" }));
      Object.defineProperty(document, "startViewTransition", {
        value: vi.fn((commit: () => void) => {
          commit();
          // Chrome rejects every lifecycle promise on abort (hidden tab,
          // capture failure, superseded transition) — not just `finished`.
          return { ready: aborted("ready"), updateCallbackDone: aborted("update"), finished: aborted("finished") };
        }),
        configurable: true
      });
      window.localStorage.setItem("haven-dashboard-theme", "dark");
      setMode("light");
      await flush();
      // The update callback runs regardless: the theme applies, only the
      // animation is skipped.
      expect(document.documentElement.classList.contains("theme-light")).toBe(true);
      expect(window.localStorage.getItem("haven-dashboard-theme")).toBe("light");
      expect(rejections).toEqual([]);
    } finally {
      process.removeListener("unhandledRejection", onUnhandled);
      // @ts-expect-error restoring the non-standard API absence
      delete document.startViewTransition;
    }
  });
});
