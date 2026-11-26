# RBAC Audit and Enforcement

Reviewed the existing eight roles and 210 API route files. Kept account
assignments and existing policy/approval workflows. The [audit and permission
matrix](../../../../docs/qa/rbac-audit-2026-11-23.md) records the role boundaries.

Approval filing now uses role and resource scope. Generic resources allow
only reads. Room Rack uses an audited reclean command. Department read models
and overview responses omit unrelated fields. Staff section eligibility uses
the same policy as the sidebar.

Verified TypeScript, ESLint with zero errors, production build, 266 focused
tests, PostgreSQL migration replay and eight-role SQL checks. Edge verified
synthetic sign-ins, direct route access, session revocation and guest hold
ownership. Full Vitest had 2,723 passes and one existing room-card styling
assertion failure.

Hosted work was read-only. The existing approval RPC matched source, the
ledger ended at `20261120040000`, and the pending approval queue was empty.
Release the app with migration `20261123020000` after hosted acceptance.
