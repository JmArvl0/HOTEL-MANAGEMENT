# 2026-09-23 - Selfie-Gated Password Reset & Admin Audit (D-027)

## Outcome

IMPLEMENTED locally, all gates green. Recovery completion now requires a
staged identity selfie; a self-service forgot-password + OTP flow exists; a
`password_reset_logs` ledger records every attempt; Admin Governance gains a
Password reset audit section with signed-URL selfie inspection.

## Files

- `supabase/migrations/20261022010000_password_reset_audit.sql` — ledger
  table, `recovery-selfies` bucket, `complete_account_recovery` 3-arg
  overload (`SELFIE_REQUIRED`), OTP purpose `password_reset`.
- `app/api/password-reset/request|verify/route.ts` — generic responses,
  5/hr/email cap, token rotation, link email.
- `app/api/recover/[token]/route.ts` + `selfie/route.ts` — blocking selfie
  (re-download + re-sniff + RPC path-shape check), failed-attempt marking.
- `app/(auth)/forgot-password/page.tsx` +
  `components/auth/forgot-password-form.tsx` — email → code → link-sent.
- `app/recover/[token]/page.tsx` — camera (`user` facing, blocked/
  unavailable/insecure states) + upload fallback, canvas compress ≤1280px.
- `app/api/admin/data/route.ts` (`password_resets`), `app/api/admin/
  password-resets/[id]/selfie/route.ts` (60s signed URL).
- `components/admin/admin-dashboard-client.tsx` — `password_resets`
  section + `PasswordResetAuditView` (cards, status filter, ledger table,
  preview `Modal`).
- Tests: `lib/password-reset-audit.test.ts` (23), `admin-views.test.tsx`
  +3, `staff-sidebar-groups.test.tsx` module list updated.

## Gates

typecheck clean · eslint 0 errors (2 warnings: 1 pre-existing, 1 signed-URL
`<img>` same class as repo) · **159 files / 1753 tests pass** · build green.

## Pending

- `supabase db push` (migration not applied remotely).
- SMTP must be configured or the self-service flow fails closed (503).
- Manual browser QA (camera flow, KI-005).
