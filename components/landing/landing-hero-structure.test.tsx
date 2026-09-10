// Pin test for the landing hero media system and Featured Stays card alignment
// (regression: 2026-09-11 — GSAP once scaled the bare hero image while the wash
// stayed sized to the hero, so the growing image escaped its overlay mid-scroll;
// room cards once staggered and collapsed to content height). These assertions
// read the actual sources so the architecture can't silently drift back while
// every runtime gate stays green. (Same pattern as manager-sidebar-nav.test.tsx.)
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "app/(landing-page)/page.tsx"), "utf8");
const css = readFileSync(resolve(process.cwd(), "app/(landing-page)/landing.css"), "utf8");
const motion = readFileSync(resolve(process.cwd(), "components/landing/landing-motion.tsx"), "utf8");

describe("landing hero media system", () => {
  it("renders the hero image and wash inside the shared .coast-hero-media wrapper", () => {
    // The wrapper must open before the image, and the wash must still be inside it.
    const wrapper = page.indexOf('<div className="coast-hero-media">');
    const image = page.indexOf('className="coast-hero-image"');
    const wash = page.indexOf('<div className="coast-hero-wash"/>');
    const copy = page.indexOf('<div className="coast-hero-copy">');
    expect(wrapper).toBeGreaterThan(-1);
    expect(image).toBeGreaterThan(wrapper);
    expect(wash).toBeGreaterThan(image);
    expect(copy).toBeGreaterThan(wash); // wash closed before hero copy starts
  });

  it("gives the wrapper — not the image or wash — the geometry and the clipping", () => {
    expect(css).toMatch(/\.coast-hero\{[^}]*overflow:hidden[^}]*\}/);
    expect(css).toMatch(/\.coast-hero-media\{position:absolute;inset:0[^}]*transform-origin:center center\}/);
    // No independent transform on the layers themselves — one scale owner only.
    expect(css).not.toMatch(/\.coast-hero-image\{[^}]*transform/);
    expect(css).not.toMatch(/\.coast-hero-wash\{[^}]*transform/);
  });

  it("keeps GSAP scaling the media wrapper, never the bare image", () => {
    expect(motion).toMatch(/heroMedia = "\.coast-hero-media"/);
    expect(motion).not.toMatch(/heroMedia = "\.coast-hero-image"/);
  });
});

describe("landing Featured Stays alignment", () => {
  it("aligns card shells and price rows through layout ownership", () => {
    expect(css).toMatch(/\.coast-room-grid\{[^}]*align-items:stretch[^}]*\}/);
    expect(css).toMatch(/\.coast-room\{[^}]*height:100%[^}]*flex-direction:column[^}]*\}/);
    expect(css).toMatch(/\.coast-room-copy\{display:flex;flex:1;flex-direction:column[^}]*\}/);
    expect(css).toMatch(/\.coast-room-copy>div\{[^}]*margin-top:auto[^}]*\}/);
  });

  it("reveals the room grid as one unit — no per-card stagger offsets", () => {
    expect(motion).toMatch(/gsap\.from\("\.coast-room-grid"/);
    expect(motion).not.toMatch(/gsap\.from\("\.coast-room",/);
  });
});
