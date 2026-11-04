# Cancellation and no-show browser QA — 2026-11-03

Completed locally in Brave against the real production build, NextAuth,
PostgREST and a disposable PostgreSQL database with all 113 migrations.
Accounts, deposits, refund references and reservations were synthetic. No API
responses were mocked. The hosted `.env.local` hash stayed unchanged. Email,
storage and payment-provider integrations were disabled or unavailable, so no
external payout, provider settlement, upload or email-delivery claim is made.

## Browser outcomes

| Flow | Observed result |
| --- | --- |
| Full cancellation window | ₱5,000 received; fee ₱0; refund request and credit ₱5,000. |
| Partial cancellation window | ₱5,000 received; named fee ₱2,500; unused ₱10,000 obligation credited; refund request and credit ₱2,500. |
| Non-refundable window | Named fee ₱5,000; balance and credit ₱0; no ordinary refund request. |
| Independent transportation | ₱500 pickup retained alongside ₱2,500 cancellation fee; refundable credit ₱2,000. |
| Unverified proof | Settled receipts, fee and refund all ₱0; original pending proof became expired and remained visible. New zero-deposit preview wording retested. |
| Accounting ordinary refund | Processed the synthetic ₱2,500 request; reload/reopen retained Processed status and reference; guest subsequently saw the refund transaction and zero credit. Original ₱5,000 payment remained intact. |
| Front Desk no-show | Two overdue synthetic arrivals each posted exactly one ₱3,000 no-show fee, released unused obligations and showed zero balance. The rebuilt list updated immediately without losing its All Reservations view. |
| No-show cutoff | Future arrival rejected with the configured cutoff message; reservation remained confirmed with original money unchanged. |
| Approved exception | Accounting requested ₱2,000, a separate Manager account approved it, and Accounting executed it. A linked ₱2,000 fee reversal appeared, original fee became partially reversed, and the final folio reconciled to ₱3,000 with zero balance/credit. |
| Fee reporting | Operating-day assessment displayed separate cancellation/no-show totals. After the waiver: cancellation ₱8,000 and no-show ₱6,000. Later mobile cancellation raised cancellation fees to ₱10,500; persisted metrics reconciled. |
| Issued statement | Original ₱10,000 obligation, its credit, fee, original payment and refund all visible. Issued snapshot and document number survived the app rebuild. |
| Responsive use | Default 922px viewport, 390×844 mobile and 1366×900 desktop checked. Mobile preview remained readable and scrollable; reason entry and cancellation completed; resulting folio showed the correct fee/credit. Temporary viewport override reset. |
| Final list/keyboard retest | Accounting's overview shortcut reached its permitted reservation list; unknown balances displayed “Open folio for balance” under “Booked total”; Enter on Exception opened one request dialog without opening the reservation detail too. |

Read-only assertions against the actual browser database verified all ten fixture
outcomes, unchanged original paid amounts, one fee per no-show, waiver execution,
preserved pickup, and no unreconciled invoices. Pending refund requests were test
fixtures, not unperformed production work. Night close itself was not performed.

## Fixes found and retested

1. **Stale room-board history after closure:** the detail callback refreshed the
   parent, whose rack branch intentionally did no fetch; the board's full-history
   query ran only on mount. The shared load path now signals the board to refresh
   its snapshot and history while retaining filters and selected view.
2. **Statement omitted original obligation:** the immutable snapshot already held
   the amount, but the viewer omitted it. It is now displayed for terminal
   settlements so the obligation credit can be reconciled to the fee total.
3. **Zero-deposit preview wording:** a ₱0 receipt no longer says a deposit was
   applied to a fee. Applied-payment labels also distinguish applied money from
   unapplied refundable credit.
4. **Accounting reservation shortcut:** it routed to the room board even though
   Accounting lacks room-board authority. It now opens its existing reservation
   list; Front Desk keeps the board shortcut.
5. **Missing balance represented as settled:** reservation summary rows now label
   the original figure “Booked total” and direct the user to open the folio when
   no authoritative balance was returned. Missing data is not treated as zero.
6. **Overlapping keyboard dialogs:** row Enter handling now ignores key events
   originating from child actions, preventing Exception from also opening View.

Behavior regressions failed before the refresh/navigation/list fixes and passed
afterward. No authorization was expanded and no financial formulas were changed
during this browser-QA follow-up.

## Verification and artifacts

- Final Node 22 suite: **204 files / 2,213 tests passed**.
- Final typecheck and production build passed; `git diff --check` passed.
- ESLint over QA-touched components/tests: **0 errors / 4 existing warnings**.
- Evidence and private local launch configuration remain under ignored
  `.tmp/cancellation-browser-qa/`. Configuration files contain local-only secrets
  and must not be committed or copied into reports.
- Synthetic accounts signed out, temporary browser tab closed, viewport restored,
  owned QA services stopped and disposable browser databases removed.

![Verified desktop cancellation folio](C:/Projects/HOTEL-MANAGEMENT/.tmp/cancellation-browser-qa/final-desktop-folio.png)

No production migration, deployment, credential change or operational/financial
test mutation was performed. Migration `20261103160000` and the app release remain
pending; this is local browser acceptance, not a production smoke test.
