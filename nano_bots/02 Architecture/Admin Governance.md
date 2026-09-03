# HAVEN Admin Governance — Implementation Report

## 1. Executive summary
The provisional Admin baseline is implemented as a dedicated governance workspace. Admin manages staff identities, controlled role assignments, account lifecycle, secure recovery, room metadata, room types, future operational policy, audit history, and security events. Admin is no longer an operational super-user.

## 2. Scope analyzed
The implementation follows the supplied Admin workflow, data-flow, business-logic, RBAC, audit, security, and testing requirements. Existing authentication, fixed roles, Supabase service access, audit logs, room inventory, reservation snapshots, and application shell were reused.

## 3. Existing architecture findings
HAVEN already used one `user_accounts.role` value, code-owned permission helpers, server routes, service-role Supabase access, and security-definer workflow functions. No granular permission tables existed, so the implementation retains the fixed role catalogue and does not create parallel RBAC.

## 4. Data audit findings
`user_accounts` is authoritative for login. `staff.user_id` supports a staff-account link but legacy roster rows are not linked. Guest profiles remain separate through `guests.user_account_id`. Existing password hashes remain untouched. No embedded login-account array is introduced.

## 5. Role hierarchy
Owner is the highest executive governance authority, not a generic operational override. Admin is a governance operator. Manager oversees operations and approvals. Front Desk, Housekeeping, Maintenance, and Accounting execute their own workflows. Guest accesses only owned customer records.

## 6. Admin least privilege
`lib/permissions.ts` gives Admin no generic hotel resource access. Direct Front Desk and Maintenance route allowlists exclude Admin. The operational dashboard endpoint rejects Admin. The dedicated `/api/admin/*` surface is the only normal Admin server boundary.

## 7. Owner protections
Admin cannot create, alter, suspend, recover, or re-role Owner or Admin accounts. Self-deactivation and self-role change are blocked. The final active Owner cannot be deactivated or demoted. Owner alone may change the hotel timezone.

## 8. Account lifecycle
Accounts use `active`, `inactive`, or `suspended` status. The lifecycle trigger keeps the legacy `active` boolean synchronized. Staff creation is inactive and recovery-required; it never creates a shared/default usable password.

## 9. Staff account creation
The Admin API validates identity, department, employee reference, role, reason, and an idempotency key. One transaction creates `user_accounts`, links a new `staff` row, and writes an immutable audit event. Admin may assign Manager, Front Desk, Housekeeping, Maintenance, or Accounting only.

## 10. Role changes
Role changes are server-authorized, version checked, audited, and mirrored to linked staff metadata. Admin cannot promote anyone to Owner/Admin or modify protected accounts. Owner retains the broader controlled catalogue.

## 11. Status changes
Activation, suspension, and deactivation require a reason and expected account version. Self-lifecycle changes and last-Owner removal are rejected. Accounts requiring recovery cannot be manually activated before setting a secure password.

## 12. Session invalidation
Every account has `auth_version`. Lifecycle, role, metadata, and recovery mutations increment it. NextAuth re-queries the authoritative account on JWT refresh; inactive or recovery-required users receive a disabled session and lose their previous role authority.

## 13. Secure account recovery
Recovery uses a random 32-byte one-time token. Only its SHA-256 digest is stored. Links expire after one hour, previous unused links are invalidated, completion uses bcrypt cost 12, and the token becomes used atomically. Tokens and password hashes are not returned by Admin data APIs or audit payloads.

## 14. User metadata
Name, phone, department, and employee reference are centrally maintained with optimistic concurrency. Updates preserve the account identifier and business history, update linked staff metadata when present, and produce an audit record.

## 15. Physical room administration
Admin can change floor, room type, wing, designation, and administrative activation. Operational occupancy, reservation, Housekeeping, and Maintenance states are read-only in this workflow and remain owned by their departments.

## 16. Safe room deactivation
A room cannot be administratively deactivated while occupied, reserved, actively assigned, or attached to a pending, confirmed, or checked-in reservation. The operation is version checked and audited.

## 17. Room type configuration
Admin can maintain description, capacity, bed configuration, size, amenities, base rate, and future-booking activation. Existing room-type identifiers and historical reservation data are preserved. Configuration uses a monotonic version.

## 18. Operational policy
Admin can update check-in/out, no-show cutoff, ID rules, minimum age, cancellation thresholds, self-service modification window, early check-in, and inspection requirements. Invalid ranges are rejected. Only Owner can change timezone.

## 19. Historical snapshot behavior
Policy and room-type changes govern future transactions. No Admin migration rewrites existing reservation price, cancellation, or policy snapshots. The current booking/reservation snapshot architecture remains authoritative for historical obligations.

## 20. Audit and security views
The Admin workspace exposes recent administrative and account-security events from immutable `audit_logs`. Before/after data is retained for sensitive configuration changes without recording passwords, recovery tokens, or token hashes.

## 21. Admin user interface
The dedicated responsive dashboard contains Overview, Users & Staff, Roles & Permissions, Room Configuration, Room Types, Hotel Policies, Audit Logs, Security, and Admin Reports. It uses live Supabase-backed routes, universal theme support, and the collapsible brand-mark sidebar behavior.

## 22. API surface
Read model: `GET /api/admin/data?section=...`. Mutations: `POST /api/admin/users`, `POST /api/admin/users/:id/action`, `PATCH /api/admin/rooms/:id`, `PATCH /api/admin/room-types/:id`, and `PATCH /api/admin/policy`. Recovery completion is `POST /api/recover/:token`. Every Admin route revalidates the current database account.

## 23. Verification and quality gates
`lib/admin-governance.test.ts` verifies least privilege, protected accounts, active-session checks, fixed RBAC, hashed recovery, concurrency, room deactivation, policy history, auditing, and live UI wiring. The existing Accounting, Front Desk, Housekeeping, Maintenance, Manager, guest, and connected-workflow tests were aligned with the governance separation.

## 24. Deployment and operator handoff
Migration `20260901010000_admin_governance.sql` is tracked but is not applied remotely by this implementation step. Review the linked-project dry run, deploy pending migrations, then sign in as Owner to create or select an Admin. New staff accounts must receive their one-time recovery URL through a trusted channel. Never commit `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `NEXTAUTH_SECRET`, or generated recovery links.