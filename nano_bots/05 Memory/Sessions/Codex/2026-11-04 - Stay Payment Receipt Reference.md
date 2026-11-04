# Stay Payment Receipt Reference — 2026-11-04

Implemented the user's supplied screenshot and green-header receipt specification
for the existing read-only stay-payment details dialog.

- `StayPaymentReceipt` and scoped CSS reproduce the cream card, green arch/leaf
  header, dotted detail rows, state chips, verification panel, total strip, brass
  Close control and scalloped edge. The supplied Garden Twin wordmark is retained.
- `DepositVerifyDialog` routes only non-pending stay-payment records into it.
  Selected-record amounts, reservation/guest, method/reference, status and Manila
  timestamp stay dynamic. Existing signed proof previews and metadata are retained.
  Pending verification, rejection, deposit review and authorization are unchanged.
- Shared `Modal` retains portal, scroll locking, focus containment/return and
  Escape/backdrop dismissal. Long proof content uses safe vertical alignment.
- SYSTEM.md / DESIGN.md document the scoped presentation. Existing unrelated
  working-tree changes, including concurrent contrast work, were preserved.

## Verification

- 10 focused receipt/payment-display tests pass, including changed records,
  proof content, manual GCash naming, totals and keyboard/close behavior.
- Full suite with four workers: 2,256 pass / two known exact-text failures in
  password-reset-audit and transportation. An earlier concurrent build/test run
  also timed out three unrelated checks; those pass both individually and in
  the final full-suite run.
- Typecheck passes. Touched TSX ESLint: zero errors / three existing dashboard
  hook warnings. Production build passes with isolated output; temporary generated
  type include paths are removed afterward.
- Chrome actual-component fixtures inspected at 391 × 487 light, 320 × 700
  light and 1366 × 900 dark. At the reference size: card (3,3), 384 × 477;
  total (19,381), 352 × 39; Close (155,438), 80 × 25. No horizontal overflow.
  Browser Close and Escape dismiss correctly. Fixtures use supplied sample data;
  authenticated live-record E2E is not claimed. Captures in
  `.tmp/stay-payment-visual/receipt-391.png`, `receipt-320.png` and
  `receipt-desktop-dark.png` (ignored).

No migration, hosted business write, deployment, commit or push.
