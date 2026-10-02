# 2026-10-02 - Cancelled Balance Mismatch, Preview 404, Profile 500 Hardening

## Issue 1 — cancelled reservation conflicting balance/status
Root: `cancel_reservation` zeroed the invoice but left `pending_verification`
deposit payments ("Awaiting Verification" forever) and `payment_status`
stale (`unpaid`), while the history card recomputed total−deposit (₱63,800
"owed") vs invoice-derived ₱0 on detail/folio.
Fix (`20261024080000`, pushed + live-verified): cancel expires
`pending_verification` deposit payments (paid rows untouched — trigger
protects them and they stay the refund basis) and sets
`payment_status='failed'` only when no refund is eligible (eligible path left
for `process_refund` → refunded/partial_refund). History card shows balance 0
for cancelled stays. `failed` badge already renders (StatusBadge).

## Issue 2 — profile page server error (scope unknown)
Prime suspect: `getGuestProfile` used `.limit(1).maybeSingle()`, which throws
on duplicate guest rows → permanent per-account 500. Hardened to newest-first
single-row selection with try/catch → null (page renders session defaults).
Callers unchanged (same object|null shape). Regression test: duplicate rows
resolve, never throw. Still to check if it recurs: Vercel logs for
/account/profile + duplicate-row census.

## Issue 3 — refund preview never loads
Root: modal fetched `.../cancel/preview`, which never existed (preview GET
lives at `.../cancel`) → 404 HTML crashed `response.json()` → "Check your
connection", Cancel disabled. One-line path fix + contract test pinning
client path to route path.

## Gates
typecheck clean; eslint clean; targeted 64/64 (cancel/ownership/refund);
full 1934/1935 (1 pre-existing unrelated password-reset-audit failure);
build clean; diff-check clean. Live: ledger `20261024080000`, both new
statements confirmed in live `cancel_reservation` body.
