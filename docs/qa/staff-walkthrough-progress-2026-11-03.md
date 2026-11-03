# Staff walkthrough progress — 2026-11-03

Historical progress record. The local walkthrough is now complete; see
`staff-walkthrough-2026-11-03.md` for final results and the newly detected remote
migration collisions that block production release.

Verified supplied hosted-backed Admin, Manager, Owner, Front Desk and Accounting
browser logins. Accounting initially rejected the password. The user explicitly
authorized a reset; only that account's password was reset, auth_version increased,
and an operator_password_reset audit event recorded. Subsequent browser login passed.
No credential is retained in this report.

Separate real app on port3100 used disposable PostgreSQL database
hotel_walkthrough_af3688a685214a1c8b6e063bcc8cbc82 and official PostgREST16.5.
All104 migrations replayed. Normal hosted .env.local unchanged. External integrations
and storage unavailable in isolated QA; no payment provider calls made.

Browser passed: companion save/primary protection, identity verification, payment
collection, early-arrival rejection, stated arrival update, atomic check-in;
Accounting catalog save and explicit clock activation/current-day close blocking;
Front Desk server fee quote/post, unpaid checkout rejection, settlement, room move,
checkout/turnover; Housekeeping claim/start/complete, inspection fail, linked reclean,
inspection pass; department handover receive/take-forward/resolve/archive/history/
restore/reopen; Maintenance report/claim/start/diagnosis and technical block visible
in Housekeeping. These writes affected only synthetic local data.

Found/fixed locally: composite room-rack navigation guard, pagination keys for fee
and identity-review tables, fee-post reservation/readiness refresh, in-house move
picker eligibility, late resource responses overwriting a newer view. Regression
tests demonstrated failures before the relevant fixes. Focused tests passed; full
suite/build and final browser retest must be refreshed after the latest source edits.
Full migration/backend replay and13 operations SQL groups passed after eligibility fix.

Remaining: Manager/Owner new oversight screens, successful prior-day Accounting close
in a clearly dated fixture, final fee-refresh/race UI retest, complete final validation,
regenerated candidate manifest and memory updates. Existing candidate manifest is stale.
Vercel is logged out; four production migrations remain unapplied. Production maintenance
authorization persists; no rollout performed. Browser helper state was lost on continuation;
port3100 recovery is being diagnosed. Helper scripts/state/logs are ignored under
.tmp/staff-walkthrough; never publish state.json (contains local QA secrets).
