# Stay Payment Responsive Sizing — 2026-11-04

Follow-up to [[2026-11-04 - Stay Payment Receipt Reference]]. The user explicitly
replaced screenshot-sized geometry with substantial, fluid sizing while keeping
the receipt's visual direction.

- Preferred desktop/laptop width 560px, capped at 90vw; tablet maximum 520px;
  mobile width `100vw - 24px` with 12px minimum margins. Fluid typography (title
  26–34px, values 13–15px, labels 10–12px) and 20–32px content padding.
- Automatic height, 88dvh/720px cap and safe viewport margins, including short
  landscape adjustment. Body scrolls; header and gold Close action remain visible.
  No scale transform or fixed receipt dimensions. Controls have 44px targets.
- Shared Modal gains an optional headerBrand slot so the receipt's brand artwork
  is outside the scroller. Receipt uses the existing footer slot. Other callers
  retain their existing rendering and behavior. A named, focusable record region
  supports keyboard scrolling. Live payment/proof data and review workflows remain.
- SYSTEM.md and DESIGN.md reflect the responsive contract; unrelated work retained.

## Verified

- 18 focused receipt/payment-display/shared-Modal tests pass, including the new
  keyboard-accessible record and separate header/footer checks.
- Full suite: 2257 pass / two known text assertion failures (password-reset-audit,
  transportation). Typecheck and isolated production build pass. Touched TSX ESLint:
  zero errors / four pre-existing shared-Modal warnings. Generated build type paths
  removed, then typecheck rerun.
- Chrome component-fixture measurements: 560px at 1440/1280/1920 widths, 520px at
  768px, 367px at 391px, 296px at 320px. No horizontal overflow; title/value/label
  minimums held. Desktop/laptop, tablet, mobile and dark renders inspected.
- Short landscape 844×390: header/footer remain inside viewport, body scrolls.
  Keyboard PageDown/End tested. At 320×568 with a long filename and 400px sample
  proof, the 957px record scrolls within a 261px body; its total is reachable while
  header and Close remain in place. Browser Close and Escape dismissal verified.
- Captures: `.tmp/stay-payment-visual/responsive-desktop.png`,
  `responsive-laptop-dark.png`, `responsive-tablet.png`, `responsive-mobile.png`,
  and `responsive-proof-scrolled.png` (ignored). Viewport emulation only;
  physical touch devices/Safari and authenticated live-record E2E not verified.

No database write, migration, deployment, commit or push.

## Brand correction follow-up

User corrected the reference's mistaken hotel identity. Header now uses
HAVEN Hotel & Residences and the canonical shared `HavenLogo` small mark,
rendered white on green in both themes. The reference arch was removed; Garden
Twin remains only as live reservation room-type data. Responsive geometry stays.
18 focused tests, typecheck, touched-file ESLint (zero warnings/errors), and the
isolated production build pass. Chrome desktop and 320px mobile fixtures verify
the loaded logo and non-overlapping brand/Close placement; captures are
`.tmp/stay-payment-visual/haven-receipt-desktop.png` and
`haven-receipt-mobile.png`. Full suite not rerun for this branding-only follow-up;
the preceding full-suite checkpoint above remains the last full-suite result.

## Remove duplicate Close button

User requested X-only dismissal. Removed the bottom Close button/footer and its
unused styles; added fluid paper padding after Total. Header X, Escape, focus
containment and scrolling remain. Typecheck, touched TSX lint (zero findings) and
18 focused tests pass. Chrome fixture inspected; X dismissal verified. Updated
preview: `.tmp/stay-payment-visual/haven-receipt-x-only.png`. Full suite/production
build not repeated for this small follow-up; previous checkpoints remain above.
