# Shared Payment Details — 2026-11-04

User requested one reusable Payment Details modal and the same receipt UI for
the other payment detail/review variants. Continues
[[2026-11-04 - Stay Payment Responsive Sizing]].

- Renamed the stay-only component/CSS/tests to `payment-details-dialog.*` and
  generalized `PaymentDetailsDialog` for deposit and stay-payment records.
  One title, HAVEN header/logo, responsive paper shell, scrolling record and
  shared `PaymentDetailRow` render the common fields and verification rows.
- Removed the old alternate dialog JSX from the Manager dashboard. Its small
  `PaymentRecordDialog` adapter supplies the selected record, existing signed
  `ProofPreview` and metadata, and existing review callbacks. All four prior
  variants now route through the same component.
- Purpose distinguishes the payment type; deposits preserve Expected Deposit
  and over/under comparison. Pending/rejected states use receipt-compatible
  amber/clay chips; Paid retains sage. No duplicate bottom Close button.
- Parent supplies review capability only for Accounting (`financialAuthority`).
  Review buttons require both that capability and pending status. Busy buttons
  disable. PayMongo offers no manual confirmation, retains authorized rejection
  and provider guidance. Review notes preserve the deposit/stay effects.
- Review actions occupy a fixed footer; read-only records have X/Escape only.
  Existing approval/rejection endpoints, proof URL handling, loading/refresh and
  server-side authorization are unchanged. No financial data was written.
- PayMongo source-contract test now checks the warning in its new shared component;
  behavioral component tests also verify provider restrictions and callbacks.
  SYSTEM.md / DESIGN.md and current memory reflect the consolidated UI.

## Verification

- 69 focused receipt/Modal/payment-display/PayMongo tests pass. Covers both payment
  types, deposit under/over/match, pending read-only vs review capability, settled
  records, gateway rejection-only, disabled actions, proof, branding and keyboard.
- Final full suite: 2268 pass / two known exact-text failures in password-reset-audit
  and transportation. Earlier full run also caught the moved PayMongo warning test;
  that contract was updated and passes in the final run.
- Typecheck and isolated production build pass. Temporary generated type paths
  removed and typecheck passes afterward. Touched TSX/test ESLint: zero errors /
  three existing dashboard hook warnings. `git diff --check` passes.
- Chrome actual-component fixtures: deposit read-only/review at 1280×800,
  pending stay read-only, 320×568 deposit review with long proof, gateway rejection,
  768×1024 dark/busy stay review. No horizontal overflow; X/header and applicable
  actions stay visible, keyboard End reaches Total, callback wiring and Escape
  verified. Fixtures use sample data; no authenticated or live financial E2E claim.
- Captures under `.tmp/stay-payment-visual/`: `payment-details-deposit.png`,
  `payment-details-review.png`, `payment-details-mobile-review.png`,
  `payment-details-dark-busy.png` (ignored). Preview server stopped afterward.

Existing unrelated dirty-tree work retained. No migration, deployment, commit or push.
