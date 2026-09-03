# Auth & Permissions

Source: `lib/auth.ts`, `lib/permissions.ts`, `lib/types.ts`

## Authentication

- NextAuth CredentialsProvider with JWT sessions.
- Supabase `user_accounts` is the only login authority; passwords are bcrypt hashes and no embedded account map exists.
- Sign-in rejects inactive and recovery-required accounts.
- Every JWT refresh re-reads role, active state, `auth_version`, and recovery state. A version mismatch disables the token instead of silently refreshing its authority. Deactivation, suspension, role change, password change, or critical recovery therefore requires a fresh sign-in without rotating the global secret.
- Customer guards and mutation routes reject disabled sessions; the fallback `guest` token role never restores customer authority.
- Production requires a real `NEXTAUTH_SECRET`; service-role credentials remain server-only.

## Roles

`owner`, `admin`, `manager`, `front_desk`, `housekeeping`, `maintenance`, `accounting`, `guest`

## Authority model

| Role | Purpose | Mutation boundary |
|---|---|---|
| Owner | Executive visibility, Admin/protected-role governance, critical policy, Owner-level exception authorization | No routine Front Desk, Housekeeping, Maintenance, Accounting, or Manager execution |
| Admin | Routine account and application configuration governance | Dedicated `/api/admin/*`; no operational execution |
| Manager | Operational supervision, coordination, Manager-level exceptions | Does not execute departmental work or financial corrections |
| Front Desk | Reservations, room assignment, guest coordination, check-in/out, approved Front Desk exceptions | Protected Front Desk workflows |
| Housekeeping | Room-care ownership, checklist, completion, inspection | Protected Housekeeping workflows |
| Maintenance | Technical diagnosis, serviceability, repair, resolution | Protected Maintenance workflows |
| Accounting | Payment, folio, refund, shift, reconciliation, and document execution | Protected Accounting workflows |
| Guest | Owned reservations, folios, requests, and profile | Ownership-scoped customer routes |

## Read access

Owner retains broad executive read visibility through `/api/owner/*` and selected read projections. `canAccess` does not imply mutation authority. Generic resource POST/PATCH explicitly rejects Owner and Admin.

## Sensitive capabilities

Capability helpers separate financial visibility from financial execution, Manager review from Owner review, and executive oversight from departmental operations. Owner can view the Accounting ledger but cannot verify payments, process refunds, adjust folios, operate shifts, or issue documents. Owner-level exception authorization is followed by department execution.

## Protected governance

- Admin cannot modify Owner or Admin accounts.
- Owner can create and govern Admin accounts through secure recovery/invitation flow.
- Self-deactivation, self-role change, and removal of the last active Owner are blocked.
- Owner changes remain subject to optimistic versions, audit immutability, foreign keys, reservation conflicts, Maintenance blocks, and financial history.
- Owner/Admin APIs revalidate the current database account for every request.

## Secret protection

No application role can read password hashes, recovery-token hashes, session secrets, Supabase service keys, database credentials, or OAuth secrets. RLS prevents direct browser table access; privileged functions are service-role-only.