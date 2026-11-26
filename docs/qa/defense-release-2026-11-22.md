# Haven defense release evidence

## Frozen candidate

| Item | Verified value |
| --- | --- |
| GitHub branch | `codex/defense-release-2026-11-22` |
| Commit | `91e910b7bda936b55c34ae05f04de9fbcb7193a6` |
| Committed baseline | `e2514b89eaa360b572482d00954522b7552329cd` |
| GitHub Actions | [Passed](https://github.com/JmArvl0/HOTEL-MANAGEMENT/actions/runs/44994296446). The exact commit passed locked install, route type generation, typecheck, lint, the full test suite, and build. |
| Archived source check | Next.js route type generation, TypeScript, and a local production build passed on the exported commit using Node 22.22.2 for verification. |
| Vercel | [Successful Preview built from the frozen SHA](https://vercel.com/hotel-management2/haven-hotel-management/CB2nKaiFDNz2qfSpGe2S9oBYFHxK) |
| Supabase | Read-only ledger matched all 155 applied versions and their names. Two candidate migrations are pending. |

The candidate includes forecast evaluation, seasonal occupancy, the Hotel Command Center, Analytical Reports, age enforcement at check-in, and CI. It excludes the separate uncommitted booking-auth redesign. The working branch and index were preserved. This evidence sits alongside the frozen commit to keep its source identity stable.

## Hosted migration comparison

| Candidate version | Change |
| --- | --- |
| `20261121010000` | Include the saved luggage count in checkout's Fleet request snapshot. |
| `20261122010000` | Bind age evidence to the current primary guest and scheduled arrival date, and reject explicitly expired Express QR tokens. |

The hosted read showed no unexpected versions or filename differences. The read-only Supabase CLI dry-run listed exactly these two migrations in the order shown. The user elected to skip staging. Production deployment and the audited policy activation are tracked separately from the successful branch Preview.

The fast-forward dry-run for GitHub `main` succeeded from `c7c7166` to the candidate. GitHub identifies `c7c7166` as the [preceding Vercel Production deployment](https://vercel.com/hotel-management2/haven-hotel-management/AVWcH5oa2aP4E65XsUwZ1eYBYpa2). The candidate's signed-out requests reached Vercel SSO protection, so the Preview check verifies deployment identity and readiness. A signed-in application smoke test remains pending.

## Evidence for the defense

[Phase 3 local rehearsal](defense-phase-three-2026-11-22.md) covers the exact birthday boundary, walk-ins, QR expiry and revocation, check-in and checkout, payment reconciliation, and Housekeeping handoff using synthetic local records. It also records the Gemini fallback and role-change checks. A signed-in rehearsal against the deployed defense version and a physical QR scan remain pending.

For the manuscript, tie the screenshots and test counts to the completed deployment evidence. Report forecast scores with their model version, period, baseline, and matched sample size. The current manuscript and adviser-approved BCP format have yet to be supplied.
