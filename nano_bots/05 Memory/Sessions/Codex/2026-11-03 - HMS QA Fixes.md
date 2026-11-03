# HMS QA fixes — 2026-11-03

User authorized fixes to QA-01–03. Single agent; preserved unrelated dirty work.
Impeccable hardening/layout fallback guidance used; launcher unavailable.

Stock physical-count baseline is captured on entry and kept through refresh.
Explicit clear/recount, item or movement-type change resets it. Cash form is keyed
by drawer/actor/role, with blank-count guard. Ledger fragment wrapped as one grid
child. No server/migration or authorization changes.

Verified 6 targeted tests, including two former expected-failure regressions now
normal passes plus recount/same-drawer assertions. Typecheck/build and lint pass;
two existing dashboard hook warnings. Full suite 2,102 pass / existing KI-012 fail.
Signed-in Front Desk cash desktop shows two children at y=84; mobile stacks with
no page overflow. Screenshots `.tmp/hms-qa/cash-fixed-{desktop,mobile}.png`.
No live business submission; no credentials saved. KI-014–016 marked resolved.
QA report follow-up records exact evidence and remaining coverage limits.
