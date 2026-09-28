// Style contract for the Room Board: every board-*/ops-*/rack-* class the
// panel renders must be defined in the scoped CSS, so the module can never
// silently fall back to unstyled global buttons again. .mod-kpis is owned by
// the shared summary strip (spacing guard only here); the toolbar wrapper
// stays transparent per HAVEN_UI_STANDARDS.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./fused-room-rack-panel.css", import.meta.url), "utf8");
const tsx = readFileSync(new URL("./fused-room-rack-panel.tsx", import.meta.url), "utf8");

describe("fused room rack style contract", () => {
  it("defines every board/ops class the panel renders", () => {
    const used = new Set<string>();
    for (const attr of tsx.matchAll(/className="([^"]*)"/g))
      for (const match of attr[1].matchAll(/(?:board|ops|rack)-[a-z-]+/g)) used.add(match[0]);
    expect(used.size).toBeGreaterThan(5);
    for (const cls of used) expect(css).toContain(`.${cls}`);
  });

  it("keeps the board + rail layout, underline view tabs, and sticky rail", () => {
    expect(css).toMatch(/\.board-layout\{[^}]*grid-template-columns/);
    expect(css).toMatch(/\.board-viewtabs/);
    expect(css).toMatch(/\.board-viewtabs button\.active\{[^}]*border-bottom-color/);
    expect(css).not.toMatch(/\.board-viewtabs button\.active\{[^}]*border-radius:999px/);
    expect(css).not.toMatch(/\.board-tablist/);
    expect(css).toMatch(/\.board-ops\{[^}]*position:\s*sticky/);
  });

  it("styles the range control and keeps the search section outside the table card", () => {
    expect(css).toContain(".board-range-trigger");
    expect(css).toContain(".board-range-pop");
    expect(css).toContain(".board-tabs-searchpanel");
    expect(css).not.toContain(".board-date-nav");
    expect(css).not.toContain(".board-date-field");
    expect(css).not.toContain(".board-tabs-search{");
  });

  it("tones every board state above the shared badge base, per theme", () => {
    for (const state of ["available", "occupied", "dirty", "out_of_service", "reserved"])
      expect(css).toContain(`.app-shell .room-rack .badge.board-state-${state}`);
    // Reserved reuses the adaptive muted token, so it needs no light override.
    for (const state of ["available", "occupied", "dirty", "out_of_service"])
      expect(css).toContain(`.theme-light .app-shell .room-rack .badge.board-state-${state}`);
    const board = readFileSync(new URL("./room-board.tsx", import.meta.url), "utf8");
    expect(board).toContain("colorKey={colorKey}");
    const route = readFileSync(new URL("../../app/api/rack/route.ts", import.meta.url), "utf8");
    expect(route).toContain("badge_color_key");
    expect(route).toContain("room_type_color");
  });

  it("renders the breakdown as a bold bulleted list", () => {
    expect(css).toMatch(/\.board-group-breakdown\{[^}]*font-weight:\s*700/);
    expect(css).toMatch(/\.board-group-breakdown\{[^}]*list-style:\s*disc/);
    expect(css).toContain(".breakdown-occupied::marker");
    const board = readFileSync(new URL("./room-board.tsx", import.meta.url), "utf8");
    expect(board).toContain("board-group-breakdown");
    expect(board).toContain("<ul");
  });
  it("sizes the date input like the staff dropdown trigger (module only)", () => {
    expect(css).toMatch(/\.board-date-input\{[^}]*min-height:\s*44px/);
    expect(css).toMatch(/\.board-date-input\{[^}]*border-radius:\s*12px/);
    expect(css).toMatch(/\.board-date-input\{[^}]*font-size:\s*13px/);
  });
  it("follows the shell color-scheme per theme (native calendar + icon match)", () => {
    expect(css).toMatch(/\.app-shell \.board-date-input\{[^}]*color-scheme:\s*dark/);
    expect(css).toMatch(/\.theme-light \.app-shell \.board-date-input\{[^}]*color-scheme:\s*light/);
    expect(css).not.toMatch(/color-scheme:\s*light dark/);
  });
  it("covers light theme, reduced motion, and the narrow-viewport stack", () => {
    expect(css).toContain(".theme-light");
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain("@media(max-width:1100px)");
  });

  it("keeps the toolbar wrapper transparent (no card surface)", () => {
    expect(css).not.toMatch(/\.haven-data-toolbar\{/);
  });

  it("never restyles the shared summary strip (spacing guard only)", () => {
    expect(css).not.toMatch(/\.mod-kpi\{/);
    expect(css).not.toMatch(/\.mod-kpis\{[^}]*display/);
    expect(css).not.toMatch(/\.mod-kpis\{[^}]*font/);
  });
});
