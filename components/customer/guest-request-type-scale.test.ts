import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guest-requests readable type scale (customer-portal.css cgr block).
// Source assertions only — jsdom cannot compute rendered sizes, so
// on-device readability remains a manual screenshot checklist.
const css = readFileSync(join(process.cwd(), "app/customer-portal.css"), "utf8");

describe("guest requests type scale", () => {
  it("lifts batch meta off the 10–11px floors to the 12px standard", () => {
    expect(css).toContain(".customer-shell .cgr-batch-heading small{font-size:12px}");
    expect(css).toContain(".customer-shell .cgr-batch-count{font-size:12px;");
  });

  it("sets item titles to the 14px row standard with 12px detail lines", () => {
    expect(css).toContain(".customer-shell .cgr-batch-items b{font-size:14px}");
    expect(css).toContain(".customer-shell .cgr-batch-items small{font-size:12px}");
  });

  it("brings the request form controls to standard sizes, page-scoped", () => {
    expect(css).toContain(".customer-shell .customer-requests-page .customer-request-options legend{font-size:12px}");
    expect(css).toContain(".customer-shell .customer-requests-page .customer-request-form label{font-size:12px}");
    expect(css).toContain(".customer-shell .customer-requests-page .request-options-list .request-option{font-size:14px !important}");
    expect(css).toContain(".customer-shell .cgr-submit-success p{font-size:13px;");
  });

  it("sets batch headings in bold sans with tabular figures like room-price", () => {
    const heading = ".customer-shell .customer-requests-page .cgr-batch-heading h2";
    expect(css).toContain(`${heading}{font-family:var(--font-sans,`);
    expect(css).toMatch(/\.customer-requests-page \.cgr-batch-heading h2\{[^}]*font-size:18px/);
    expect(css).toMatch(/\.customer-requests-page \.cgr-batch-heading h2\{[^}]*font-weight:700/);
    expect(css).toMatch(/\.customer-requests-page \.cgr-batch-heading h2\{[^}]*tabular-nums/);
    // Shared base keeps its display-serif shorthand for any other consumer.
    const base = readFileSync(join(process.cwd(), "app/guest-booking.css"), "utf8");
    expect(base).toContain(".cgr-batch-heading h2{margin:0;font:500 17px var(--font-display)");
  });

  it("leaves transportation, payments reuse, and portal-global micro-type alone", () => {
    expect(css).not.toContain(".customer-requests-page .ctr-");
    expect(css).not.toContain(".customer-requests-page .customer-status");
    expect(css).toContain(".customer-shell .customer-request-form label{font-size:11px}");
    expect(css).toContain(".customer-shell .customer-request-options legend{font-size:11px;");
  });

  it("marks each request item with the front-desk status bullet", () => {
    const page = readFileSync(
      join(process.cwd(), "app/(booking)/(customer)/account/requests/page.tsx"),
      "utf8"
    );
    expect(page).toContain("cgr-status-${");
    expect(page).toContain('item.approval_status==="rejected"?"cancelled"');
    const item = ".customer-shell .customer-requests-page .cgr-batch-items li";
    expect(css).toContain(`${item}{position:relative;padding-left:20px}`);
    expect(css).toContain(`${item}::before{content:"";position:absolute;left:2px;top:20px;`);
    expect(css).toContain("li.cgr-status-in-progress::before{background:#6fb7d6}");
    expect(css).toContain("li.cgr-status-completed::before{background:#65d3a5}");
    expect(css).toContain("li.cgr-status-cancelled::before{background:#ef797e}");
  });
});
