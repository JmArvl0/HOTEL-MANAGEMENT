import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  join(process.cwd(), "components/customer/notification-history.css"),
  "utf8",
);

describe("shared notification layout contract", () => {
  it("keeps the bell preview wide enough to scan while remaining viewport safe", () => {
    expect(css).toContain("width: clamp(380px, 29vw, 420px)");
    expect(css).toContain("max-width: calc(100vw - 24px)");
  });

  it("lets long notification content wrap without crushing the row", () => {
    expect(css).toMatch(/\.cnr-copy\s*\{[\s\S]*?min-width:\s*0/);
    expect(css).toContain("overflow-wrap: anywhere");
    expect(css).toContain("-webkit-line-clamp: 2");
  });

  it("constrains history to a readable modal with internal scrolling", () => {
    expect(css).toContain("width: min(760px, calc(100vw - 48px))");
    expect(css).toContain("max-height: 85dvh");
    expect(css).toMatch(/\.nh-body\s*\{[\s\S]*?overflow-y:\s*auto/);
    expect(css).toContain("width: calc(100vw - 16px)");
  });
});
