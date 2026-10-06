# 2026-10-06 - Billing vs Payments & Folio Separation (A+B)

Teacher requirement: Billing and Payments & Folio must read as two modules with
different purposes. Decision: keep both, delete nothing.

## Change (A+B, presentation + nav scoping only)

- Staff Billing purpose line: `components/manager/manager-dashboard-client.tsx`
  `config.invoices.subtitle` → "Staff billing across all stays: folios,
  balances, collections, and verification status. A guest's own bill lives
  in Payments & Folio."
- Billing nav honesty: `config/role-navigation.ts:46` Billing (`invoices`)
  gained `roles: ["front_desk", "accounting"]` — matches `canAccess` and the
  dashboard `access` map (manager/housekeeping/maintenance never had data
  access; Owner uses its own dashboard).
- Guest `/account/payments` untouched — still the guest's own bill
  ("Stay totals, verified payments, remaining balances…").

No RPC, migration, permission-capability, or money-math change.
`sync_invoice_financials` / `folioState` / VAT breakdown untouched.

## Tests

- `lib/rbac/navigation.test.ts`: Billing scoped to collection roles;
  Billing-vs-Folio purpose lines pinned (staff subtitle + guest subtitle).
- Gates: `npm run typecheck` clean; eslint 0 errors (2 pre-existing
  warnings in `manager-dashboard-client.tsx`, untouched lines);
  targeted 31/31; full suite 184 files / 2050 tests; `npm run build`
  clean (88 routes).

## Teacher story

- Payments & Folio = "my bill for my stay" (guest, own rows only).
- Billing = "the hotel's cashier counter" (staff, all stays; Front Desk
  collects/posts, Accounting verifies/adjusts/refunds, Owner read-only,
  Manager never executes — D-007).
