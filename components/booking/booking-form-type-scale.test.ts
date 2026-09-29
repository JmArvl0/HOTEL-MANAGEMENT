import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Booking-form readable type scale (the .booking-form-card block in guest-booking.css).
// Source assertions only — jsdom cannot compute rendered sizes, so on-device readability
// remains a manual screenshot checklist. Same caveat and same shape as
// components/customer/guest-request-type-scale.test.ts, which pinned the sibling standard
// for the customer requests page.
const css = readFileSync(join(process.cwd(), "app/guest-booking.css"), "utf8");
/** Just the appended block, so the scope guard below cannot scan unrelated rules. */
const block = css.slice(css.indexOf("/* Booking form readable type scale"));

describe("booking form type scale", () => {
  it("raises field text to the 16px app-wide form default", () => {
    // One grid used to show three sizes: inputs inherited 10px (globals.css sets
    // `button,input,select{font:inherit}` and .booking-form-grid{font-size:10px} is the
    // nearest ancestor), selects were 14px from components/ui/haven-select.css, and
    // textarea — not in that inherit list — fell back to the ~13.3px UA default. 16px is
    // what every other form in the app already gets.
    for (const field of [
      ".booking-form-grid input",
      ".booking-form-grid select",
      ".booking-form-grid textarea",
      ".booking-form-other textarea",
      ".deposit-reference input",
    ]) {
      expect(block, field).toContain(`.booking-form-card ${field}{font-size:16px}`);
    }
  });

  it("puts body rows on the 14px standard", () => {
    for (const sel of [
      ".request-options-list .request-option",
      ".gcash-steps",
      ".gcash-details dd",
      ".deposit-due-line",
      ".deposit-form h3",
      ".proof-upload strong",
      ".proof-file-info strong",
    ]) {
      expect(block, sel).toContain(`.booking-form-card ${sel}{font-size:14px`);
    }
  });

  it("puts meta, labels and notes on the 12px standard", () => {
    // The 9–10px floors: request subhead and GCash detail labels were 9px.
    for (const sel of [
      ".booking-form-grid label",
      ".booking-form-grid .arrival-note",
      ".booking-form-option-heading",
      ".booking-form-option-heading small",
      ".request-options-subhead",
      ".booking-form-other",
      ".booking-form-other small",
      ".deposit-form legend",
      ".deposit-reference",
      ".proof-label",
      ".proof-staged .btn",
      ".proof-upload small",
      ".proof-file-info small",
      ".gcash-details dt",
    ]) {
      expect(block, sel).toContain(`.booking-form-card ${sel}{font-size:12px`);
    }
  });

  it("keeps the card title and the amount above the row standard", () => {
    expect(block).toContain(".booking-form-card .gcash-destination h2{font-size:16px}");
    expect(block).toContain(".booking-form-card .deposit-due-line strong{font-size:18px}");
    // The amount rule must out-specify its own parent's 14px.
    expect(block).toContain(".booking-form-card .deposit-due-line{font-size:14px}");
  });

  it("beats the three sizes that were already !important", () => {
    // Raising these needs both !important and an extra class to win the cascade;
    // without the !important the guest still reads 10px / 11px.
    expect(block).toContain(
      ".booking-form-card .request-options-list .request-option{font-size:14px!important}"
    );
    expect(block).toContain(".booking-form-card .deposit-verification-note{font-size:12px!important}");
    expect(block).toContain(".booking-form-card .byp-note{font-size:12px!important}");
  });

  it("scopes every rule to the card, so nothing leaks onto a shared class", () => {
    // .request-option / .request-options-list are shared with the customer requests page
    // (the reason that page needed its own scoped override), and .booking-form-card shares
    // a base rule with .review-card, whose .review-stay-total sizes booking-review.test.tsx
    // pins at 21px.
    const rules = block.match(/^\.\S[^{]*\{[^}]*\}$/gm) ?? [];
    expect(rules.length).toBeGreaterThan(25);
    for (const rule of rules) expect(rule.startsWith(".booking-form-card "), rule).toBe(true);
    expect(block).not.toContain(".review-card");
  });

  it("leaves no 9px or 10px floor behind inside the block", () => {
    expect(block).not.toMatch(/font-size:(9|10)px/);
  });
});
