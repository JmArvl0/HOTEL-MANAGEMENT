// Style contract for the Find-a-Room compact search: divider-separated label
// cells, standard rounded controls (dates carry the portal's 8px wrapper like
// .prompt-input; the Guests dropdown keeps the shared haven-select language),
// and a bottom-aligned customer-density button — all scoped under
// .customer-content so the public booking-page variant is untouched.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../../app/guest-booking.css", import.meta.url), "utf8");

describe("find-a-room compact search style contract", () => {
  it("keeps every compact refinement scoped to the customer shell", () => {
    const scoped = css.match(/\.customer-content \.booking-search\.compact[^{]*\{[^}]*\}/g) ?? [];
    expect(scoped.length).toBeGreaterThan(3);
    for (const rule of scoped) expect(rule).not.toMatch(/\.booking-page/);
  });

  it("renders dates inside the standard rounded wrapper (matching .prompt-input)", () => {
    expect(css).toMatch(/\.customer-content \.booking-search\.compact input\{[^}]*min-height:\s*44px/);
    expect(css).toMatch(/\.customer-content \.booking-search\.compact input\{[^}]*border-radius:\s*8px/);
    expect(css).toMatch(/\.customer-content \.booking-search\.compact input\{[^}]*border:\s*1px solid var\(--cp-line\)/);
    expect(css).toMatch(/\.customer-content \.booking-search\.compact input\{[^}]*background:\s*var\(--cp-panel-2\)/);
  });

  it("never flattens the Guests dropdown back to a borderless box", () => {
    // haven-select.css owns the wrapper (11px radius) + chevron; local rules
    // may set metrics only. No rule may re-declare its skin.
    const rules = css.match(/\.customer-content \.booking-search\.compact[^{]*select[^{]*\{[^}]*\}/g) ?? [];
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      expect(rule).not.toMatch(/border-radius/);
      expect(rule).not.toMatch(/border:\s*0/);
      expect(rule).not.toMatch(/background(-color)?:\s*transparent/);
      expect(rule).not.toMatch(/appearance/);
    }
  });

  it("bottom-aligns a customer-density button", () => {
    expect(css).toMatch(/\.customer-content \.booking-search\.compact \.btn\{[^}]*align-self:\s*end/);
    expect(css).toMatch(/\.customer-content \.booking-search\.compact \.btn\{[^}]*min-height:\s*44px/);
    expect(css).toMatch(/\.customer-content \.booking-search\.compact \.btn\{[^}]*white-space:\s*nowrap/);
  });

  it("keeps labels divided on desktop with a soft stack on narrow screens", () => {
    expect(css).toMatch(/\.customer-content \.booking-search\.compact label\{[^}]*border-right:/);
    expect(css).toMatch(/@media\(max-width:900px\)\{[^}]*\.customer-content \.booking-search\.compact label\{[^}]*padding:8px 10px/);
  });

  it("floats the booking notice in a fixed top-centered layer, out of the compact grid", () => {
    // The stale-search notice lives in .toast-layer (a direct <body> child), so
    // no rule may put it back in the form's grid flow.
    expect(css).toMatch(/\.toast-layer\{[^}]*position:\s*fixed/);
    expect(css).toMatch(/\.toast-layer\{[^}]*top:76px/);
    expect(css).toMatch(/\.toast-layer\{[^}]*left:50%/);
    expect(css).toMatch(/\.toast-layer\{[^}]*transform:translateX\(-50%\)/);
    expect(css).toMatch(/\.toast-layer\{[^}]*flex-direction:column/);
    expect(css).not.toMatch(/\.customer-shell \.toast-card-static|\.booking-page \.toast-card-static/);
    expect(css).not.toMatch(/\.toast-card-static\{[^}]*position:\s*static/);
  });
});
