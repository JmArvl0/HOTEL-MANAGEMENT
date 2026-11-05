# Cash Delivery and UI QA

6 November 2026, Asia/Singapore. User requested QA of implemented cash findings,
data destinations and frontend arrangement. One agent; no delegation.

Added `scripts/cash-delivery-ui-qa.mjs`: actual Next.js/auth/API/PostgREST/
PostgreSQL flow against fresh fictional loopback data, guarded before writes.
Seeded encrypted sessions test account role/version validation, not password/OTP.
Final25checks:23pass/2fail. Verified drawer/receipt/folio/refund/actor/audit,
cross-session durable draft, stale-basis block, failed-save preservation,
lost-response close retry, noncash exclusion, Accounting review, explicit
handover receipt/resolution and report submission/Manager acknowledgement.
Separate1000expected/990count preserves−10variance and explanation after review.

Confirmed KI-022: report collections add positive outgoing refunds; KI-023:
header controls clipped at320/390/1024px. Additional KI-024–026: report centavos
rounded, closed-drawer handover caption wrong, modal actions below44px target.
No production fixes in this QA. Core cash workspace reflows light/dark at
1440/1024/768/390/320px; count focus/scroll/Escape and readable values verified.

Fresh126migration replay, SQL12/12 and targeted156/156pass. Full2343pass/2fail,
same recorded purchase-order/room-rack tests; pristine baseline not rerun here.
ESLint0errors/6existing warnings. Final Node22 typecheck/build pass. Test cluster
stopped with fictional fixtures retained; pre-existing generated type paths restored.
Read-only linked ledger126local/112remote/14pending; cash fix migration absent.
No hosted business write, migration push, deployment or commit. Unrelated
concurrent edits retained; generated QA build config is cleaned after checks.

Report: `docs/qa/cash-delivery-ui-qa-2026-11-06.md`, including versioned fictional
JSON read-back/layout results and selected screenshots. Remaining limits include
hosted E2E, password/OTP, real providers, touch devices, Safari/Firefox, browser
zoom, screen readers and production performance. Release acceptance withheld.
