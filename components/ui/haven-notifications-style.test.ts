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

  it("chips all four severities in both shells with labeled text", () => {
    for (const sev of ["critical", "attention", "success", "info"]) {
      expect(css).toContain(`.cnr-severity.sev-${sev}`);
      expect(css).toContain(`.app-shell .cnr-severity.sev-${sev}`);
    }
    // Uppercase micro-label: color never travels without text.
    expect(css).toMatch(/\.cnr-severity\s*\{[\s\S]*?text-transform:\s*uppercase/);
  });

  it("locks the root notification bell button and icon to absolute center alignment", () => {
    expect(css).toContain(".haven-notification-bell");
    expect(css).toMatch(/\.haven-notification-bell\s*\{[\s\S]*?width:\s*38px\s*!important/);
    expect(css).toMatch(/\.haven-notification-bell\s*\{[\s\S]*?height:\s*38px\s*!important/);
    expect(css).toMatch(/\.haven-notification-bell\s*\{[\s\S]*?overflow:\s*visible\s*!important/);
    expect(css).toMatch(/\.haven-notification-bell\s+\.haven-bell-icon[\s\S]*?position:\s*absolute\s*!important/);
    expect(css).toMatch(/\.haven-notification-bell\s+\.haven-bell-icon[\s\S]*?top:\s*50%\s*!important/);
    expect(css).toMatch(/\.haven-notification-bell\s+\.haven-bell-icon[\s\S]*?left:\s*50%\s*!important/);
    expect(css).toMatch(/\.haven-notification-bell\s+\.haven-bell-icon[\s\S]*?transform:\s*translate\(-50%,\s*-50%\)\s*!important/);
  });

  it("anchors the notification badge to the top-right corner with tabular numbers", () => {
    expect(css).toMatch(/\.haven-notification-badge[\s\S]*?position:\s*absolute\s*!important/);
    expect(css).toMatch(/\.haven-notification-badge[\s\S]*?top:\s*-4px\s*!important/);
    expect(css).toMatch(/\.haven-notification-badge[\s\S]*?right:\s*-4px\s*!important/);
    expect(css).toMatch(/\.haven-notification-badge[\s\S]*?font-variant-numeric:\s*tabular-nums\s*!important/);
  });
});
