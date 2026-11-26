# Front Desk Exact Room Holds

## Local verification

- Migration `20261126010000` shares the live exact-hold rule across guest
  availability and Front Desk room eligibility. The assignment write
  rechecks under the existing type lock.
- A guest hold placed during pre-assignment produced an inline conflict and
  zero writes. Edge verified visibility in light mode at 1366 × 768 and
  dark mode at 1280 × 720. The room returned and accepted assignment after
  expiry and before cleanup.
- The database regression and seven shared-inventory checks passed. No
  payments or hold conversions occurred. Vitest passed 2,754 tests.

[Audit report and staging acceptance](../../../../docs/audits/front-desk/FRONT-DESK-SHARED-INVENTORY-TEST-REPORT.md#confirmed-follow-up)
