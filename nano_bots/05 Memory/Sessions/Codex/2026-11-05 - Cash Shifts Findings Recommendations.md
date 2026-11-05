# Cash Shifts Findings Recommendations

Date: 2026-11-05, Asia/Singapore.

User requested a recommendation draft for the three cash data-flow findings.
Reviewed current QA, SYSTEM.md, D-007, DESIGN.md, refund/count/ledger/handover/report
source and live handoff. The previously absent cash QA report is now present in
this checkout; no cross-device synchronization was performed by this session.

Saved `docs/plans/2026-11-05-cash-shifts-findings-recommendations.md`:
- Explicit Accounting-recorded refund method; atomic open-drawer linkage for cash,
  existing refund/exception safeguards, retry/race handling, unchanged history.
- Recommended explicit server-saved count drafts, isolated from final financial
  records, with stale-activity/version checks and uncertain-close recovery.
- Guided post-close handover/report actions with explicit submission, existing
  permissions and truthful persisted status. Included alternatives and acceptance.

Draft only: no implementation approval, source/DB migration, hosted write,
deployment or business-rule activation. KI-021 remains open. Existing
`next-env.d.ts` modification was left untouched. No tests/build/browser QA were
run for this documentation-only task; prior test counts are explicitly historical.
Document whitespace/local-link/source-reference checks and `git diff --check` pass.
