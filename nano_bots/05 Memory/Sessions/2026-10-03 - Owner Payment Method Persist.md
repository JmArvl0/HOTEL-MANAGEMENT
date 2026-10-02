# 2026-10-03 — Owner Payment Settings: switching PayMongo → Manual GCash now persists

## Context

Reported: Owner → Governance → **Payment Settings** — selecting *Manual GCash verification*
and saving appeared to succeed, but a refresh snapped the radio back to PayMongo.

## Root cause

The 3-step wizard (`components/owner/payment-settings-panel.tsx`) stores two facts through two
different endpoints:

- deposit method → `PATCH /api/admin/deposit-method` → RPC `admin_update_deposit_method`
  (writes `hotel_operational_policies.deposit_method`, Owner + Admin, audited)
- destination → `PATCH /api/owner/payment-destination` → RPC `owner_update_payment_destination`
  (writes the GCash account fields + `gcash_enabled`, Owner-only, audited)

The wizard's primary accent **Save changes** button called only the destination route, and its
body omitted `depositMethod`; the destination RPC never touches `deposit_method`. So switching
to Manual reported success while `deposit_method` stayed `'paymongo'` — and because
`gcash_enabled` stayed true, `activeDepositMethod` (booking payment page, `/api/booking/payments/gateway`,
`/api/booking/holds/[token]/confirm`) kept serving the PayMongo instant path. Refresh reloaded
`depositMethod` from the DB and the radio reverted. Only the easy-to-miss soft "Switch deposit
method" footer button (`saveMethod()`) persisted the method — and it did not save destination edits.

## Live DB check (KI-011 class ruled out)

Read-only probe via `scripts/dbq.mjs`:

```
fn_count=1  deposit_method='paymongo'  gcash_enabled=true  version=7  ledger_max='20261024090000'
```

The `admin_update_deposit_method` RPC exists and the column is present — **no migration needed**.

## Fix — one save commits both, method first

All in `components/owner/payment-settings-panel.tsx`:

1. `save()` now commits the method *and* the destination:
   - `methodChanged = depositMethod !== loaded.destination.depositMethod`.
   - If changed, `PATCH /api/admin/deposit-method` with the loaded `version`; take the returned
     `version` (`body.data.version`) — both RPCs share the same `hotel_operational_policies.version`
     counter, so the destination save must carry the bumped value.
   - PayMongo target stops there (express path: no destination/review) and reloads.
   - Then `PATCH /api/owner/payment-destination` with the (possibly bumped) version, then `load()`.
2. Deleted `saveMethod()`; Step 1's **Activate PayMongo** button now calls `save()` gated on
   `methodDirty`; the sticky footer renders only when `depositMethod !== "paymongo"` with a single
   accent **Save changes**.

Deliberately did **not** fold the method into the owner destination route/schema: its `superRefine`
requires a complete destination whenever `enabled = true`, which would block the PayMongo express
path. Keeping the dedicated Owner+Admin method RPC is why no DB change was needed.

Accepted consequences: when method and destination change together, two audited rows are written
(method first); if the destination save then fails, the method switch stands and the error is shown
— truthful and retryable.

## Files

- `components/owner/payment-settings-panel.tsx` — the fix.
- `components/owner/payment-settings-panel.test.tsx` — **new** jsdom regression: mock
  `@/components/ui/action-dialogs` + `fetch`; assert the method PATCH precedes the destination
  PATCH and the destination carries the version the switch returned; second case asserts a
  destination-only PATCH when the method is unchanged.
- `lib/payment-destination.test.ts` — source-scan contract pinning the panel's save path issues
  the method PATCH (before the destination) and that no `saveMethod` / method-only button returns.
- `components/owner/owner-dashboard-layout.test.ts` — updated a stale contract that pinned the old
  `reason: methodReason.trim()`; it now pins exactly two `reason: destReason.trim()` (one dialog
  reason audited on both requests) and no `methodReason`.
- `SYSTEM.md` §7.2 — one paragraph: the exclusive method radio, `admin_update_deposit_method`, and
  the single-save commit order.

## Verification

- `npm run typecheck` — clean.
- Targeted: `npx vitest run components/owner/payment-settings-panel.test.tsx lib/payment-destination.test.ts`
  — 2 files / 38 tests passed.
- Full `npm test` — 175 files / 1968 tests, **1 failing**: `lib/password-reset-audit.test.ts`
  ("replaces complete_account_recovery…"). Pre-existing and unrelated — the migration file is
  unmodified at HEAD and uses CRLF line terminators, while the assertion matches a `\n` literal
  (see [[KI-012]]).
- `npm run build` — clean, all routes generated.

## Unresolved / next

- Authenticated browser QA pending ([[KI-005]], needs an Owner login): switch PayMongo → Manual →
  complete destination → **Save changes** → hard refresh → still Manual and the DB shows
  `deposit_method='manual'`; a held booking's deposit page shows the manual GCash form. Then switch
  back to PayMongo → Save → refresh → PayMongo again and the booking page offers instant checkout.
- Admin → System Health → Payment configuration still switches the method independently (unchanged
  endpoint in `components/admin/system-health-ledger.tsx`).
