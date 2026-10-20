import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Staff content-fitting layout contract (staff-ops-theme.css §§20–22).
// These assertions prove the fitting RULES ship — jsdom cannot compute
// layout, so rendered fit (no clipping/overflow) remains a manual
// screenshot checklist (see session note). Never cite these tests as
// visual verification.
const css = readFileSync(join(process.cwd(), "app/staff-theme.css"), "utf8");
// .mod-kpi moved here in Stage 2 (reference-design 2026-10-19); fitting rules live with it.
const uiPrimitives = readFileSync(join(process.cwd(), "app/ui-primitives.css"), "utf8");

describe("staff sidebar fitting contract", () => {
  it("lets the sidebar role label wrap to a second line instead of clipping", () => {
    expect(css).toMatch(/\.brand-copy small\s*\{[\s\S]*?white-space:\s*normal/);
    expect(css).toMatch(/\.brand-copy small\s*\{[\s\S]*?display:\s*block/);
  });

  it("keeps the HAVEN wordmark on one line while the role wraps", () => {
    expect(css).toMatch(/\.sidebar \.brand-copy\s*\{[\s\S]*?min-width:\s*0/);
  });

  it("reserves label space beside the absolute nav badge", () => {
    expect(css).toMatch(/button:has\(\.nav-badge\) \.nav-label/);
    expect(css).toMatch(/\.nav-label\s*\{[\s\S]*?min-width:\s*0/);
  });

  it("ellipsizes profile/property copies instead of pushing layout", () => {
    expect(css).toContain("text-overflow: ellipsis");
  });
});

describe("staff headers/cards/panels fitting contract", () => {
  it("wraps header actions as a unit beside a shrinking title", () => {
    expect(css).toMatch(/\.page-header-actions\s*\{[\s\S]*?flex-wrap:\s*wrap/);
    expect(css).toMatch(/\.page-header-content\s*\{[\s\S]*?min-width:\s*0/);
  });

  it("lets extreme KPI figures wrap instead of overflowing the card", () => {
    expect(uiPrimitives).toMatch(/\.mod-kpi b[\s\S]*?overflow-wrap:\s*anywhere/);
  });

  it("keeps panel View actions off the title", () => {
    expect(css).toMatch(/\.panel-heading\s*\{[\s\S]*?flex-wrap:\s*wrap/);
  });
});

describe("staff tables/forms/modals fitting contract", () => {
  it("contains wide tables in a scroll region instead of the viewport", () => {
    expect(css).toMatch(/\.table-scroll\s*\{[\s\S]*?overflow-x:\s*auto/);
    expect(css).toMatch(/\.table-scroll\s*\{[\s\S]*?max-width:\s*100%/);
  });

  it("wraps modal footers instead of overlapping actions", () => {
    expect(css).toMatch(/\.modal-footer\s*\{[\s\S]*?flex-wrap:\s*wrap/);
  });

  it("keeps select menus and values inside the viewport", () => {
    expect(css).toContain("max-width: calc(100vw - 32px)");
    expect(css).toMatch(/\.haven-select-value\s*\{[\s\S]*?text-overflow:\s*ellipsis/);
  });

  it("constrains popovers to the viewport at narrow widths", () => {
    expect(css).toMatch(/\.notification-popover\s*\{[\s\S]*?max-width:\s*calc\(100vw - 32px\)/);
  });
});

describe("shared KPI card single-home contract", () => {
  it("defines .mod-kpi structurally once — in ui-primitives.css", () => {
    const structural = /\.mod-kpi\{|\.mod-kpi:hover\{|\.mod-kpi b\{|\.mod-kpi span\{|\.mod-kpi small\{|\.mod-kpi>i\{|mod-kpis\{/;
    expect(uiPrimitives).toMatch(structural);
    // staff-theme keeps only the move pointer comment, admin-context spacing
    // and print chrome — no card-format rules may return here.
    const remnants = (css.match(/^[^\n]*\.mod-kp[^\n{}]*\{[^{}]*\}/gm) ?? []).map((s) => s.trim());
    expect(remnants).toEqual([
      ".app-shell .admin-workspace>.mod-kpis{margin-bottom:10px}",
      ".app-shell .admin-workspace .workspace-body-inner>.mod-kpis{margin-bottom:10px}",
      "@media print{.app-shell .mod-kpi{background: #fff !important;color: #111 !important}",
    ]);
  });
});

describe("shared skeleton atom single-home contract", () => {
  it("defines .haven-skeleton structurally once — in ui-primitives.css", () => {
    expect(uiPrimitives).toMatch(/\.haven-skeleton\{[\s\S]*?animation:\s*haven-skeleton-pulse/);
    expect(uiPrimitives).toMatch(/@keyframes haven-skeleton-pulse/);
    expect(uiPrimitives).toMatch(/\.haven-skeleton-list\{[\s\S]*?padding:\s*14px/);
    // No per-panel skeleton format rules may return to the staff theme —
    // panels compose the atom; only layout containers may stay local.
    const remnants = (css.match(/^[^\n]*(tp-skeleton|sd-skeleton|pricing-skeleton|ai-brief-loading|haven-ai-kpi-skeleton)[^\n{}]*\{[^{}]*\}/gm) ?? []);
    expect(remnants).toEqual([]);
    // The room-detail skeleton keeps layout containers only — no painted i/cells.
    const painted = (css.match(/^[^\n]*room-skeleton[^{}]*\{[^{}]*background[^{}]*\}/gm) ?? []);
    expect(painted).toEqual([]);
  });
});

describe("staff fitting scope protection", () => {
  it("scopes every fitting selector under .app-shell", () => {
    const fitting = css.slice(css.indexOf("CONTENT FITTING"));
    const bad: string[] = [];
    let pending = "";
    let inComment = false;
    for (const raw of fitting.split("\n")) {
      const t = raw.trim();
      if (t.startsWith("/*")) {
        inComment = !t.includes("*/");
        continue;
      }
      if (inComment) {
        if (t.includes("*/")) inComment = false;
        continue;
      }
      if (t === "" || t === "}" || t.startsWith("@")) { pending = ""; continue; }
      if (!t.includes("{")) {
        if (t.endsWith(",")) pending += " " + t;
        continue;
      }
      const sel = (pending + " " + t.split("{")[0]).trim();
      pending = "";
      if (sel && !sel.includes(".app-shell")) bad.push(sel);
    }
    expect(bad).toEqual([]);
  });
});
