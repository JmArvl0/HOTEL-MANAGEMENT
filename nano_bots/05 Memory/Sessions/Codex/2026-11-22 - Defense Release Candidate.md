# Defense release candidate

- Built commit `91e910b7bda936b55c34ae05f04de9fbcb7193a6` from local committed baseline `e2514b8` with a scoped index. Preserved checked-out `main`, its index, and the separate booking-auth edits.
- Published `codex/defense-release-2026-11-22`. GitHub Actions run `44994296446` passed. Vercel Preview succeeded for the exact SHA and signed-out requests reached Vercel SSO protection.
- Configured hosted Supabase ledger has 155 matching applied versions. Read-only CLI dry-run listed `20261121010000` and `20261122010000` only. GitHub production fast-forward dry-run succeeded from `c7c7166`.
- User elected to skip staging. Production publication has a pending approval. See [defense release evidence](../../../../docs/qa/defense-release-2026-11-22.md).
