# 2026-09-28 - Tax-Aware Financial Documents

## Task

Phase 1 of the post-audit improvement roadmap (`/impeccable` prompt): tax/service-charge
breakdowns on HAVEN's financial documents. User decisions via AskUserQuestion:

- **VAT-inclusive presentation** (recommended, chosen over tax-exclusive) — displayed prices
  remain the full price guests pay; documents *derive* the breakdown from the total. Zero
  changes to booking/folio/payment/refund/extension math.
- **Rates: 12% VAT + 10% service charge** — shipped defaults, Owner/Admin-editable.

Legal grounding (kept separate from hotel policy): NIRC §113/§108 — prices quoted to non-VAT
guests are treated as VAT-inclusive; a single total without breakdown is derived at 12/112
(bir.gov.ph, NIRC 1997 as amended). Whether the property is VAT-registered is a business fact;
the system just makes the breakdown configurable and derivable.

## What was delivered

Migration `20260928010000_tax_aware_documents.sql` (pushed + live-verified, all three functions
recreated from LIVE bodies via DIRECT_URL):

1. `hotel_operational_policies` gains `vat_rate_bp` (default 1200) and `service_charge_bp`
   (default 1000), both `0–10000` basis points with check constraints.
2. `current_operational_policy_snapshot()` includes `vatRateBp`/`serviceChargeBp` → the existing
   `reservations_policy_snapshot` trigger freezes the rates into every new hold/reservation for
   free (no new column, no new trigger).
3. `accounting_generate_document` derives a `taxBreakdown` object (pricingBasis `vat_inclusive`,
   netSubtotal, serviceCharge, vatAmount, grossTotal) from the receipt's payment amount or the
   folio amount, using the reservation's frozen rates with current-policy fallback for legacy
   rows. `net = gross ÷ ((1+sc)×(1+vat))`; the **VAT line absorbs rounding** so the lines always
   sum exactly to the gross. Both rates 0 → no breakdown attached (documents look as before).
4. `admin_update_operational_policy` takes `p_vat_rate_bp`/`p_service_charge_bp` (validated,
   audited before/after). The new parameter list created an overload — the stale 16-param
   signature was **dropped**, and the new signature's stray anon/authenticated EXECUTE grants
   (Supabase named-role grant hole) were revoked explicitly. Both fixes are in the migration
   file so fresh environments replay correctly.

App changes:

- `lib/accounting.ts` — `inclusiveTaxBreakdown` (centavos-exact TS mirror of the SQL, same
  pattern as `folioState`) + `ratePercent`; `snapshot` added to the ledger DOCUMENT_FIELDS.
- `lib/hotel-policy.ts` — `OperationalPolicy` + defaults gain `vatRateBp`/`serviceChargeBp`.
- `PATCH /api/admin/policy` — zod 0–10000 for both rates, passed through to the RPC.
- Owner **and** Admin policy dialogs — VAT % / service charge % fields (percent entry,
  bp payloads); Admin policy view gained a "Tax and financial documents" group with percent
  formatting.
- Manager → Accounting → Financial documents — new immutable-snapshot **document viewer**
  (Modal reusing the approval-review pattern): document/guest/stay, financial position at issue,
  tax breakdown, charges, payments, adjustments.
- Customer receipt page — breakdown lines after the amount (net / service charge / VAT / gross),
  rates from the reservation snapshot with current-policy fallback, VAT-inclusive note.
- Booking confirmation — one-line VAT-inclusive note (no full breakdown; emails are Phase 4).

## Verification

- Live probes: columns + rates (1200/1000), all three bodies contain the new logic, single
  `admin_update_operational_policy` signature, anon/authenticated blocked, service_role allowed.
- Live document generation (folio on `RSV-D370C7FB`, legacy row → current-policy fallback):
  4707.79 + 470.78 + 621.43 = **5800.00 exactly**.
- Historical safety: the migration never touches `financial_documents` rows — issued snapshots
  are byte-identical by construction.
- `lib/tax-documents.test.ts` — new, 10/10 (unit + migration source-scan). Full suite
  **878/878**; typecheck clean; lint 0 errors (71 pre-existing warnings); build green.

## Affected files

- `supabase/migrations/20260928010000_tax_aware_documents.sql` (new)
- `lib/accounting.ts`, `lib/hotel-policy.ts`, `lib/tax-documents.test.ts` (new)
- `app/api/admin/policy/route.ts`
- `components/owner/owner-dashboard-client.tsx`, `components/admin/admin-dashboard-client.tsx`,
  `components/manager/manager-dashboard-client.tsx`
- `app/(booking)/(customer)/account/receipts/[id]/page.tsx`,
  `app/(booking)/booking/confirmation/[id]/page.tsx`
- `SYSTEM.md` (§7 accounting workspace, §8 policy table + tax row, §9 migration count)

## Unresolved / next

- Manual UI verification pending (Owner/Admin policy dialog percent fields, Manager document
  viewer, customer receipt breakdown) — needs role logins.
- Refund documents are not rendered documents today — deferred (recorded as a limitation).
- Roadmap Phase 2 next: consolidated guest profiles (read-only CRM view). Phase 3 rate plans
  needs its own planning session; Phase 4 guest emails can then itemise taxes using the same
  snapshot rates.
