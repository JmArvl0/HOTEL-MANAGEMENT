// Style contract for the booking-flow Back control: it reads as a real
// secondary button — .btn's metric family (40px / 6px radius / 8px gap) and
// the .btn-soft palette — instead of the bare text link it used to be. The
// skin must be self-contained here: search.css owns the /booking/search hero
// pill and is only loaded on that route.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../../app/guest-booking.css", import.meta.url), "utf8");

const block = (pattern: RegExp) => css.match(pattern)?.[0] ?? "";

describe("booking-flow back button style contract", () => {
  const base = block(/\.booking-back\.booking-back--flow\{[^}]*\}/);

  it("gives the control a button body: box, surface, border and shape", () => {
    expect(base).not.toBe("");
    expect(base).toMatch(/display:\s*inline-flex/);
    expect(base).toMatch(/align-items:\s*center/);
    expect(base).toMatch(/gap:\s*8px/);
    expect(base).toMatch(/min-height:\s*40px/);
    expect(base).toMatch(/padding:\s*0 16px/);
    expect(base).toMatch(/border:\s*1px solid var\(/);
    expect(base).toMatch(/border-radius:\s*6px/);
    expect(base).toMatch(/background:\s*var\(/);
    expect(base).toMatch(/color:\s*var\(/);
  });

  it("never regresses to the borderless, transparent text link", () => {
    expect(base).not.toMatch(/border:\s*0/);
    expect(base).not.toMatch(/background:\s*transparent/);
    expect(css).not.toMatch(/\.booking-back\.booking-back--flow:hover\{[^}]*text-decoration:\s*underline/);
  });

  it("gives hover, press and focus real button feedback", () => {
    expect(block(/\.booking-back\.booking-back--flow:hover\{[^}]*\}/)).toMatch(/border-color:\s*var\(--cp-green/);
    expect(block(/\.booking-back\.booking-back--flow:active[^{]*\{[^}]*\}/)).toMatch(/transform:\s*translateY\(1px\)/);
    expect(block(/\.booking-back\.booking-back--flow:focus-visible\{[^}]*\}/)).toMatch(/outline:\s*2px solid/);
  });

  it("keeps the search-hero pill skin off the flow button", () => {
    expect(base).not.toMatch(/border-radius:\s*99px/);
    expect(base).not.toMatch(/color:\s*#fff/);
  });

  it("lifts to the 44px touch floor on phones", () => {
    const phones = css.match(/@media\(max-width:680px\)\{[^@]*\}/g) ?? [];
    expect(phones.some((rules) => rules.includes(".booking-back.booking-back--flow{min-height:44px}"))).toBe(true);
  });
});
