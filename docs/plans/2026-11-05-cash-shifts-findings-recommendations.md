# Cash & Shifts Findings — Recommended Fixes

**Date:** 5 November 2026, Asia/Singapore.
**Status:** Approved by the user and implemented locally on 5 November 2026.
Verification and pending hosted-release boundaries are recorded in the
[implementation report](../qa/cash-findings-implementation-2026-11-05.md).
No hosted migration, business write or deployment was performed.
**Goal:** Account for actual refund cash payouts, preserve intentionally saved
counts, and make the remaining work after drawer closure clear.
**Architecture:** Extend the existing refund transaction and cash-count workflow.
Reuse payments, shared-drawer locking, operational handovers and daily-report
snapshots. Keep draft data separate from final financial records.
**Tech stack:** Existing Next.js/React, Zod, PostgreSQL/Supabase and Vitest;
no new package or separate accounting subsystem.

## Evidence and existing rules

- [Cash data-flow QA](../qa/cash-shifts-data-flow-qa-2026-11-04.md) records KI-021:
  normal refunds persist as `manual_refund` with no drawer link. This checkout's
  refund form, HTTP handler and migration-owned function match that finding.
- Drawer expected cash already uses opening float + linked paid collections −
  linked paid refunds. The missing piece is payout classification/linkage, not
  a second balance calculator.
- Count/note and close retry information live in mounted React state. The present
  “Keep draft & return” action closes the review dialog without a database save.
- Close, handover and report submission are separate writes. A daily report can
  include multiple drawers; a drawer close is not completion of the hotel day.
- `SYSTEM.md` and Decisions D-007 retain Accounting execution of routine refunds;
  Manager approval applies to exceptions. Front Desk does not gain refund
  processing authority through this proposal. Operational handover records
  follow-up, not physical cash custody or reassignment of the drawer opener.

The previous 2,303-pass QA result predates publish synchronization. The later
handoff records 2,313 passing tests and two independently reproduced baseline
failures. Neither result was rerun for this recommendation draft.

## 1. Refund payout method and drawer linkage — first priority

**Recommendation:** Require Accounting to identify the actual payout method when
recording a completed refund. A genuine cash payout must identify its open drawer;
an external payout must have no drawer link.

### Staff workflow

1. Open the existing Refunds action. Show the server-owned refundable amount and
   existing “Within policy” / “Approved exception” basis.
2. Require a payout method with no assumed selection: cash from drawer, bank
   transfer, GCash, or card reversal where the property supports that method.
   Changing this selector records a manual payout; it does not execute a provider
   transfer or imply provider verification.
3. For cash, show the currently open drawer's identity, location, opener and
   recorded available cash. Require confirmation of that specific drawer.
4. Retain the required reference. For cash, label it as a payout/voucher reference;
   for external payments, use the transaction reference. Record completion only
   when the payout has actually been made.
5. After success, refresh Refunds, Transactions, the folio and drawer totals.
   Show the linked refund as a negative cash movement with its method and actor.

### Server behavior

- Extend the existing refund API/RPC with payout method and conditional drawer ID.
  Derive the amount and authenticated actor on the server. Reuse `payments.method`
  and `payments.cash_shift_id`; do not create a parallel cash-out entry that would
  subtract the same refund twice.
- In the shared refund transaction, require an open drawer for cash, reject a
  drawer ID for noncash, and record method/link, refund request, attempt, folio
  changes and audit together. Preserve policy caps, approved-exception fee
  reversals, existing approval-completion hooks and settled-payment immutability.
- Serialize cash refunds with collection/open/close using the existing drawer
  locking convention. Retain the established reservation → invoice → refund
  ordering within the refund path and verify the combined lock order before
  implementation. A close and payout must never both succeed against a drawer
  whose final snapshot omits the payout.
- Recommended new rule: reject cash payouts above the drawer's recorded available
  cash. Show a clear error without marking the refund processed. Any physical
  top-up requires a separately supported, recorded movement; do not invent one.
- Exact retries return the original result, including after that drawer closes.
  Conflicting method/drawer/reference details must not create or redirect a second
  payout. Detect an already completed identical request before demanding that its
  original drawer still be open. Preserve the established refund-request dedupe.
- Enforce method/link validity in the common database writer and relevant payment
  backstop, not solely in the form. Remove or restrict any superseded RPC overload
  that would allow a new payout to bypass explicit classification.

**Expected example:** ₱1,000 float + ₱2,000 cash collection − ₱250 cash refund =
₱2,750 expected. Counting ₱2,750 produces zero variance. A ₱250 bank refund leaves
that drawer's expected cash at ₱3,000.

**History:** Leave existing `manual_refund` rows and closed/reconciled snapshots
unchanged. Do not guess a historical payout method, assign an old refund to today's
drawer, or erase an original shortage. Accounting may document an evidenced legacy
discrepancy through the existing review notes; those notes do not correct totals.
Historical financial corrections would need a separate approved correction design.

**Operational assumption to review:** This first version lets Accounting record a
confirmed payout. If Accounting authorizes first and Front Desk hands out cash
later, a separate authorize → disburse flow is needed. Do not mark that future
payout completed at the authorization step or treat Accounting's recorded identity
as proof that a different cashier handed out the money.

## 2. Cash-count drafts — explicit durable save

**Recommendation:** Replace “Keep draft & return” with **“Save draft & return”**
backed by a server save. Typing remains unsaved until the save succeeds. Show
“Unsaved changes”, then “Draft saved at [time]”; retain the entered values and
dialog on failure. Browser navigation with unsaved edits gets a discard warning
where feasible, rather than an unsupported promise that every exit is intercepted.

- Store a small separate count-draft record keyed by drawer and authenticated
  user/role, with count, explanation, update time, optimistic version and the cash
  activity basis at the time of counting. Require the existing close authority to
  read/save a draft; server checks current account/role and drawer status.
- A successful save survives module navigation, reload and signing in on another
  device as the same authorized user. Do not expose another operator's draft or
  silently reuse it for a new drawer or role. Do not store these financial notes in shared
  browser storage as the primary persistence mechanism.
- Draft saves never populate `actual_cash`, `expected_cash` or `variance` on the
  shift, never close/reconcile it, and never enter payment/revenue/report totals.
  Draft explanation may be incomplete; required variance explanation remains a
  final-close validation.
- On return, offer “Resume saved draft” with save/count time and “Start a fresh
  count”. Clearly distinguish saved draft values from a successfully closed count.
- Associate the count with a server-generated fingerprint of linked paid movement
  IDs and relevant values. Net balance alone is insufficient: a collection and
  payout can cancel each other numerically while invalidating the physical count.
  Compare that basis when saving/resuming and again under the close lock. Changed
  activity requires a fresh physical count and review, preserving the old input
  until the user explicitly replaces/discards it.
- Use the draft version to reject stale cross-tab/device saves. Preserve local
  edits on conflict and offer reload; never silently overwrite a newer draft.
- Successful close invalidates all drafts for that drawer. Failed close preserves
  the draft. Keep the close request's existing retry key for identical pending
  payloads; persist pending retry information needed to recover after reload,
  and resolve an uncertain close response before offering a new close request.
  Draft invalidation must not erase the identity/result needed for that recovery.

**Alternatives considered:** Merely rename the current action to “Return to
drawer — unsaved” for the smallest clarification, or save in browser storage for
same-browser recovery. Both are smaller; neither provides durable account-bound
recovery across devices. Explicit server save is recommended if “saved draft” is
the intended product promise. Background autosave can wait until explicitly needed.

## 3. Work after Close — guided actions with truthful status

**Recommendation:** Keep explicit handover and report submission, and add a small
“Drawer closed — next steps” area to the existing cash workspace/history detail.

| Item | Information and action |
| --- | --- |
| Drawer | Closed time, recorded expected/count/variance, and history link |
| Accounting review | Awaiting reconciliation / Reconciled, from the saved shift |
| Operational follow-up | View existing linked handovers or “Add a concern” with this drawer prefilled |
| Daily report | For authorized Front Desk users, open the relevant hotel-local report date and its actual submission status |

- Prefill only drawer source/type and relevant recorded facts when opening a new
  handover. Staff still supplies the concern and receiver, then submits explicitly.
  An existing handover ID used for focus is distinct from the drawer source ID.
- A balanced close does not require a fabricated handover. An unresolved concern
  remains pending across shifts; closure never acknowledges or resolves it.
  “No new handover recorded” must not be presented as “No unresolved concerns”.
- Refresh statuses from persisted records on return/reload. The present handover
  list contains the recent 100 authorized rows; use a complete source-scoped read
  before declaring that a selected drawer has no unresolved follow-up. On read
  failure show status unavailable, rather than an empty/completed state.
- Open a report preview for the existing Manila close-date/report convention;
  retain Front Desk's explicit Submit and Manager's review. Show submitted,
  returned or superseded state accurately. A report is for a hotel day, not each
  individual drawer. New closes after a submitted snapshot do not rewrite it;
  reuse the existing review/resubmission lifecycle where applicable.
- If an actor cannot submit the report, identify Front Desk as the responsible
  role. Do not grant Accounting new report permissions or disclose report data
  through an otherwise unauthorized shortcut.

**Alternatives considered:** Auto-create a handover and auto-submit a report on
every close, or combine them into a blocking wizard. These risk empty handovers,
premature daily snapshots and new close dependencies. Guided links provide a
clear next action while retaining the approved separation of responsibilities.

## Delivery scope and acceptance

Implement refund linkage first; deliver saved drafts and post-close guidance as
separate reviewable changes. Keep the Cash & Shifts name and existing visual
system. No general expense/petty-cash module or cash-custody transfer is included.

| Change | Existing source to extend |
| --- | --- |
| Refund | `components/manager/manager-dashboard-client.tsx`, `app/api/accounting/refunds/[id]/process/route.ts`, migration-owned `process_refund`, related payment trigger |
| Read-back | `lib/accounting.ts`, `lib/cash-shift-display.ts`, `components/manager/cash-shifts-workspace.tsx`; expose recorded actor attribution where required |
| Drafts | `components/manager/cash-count-panel.tsx`, existing cash-shift action route plus a scoped draft route/RPC and additive draft storage |
| Guidance | Cash workspace and existing dashboard navigation, `operational-handover-panel.tsx`, `front-desk-reports-panel.tsx`; add narrowly scoped reads only where existing responses cannot support truthful status |

Use additive migrations. Verify the linked live migration ledger before assigning
filenames/numbers; no migration number or applied-state claim is made here. Reads
remain through authorized service-role server code, with restrictive grants/RLS
for new draft storage. Update `SYSTEM.md`/`DESIGN.md` only after behavior is verified.

Required acceptance scenarios:

1. Cash-refund example closes at ₱2,750 with zero variance; payment, attempt,
   method/drawer/actor audit and folio persist and read back on another connection.
2. Equivalent noncash refund never changes the drawer; missing/invalid method and
   incompatible drawer ID fail without partial writes.
3. Cash refund rejects absent/closed/wrong drawer and insufficient recorded cash;
   authorization and all existing refund caps/exception hooks remain effective.
4. Identical retries, including after drawer closure, produce one payout. Changed
   retry details conflict. Concurrent close/payout and concurrent payouts serialize.
5. Forced database failure rolls back payout, attempt, folio and audit together;
   historical refunds and previously recorded close snapshots remain unchanged.
6. Explicit draft save survives navigation/reload/same-user device change. Unsaved
   edits and failed saves are identified accurately; final financial fields stay
   unchanged. Blank count never becomes zero by coercion.
7. A different user/drawer cannot inherit a draft; changed activity, stale draft
   versions and a drawer closed elsewhere require recovery rather than silent close.
8. A lost close response followed by reload recovers the original result/key;
   successful close invalidates drafts and failed close preserves recoverable input.
9. Close by itself creates neither a handover nor a daily report. Prefilled
   handover saves the correct drawer/receiver only after explicit submission.
10. Post-close statuses survive reload and respect permissions, complete relevant
    follow-up reads, hotel date boundaries, multiple closes/day and submitted
    report snapshots. Unavailable data never appears complete.

Verification during implementation: extend the disposable real-PostgreSQL QA
harness for writes, read-back, rollback and lock races; add meaningful route and
component tests around these scenarios. Run `npm run typecheck`, ESLint on touched
TS/TSX, targeted Vitest, then full `npm test` and `npm run build` at checkpoints.
Complete an authenticated disposable-data browser walkthrough of refund, count,
reload, close, handover and report submission; report any browser gaps honestly.
Do not treat isolated SQL or mocked transport tests as browser financial-write E2E.

This draft was checked against repository evidence only. No implementation or
financial-write verification was performed in this drafting session.
