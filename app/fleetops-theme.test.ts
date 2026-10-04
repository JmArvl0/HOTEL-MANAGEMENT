import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const FILE = join(process.cwd(), "app/fleetops-theme.css");

describe("fleetops token layer", () => {
  it("exists and carries the full FleetOps palette in both themes", () => {
    expect(existsSync(FILE)).toBe(true);
    const css = readFileSync(FILE, "utf8");
    const flat = css.replace(/\s+/g, "");
    for (const token of [
      "--ink:#111827",
      "--floor:",
      "--surface:",
      "--line:#d1d5db",
      "--success:#10b981",
      "--success-fg:#047857",
      "--warning:#f59e0b",
      "--danger:#ef4444",
      "--danger-fg:#b91c1c",
      "--info:#3b82f6",
      "--ai-navy:#0b132b",
      "--peach:",
    ]) {
      expect(flat).toContain(token);
    }
    expect(css).toMatch(/\.theme-light/);
  });

  it("is the last stylesheet import in app/layout.tsx so it wins the cascade", () => {
    const layout = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");
    const imports = [...layout.matchAll(/import\s+["']([^"']+\.css)["']/g)].map((m) => m[1]);
    expect(imports[imports.length - 1]).toMatch(/fleetops-theme\.css/);
  });

  it("introduces no legacy coastal/teal hexes itself", () => {
    const css = readFileSync(FILE, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).not.toMatch(/#084b55|#f8f6f1|#85cbd0|#141815|#17363f|#c9783c/i);
  });

  it("defines one rooted primitive per control family on tokens", () => {
    const css = readFileSync(FILE, "utf8");
    for (const sel of [
      ".saas-btn",
      ".saas-btn-secondary",
      ".saas-btn-ghost",
      ".saas-btn-danger",
      ".saas-input",
      ".saas-badge",
      '.saas-badge[data-tone="success"]',
      '.saas-badge[data-tone="danger"]',
      ".saas-table",
      ".saas-modal",
      ".saas-toast",
      ".saas-ai-pill",
      ".saas-peach-banner",
    ]) {
      expect(css).toContain(sel);
    }
    // Primitives reference tokens, never literals (outside the token blocks).
    const body = css.split(".saas-page")[1] ?? "";
    expect(body).not.toMatch(/#[0-9a-fA-F]{3,6}/);
  });
});
