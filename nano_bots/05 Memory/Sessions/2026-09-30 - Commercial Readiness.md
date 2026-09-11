# Commercial Readiness (Roadmap Phase 9 — Final)

**Date:** 2026-09-30
**Scope:** Post-audit roadmap Phase 9 — the closing phase. Four sub-items, each judged
against the roadmap's honesty bar: **no fake integration is shown to users**. This note
ends with the roadmap itself complete.

## 9A — Payment readiness: boundary audited, deliberately unchanged

The roadmap said: keep manual GCash/bank; only create `lib/payments/provider.ts` if it
would be a net deletion. It is not — no provider abstraction exists, so none was created.
Audit results (all verified in source, then pinned by contract tests):

- Guest payment methods are exactly `z.enum(["manual_bank_transfer", "manual_gcash"])` in
  `lib/booking.ts` — reference + proof upload + human verification, no third hop.
- **No "Pay online" UI exists anywhere** — every file under `app/` and `components/`
  scanned for `pay online|pay-online|payonline` (case-insensitive): zero matches.
- The payment page tells guests the truth: "HAVEN verifies GCash and bank transfers
  manually".
- `lib/payments/` and `lib/payment-provider.ts` do not exist (contract-tested).

## 9B — OTA readiness: columns with zero consumers

Migration `20260934010000_ota_readiness.sql` (pushed + live-verified):
`external_channel` / `external_reference` / `external_synced_at` on `reservations`, all
nullable, plus one partial unique index (`reservations_external_reference_idx` on
(channel, reference) where both present). Live check: all three columns exist, zero rows
populated. **Nothing in app/, components/, or lib/ reads or writes them** — grep-verified
and locked by a contract test that scans every .ts/.tsx file. No functions, triggers,
policies, or seeds in the migration. Documented in SYSTEM.md §15: when a channel manager
is actually built, provenance has somewhere to live; until then every reservation is
NULL here and behaves identically to before.

## 9C — Group / corporate bookings: future project, documented not bolted on

The roadmap's own condition was "only if safe, else document". Group inventory semantics
(block holds releasing unsold nights, allotment vs free-sale) and a consolidated corporate
folio both touch the booking spine's core invariants (hold expiry, rate freezing, balance
gates, the single-folio-per-reservation assumption). Shipping a partial version would have
been the unsafe kind of feature. Decision recorded in SYSTEM.md §15 as a named future
project with the specific invariants it must respect.

## 9D — F&B / minibar: needs no new machinery

`post_folio_charge` already posts arbitrary audited guest charges with reason codes;
minibar/restaurant charges are that flow with different reasons. Documentation-only,
recorded in §15. No menu-management UI was invented for a kitchen that doesn't exist yet.

## Verification

- `lib/ota-readiness.test.ts` — 7/7: 9B column shape + no-machinery + no-consumer scan;
  9A manual-methods enum + no pay-online UI + no provider module + honest payment copy.
- Full gates, all green: typecheck ✓, lint 0 errors (72 warnings, all pre-existing),
  `npm test` **966/966** (7 new), `npm run build` ✓.
- Live verification: remote `\d reservations` shows the three columns (nullable,
  zero-populated) and the partial index.

## Affected files

- `supabase/migrations/20260934010000_ota_readiness.sql` (new)
- `lib/ota-readiness.test.ts` (new)
- `SYSTEM.md` — §9 reservations row (OTA provenance columns), migration count 64,
  §15 four Phase 9 decision bullets
- `Current Status.md`, this note

## Roadmap complete

Phases 1–9 all delivered and verified in-session (966/966 suite). The final overall
report was delivered in the closing message. Carried forward, not blockers:

- **Manual UI verification of Phases 1–9** — needs live role logins (Owner/Admin policy
  dialogs, Manager inventory + drafts, Maintenance asset registry, Housekeeping strip,
  guest-profile modal, rate plans modal, deposit aging chips).
- **Commit** — the whole roadmap rides on the large uncommitted tree; commit when the
  user asks, coordinating with parallel sessions.
- schema.sql fresh-install snapshot lags the migrations (KI-002-class); no CI or
  observability; analytics dataset young (real operations data since ~2026-08).
