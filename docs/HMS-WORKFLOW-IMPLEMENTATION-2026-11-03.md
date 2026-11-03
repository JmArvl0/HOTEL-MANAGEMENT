# Approved HMS workflow implementation — 2026-11-03

Follow-up QA found two P1 draft-state defects and one P2 cash layout defect. All three were subsequently fixed locally; see [QA report](HMS-WORKFLOW-QA-2026-11-03.md) for verification and remaining coverage limits.

Status: implemented in the current local application; eight scoped migrations applied to the configured Supabase database. No Git push or hosted application deployment was performed. The approved prototype remains an isolated reference.

## Delivered behavior

| Workflow | Application and database changes |
|---|---|
| Stock | Shared Inventory screen with supply selection, issue/count form, real movement history and read-only oversight. Quantity, movement, operation key and audit save together under locks. Shortages, conflicting retries and stale physical counts fail without partial writes. Generic quantity PATCH is blocked. |
| Request supplies | Housekeeping task completion and direct department request completion use one source-locked consumption operation. The old best-effort JavaScript deductions/name guessing are retired. Unmapped legacy supply requests require review instead of inferred deductions. Existing cleaning/readiness rules remain in their protected RPC. |
| Cash and billing | Existing shared drawer repair reused. Collection now commits payment, folio update and immutable receipt together. Payment forms preserve entries and stable retry keys. Physical drawer count starts blank, shows expected/variance, requires an explanation for a difference and retains it for Accounting. Opener/Accounting closure rights remain unchanged. Collection-based dashboard labels say net collections. |
| Profile and ID | Guest/account edits use one canonical-account-link RPC with an audit and no historical reservation rewrite. Read errors are surfaced. Uploaded ID review requires the exact latest document and saves document/reservation results together. Replacement upload invalidates the reservation's previous verification. Front Desk retains the separate on-site identity check and private document access. |
| Requests and handover | Own pending-line withdrawal is reused and hardened against approval/work races. New department tasks/orders are created after approval. Withdrawal cancels untouched, unassigned legacy work in place and refuses assigned/started work. Handover has a standalone screen/API, department scope, named owner, source validation, filters, acknowledgement, resolution, versions and audit; no roster dependency. |

New shared UI files: `stock-integrity-panel`, `cash-count-panel`, `payment-collection-dialog`, `uploaded-id-review`, `operational-handover-panel`, and `app/hms-workflows.css`. The dashboard shell and role boundaries remain shared. Guest profile and request pages use their existing guest shell.

## Database release manifest

Live baseline was re-read as `20261024130000` before numbering new migrations. Current deployed function definitions were inspected for affected existing routing/identity/cash behavior.

Applied with the official Supabase CLI `db push`, from `.tmp/hms-scoped-release`, after scoped dry-runs:

1. `20261103010000_restore_cash_controls.sql`
2. `20261103030000_guest_request_withdrawal.sql`
3. `20261103070000_cash_exception_review.sql`
4. `20261103080000_hms_integrity.sql`
5. `20261103090000_operational_handovers.sql`
6. `20261103100000_hms_cash_receipts.sql`
7. `20261103110000_request_supply_completion.sql`
8. `20261103120000_approved_request_routing.sql`

Final live ledger includes exactly these eight post-baseline versions. `scripts/hms-scoped-push.mjs` builds the allowlisted migration staging directory, refuses unexpected staged files and redacts connection information from CLI output. Credentials are read from the ignored local environment file, never written into release files.

Held and unapplied: unrelated `20261024140000`, partial receiving `20261103020000`, roster/bundled handover `20261103040000`, asset work `20261103050000`, Lost & Found `20261103060000`. Their pre-existing local source is preserved. The new Inventory screen does not load the held receiving UI/API; the new handover screen does not query roster. Lost & Found stays hidden in the navigation. The accidentally header-mounted cash/preventive panels were removed; Accounting's cash exception panel is in the proper content area.

**Do not blindly push the root migration directory.** The held `040000` bundled migration must be rebased/reconciled with the already-applied standalone handover before any future rollout. Do not mark held versions as applied to silence history checks. No historical inventory/payment corrections, profile merges, schedule backfills or external-system integration were performed.

## Verification evidence

- Fresh dedicated PostgreSQL database: **108 scoped migrations** applied from scratch, excluding the five held files above.
- **19 real PostgreSQL scenarios passed**: stock issue/retry/conflict/shortage/roles/stale count, failed movement rollback, atomic profile/audit rollback, existing profile uniqueness, paired ID review/replacement, both mapped fulfillment paths, pending in-house routing, legacy unassigned cancellation/assigned preservation, per-line withdrawal, payment/receipt retry, cash variance, standalone handover/version/roles, simultaneous issues, both payment-versus-close orders, and withdrawal-versus-approval race.
- Configured database compatibility counts before release: zero negative stock, duplicate account links, unresolved known legacy supply mappings and open drawers.
- Final configured-database smoke test passed inside an **always-rolled-back transaction**, including stock/retry/roles/profile/ID/handover, pending withdrawal/approval routing and available-drawer payment/receipt/count. No smoke fixture records remain. Held table checks returned null for roster, partial receipts, asset work and Lost & Found.
- `npm run typecheck`: passed.
- ESLint on new workflow components, routes and tests: no errors/warnings. Existing dashboard has two unrelated hook warnings; no new lint errors.
- Latest targeted verification: **48 tests passed**; earlier affected suites **120 passed**, followed by scoped HTTP/UI checks.
- Full suite: **2,100 passed / 1 existing failure**, `lib/password-reset-audit.test.ts`, a Windows CRLF-sensitive SQL text assertion. No recovery implementation/migration was changed.
- Final `npm run build`: passed with network access to the existing Google Fonts. The sandbox-only attempt failed fetching those fonts; the network-enabled build completed all 94 static generation steps.
- Real browser rendering of the actual stock, cash and handover React components using isolated fictional API responses at desktop, 820px tablet and 390px phone; no page-wide overflow or browser error logs. This fixture is under ignored `.tmp`, not an authentication bypass or live hotel-data view. Screenshot: `.tmp/hms-stock-component-render.png`.

## Remaining acceptance boundary

The in-app browser redirects `/manager_dashboard` to login; no signed-in session was available. A real signed-in walkthrough of Front Desk, Housekeeping, Maintenance, Accounting, Manager and Guest remains manual. Component fixtures and server/SQL tests do not establish that browser coverage. The application changes are local until the normal application deployment process is performed.

Review legacy unlinked/ambiguous profiles through an authorized resolution process; saves intentionally refuse an email-only claim. Legacy supply mappings are not guessed. Handover source navigation additionally checks the current actor's permitted destination. Counts and preview data in the approved prototype are not production records.

## Repeatable checks

- `scripts/prepare-hms-test-db.mjs`: creates a new allowlisted loopback-only scratch database and refuses to replace an existing one. PostgreSQL cluster is on loopback port 55439; test owner defaults to `haven_hms_test`.
- `scripts/test-hms-integrity.mjs`: actual transactions and multiple connections against the dedicated scratch database. `HMS_TEST_DATABASE=hms_integrity_verify2` selects the final fresh database.
- `scripts/verify-hms-live.mjs`: configured-database smoke verification with a guaranteed rollback; never run the local acceptance script against the live database.

UI skills: UI/UX Pro Max form guidance, approved taste direction and Impeccable local Operate/craft references. The Impeccable context engine was unavailable; fallback was disclosed. No subagents were used.
