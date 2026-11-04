# HMS workflow repair plan — 2026-11-03

Status: approved prototype implemented in local application source; eight scoped database migrations applied on 2026-11-03. Verification and remaining signed-in/application-deployment boundaries are recorded in [implementation evidence](HMS-WORKFLOW-IMPLEMENTATION-2026-11-03.md). The plan below preserves the original intended scope and acceptance criteria.

Basis: [HMS scope comparison](HMS-SCOPE-COMPARISON-2026-11-03.md). Current source includes prior local improvements; the last verified remote ledger ended at `20261024130000`. Remote state must be rechecked before implementation/deployment decisions. Earlier local tests do not prove current deployed behavior.

## Objective and boundary

Make four existing HMS workflows dependable, in this order:

1. Stock integrity: quantity and movement history agree.
2. Cash/billing: every hotel collection has correct drawer, folio and receipt records.
3. Guest profile and identity: related records save consistently and review results are truthful.
4. Requests and operational handover: pending requests and unfinished hotel work have a controlled lifecycle and accountable owner.

This release covers hotel supplies usage, guest billing, guest records and department coordination. Official HR schedules/attendance/payroll, Logistics procurement/vendor management, enterprise GL/AP/budgeting, broad asset management and restaurant POS are outside this plan. Existing unrelated work is preserved; no wholesale rollback or database deletion is proposed.

## Preparation — establish a compatible HMS-only release

This is a prerequisite, not a fifth business module.

- Re-read target files and working-tree changes. Classify each change as selected HMS repair, shared dependency, or held/outside scope.
- Read the current remote migration ledger and affected live function definitions before creating/numbering additive migrations. Do not recreate an existing RPC from an old file when its deployed body differs.
- Prepare a scoped release manifest. Reuse verified local cash, withdrawal and investigation work; do not rewrite it simply because this is a new plan.
- Review the pending migration set: cash `20261103010000`, request withdrawal `20261103030000`, and cash investigation `20261103070000` are candidates for this release. Separate handover from the roster bundled in `20261103040000` after confirming applied state. PO/procurement, preventive asset-work and Lost & Found additions are held for separate scope review. The unrelated admin-password migration is also excluded.
- Remove or isolate selected app-code dependencies on held schemas. Example: a retained Inventory page must not query held receipt columns/tables; the handover page must not require the HR-style roster table. Preserve the held implementation separately rather than deleting another task's work.
- Establish the current failing scenarios and a role acceptance checklist in a test environment. Keep existing historical stock, payments and guest records unchanged during discovery.

**Completion gate:** the selected app code can run against its intended schema; migration dry-run includes only selected work; dependencies on held modules are identified and resolved. Do not blindly push all pending migrations or falsely mark held files applied.

## Phase 1 — stock integrity

**Problem:** generic quantity edits log movements separately from stock updates; mapped guest-request consumption is recorded after housekeeping completion with errors suppressed. Concurrent updates can lose deductions, and a failed operation can leave only half its records saved.

**Work:**

- Replace the affected read → write quantity → write movement paths with protected database operations that save stock changes, movement and audit together.
- Use the actual current stock under a database lock/version check, not a browser-supplied old quantity. Record movement type, real item reference, quantity, actor, operational source and reason for corrections.
- Prevent negative stock, duplicate deductions on retries and stale count corrections. Use a stable operation key/source occurrence; distinguish replaying one issue from a genuinely separate issue.
- For mapped guest-request supplies, join the issue with the authorized fulfillment/completion operation in one transaction. Remove the best-effort duplicate logging path after the replacement is verified.
- Preserve the existing housekeeping/room-readiness rules. Ordinary cleaning tasks with no mapped supplies must continue normally.
- Proposed shortage behavior: refuse the mapped fulfillment confirmation with a clear shortage/correction message, without deducting below zero or falsely completing the request. An already physically performed service needs a documented stock exception/correction; never manufacture a replenishment to make the numbers pass.
- Replace legacy item-name guessing with explicit verified item links where possible. Ambiguous legacy mappings go to a review list; no guessed mass remapping.
- Audit possible historical discrepancies read-only. Any correction is a new reasoned adjustment, not an edited/deleted movement history.
- Make the UI show “saved” only when the complete operation succeeds; keep entered values and give a useful retry/refresh action on failure.

**Roles:** preserve authorized Housekeeping/Maintenance supply operations and Manager oversight. Guests cannot change stock. Do not grant new general CRUD access to Manager, Owner or Admin merely to implement a repair.

**Acceptance:**

| Scenario | Required result |
|---|---|
| Stock 10; two staff issue one each concurrently | Final stock 8 with exactly two valid movements |
| Same issue retried after a timeout | One deduction and one movement |
| Movement/audit save fails | No partial stock or mapped fulfillment completion is committed |
| Stock 1; staff requests 2 | Clear shortage result; no negative stock or false completion |
| Staff submits an outdated physical-count correction | Refuse/refresh rather than overwrite newer stock |
| Request has no inventory-linked fulfillment | Existing valid housekeeping completion remains available |

**Primary code:** generic resource inventory PATCH, `lib/inventory-movements.ts`, housekeeping completion, mapped request fulfillment and affected RPCs/triggers. Inspect all callers before retiring old helpers.

## Phase 2 — cash and guest billing

**Problem:** the deployed drawer-open typo was previously reproduced. Local fixes exist, but the complete live collection/closure flow is not yet verified. Hotel folio, receipt and cash records must agree through retries and concurrent actions.

**Work:**

- Revalidate and reuse the local drawer typo/locking fix against current live definitions.
- Preserve the one shared property drawer: opener or Accounting closes; Accounting reconciles; each collector is still identifiable. Signing out does not automatically close a shared drawer.
- Require valid drawer attribution for new paid cash; preserve electronic-payment methods and the existing gateway path.
- Verify payment → folio balance → receipt, including rounding, allowed overpayment behavior and existing refund/adjustment rules. Repeated submissions must not charge, credit or issue duplicate financial records.
- Verify expected cash, actual counted cash and variance. Serializing payment versus closure must include a payment that commits before closing, or reject it cleanly if the drawer is already closed.
- Preserve historical unattributed cash and reuse the Accounting investigation queue. Investigation notes do not silently attach money to a drawer, settle a variance or change payment totals.
- Label collection-based totals clearly as collections where that is what the calculation measures. Do not expand hotel billing into enterprise accounting.

**Acceptance:** open → collect → receipt/folio update → count/close → open next drawer works for allowed staff; no new drawer-less cash; retries do not duplicate totals; a concurrent close cannot omit a committed cash payment; electronic payments and existing policy-based refunds remain correct; unauthorized roles cannot execute financial actions.

**Primary code:** staff payment route, cash-shift routes/RPCs, billing views, receipt/folio generation and selected cash investigation work.

## Phase 3 — guest profile and ID consistency

### Guest profile

- Save account name, canonical linked guest details and audit in one controlled operation. If one required part fails, none of the change is reported as saved.
- Resolve the guest through an explicit account link. Review existing duplicate/unlinked records before adding any uniqueness constraint or backfill; ambiguous cases require a controlled resolution.
- Preserve frozen reservation/stay data. A guest editing their present profile must not rewrite historical invoices, receipts or identity snapshots.
- Refresh displayed account/guest data after success. Show real read errors rather than silently presenting unavailable profile data as blank information.

### ID verification

- For uploaded-ID review, require the intended document to belong to the reservation and still be eligible for review. Detect replacement/re-upload or another staff review while the page was open.
- Save reservation verification, document review result, reviewer/time and audit together. Do not return success after an unchecked document update.
- Preserve the existing valid on-site/manual ID check path without requiring every guest to upload a document. Record which review path was used.
- Keep review authority with Front Desk and existing protected document access. No automated face matching, new age-verification system or broader ID access is introduced.

**Acceptance:** a failed guest update leaves neither half saved; guests cannot edit another guest; duplicates are surfaced without automatic merges; profile edits preserve historic stay records; uploaded-ID and reservation states agree after review; stale/wrong-reservation documents are refused; manual on-site verification still works.

**Primary code:** `app/api/account/profile/route.ts`, canonical guest lookup, pre-arrival `verify-id` route, existing identity verification route/RPC and document-review workflow.

## Phase 4 — requests and operational handover

### Requests

- Reuse and validate the existing approval → department work → completion lifecycle and local per-line withdrawal work.
- Guest withdrawal applies only to their own pending/unaccepted line, using current state/version checks. Preserve its submission, withdrawal and audit history.
- Resolve concurrent withdrawal versus approval/work creation without cancelled requests acquiring orphaned tasks. A withdrawn line must not be reapproved as part of its batch.
- Accepted, in-progress or charged requests use existing staff coordination and approved financial correction paths; no silent cancellation or charge deletion.
- Present clear pending, approved, in progress, completed, declined and withdrawn states to the roles who need them.

### Operational handover

- Extract a focused handover screen/API from the broader local Schedule & Handover work. No official roster, attendance, leave or payroll dependency.
- Record the unresolved hotel concern, valid source record, department, follow-up owner and submission time. Add acknowledgement and resolution, with version checks and an audit trail.
- Limit staff to permitted department context; Manager supervises unresolved work within existing authority. Link to the source only when the actor is authorized to view it; do not copy full IDs or confidential financial details into handover notes.
- Support unread/unacknowledged and unresolved queues. Acknowledgement means the next staff member accepted responsibility; it does not complete the underlying reservation, room task or financial action.
- Reuse existing daily Front Desk reports as reporting evidence. A handover record does not replace or silently submit a daily report.
- Prepare the focused UI prototype using the current design system before wiring the final screen, and check desktop/mobile, keyboard access and loading/error/empty states.

**Acceptance:** own pending request withdrawal succeeds once; other guests cannot act; approved work/charges are preserved; concurrent staff actions produce one valid outcome; handover has an authorized owner/source; acknowledgement and resolution retain history; staff cannot access another department's restricted records; no HR schedule is needed to use the handover.

## Verification and release for every phase

- Use actual PostgreSQL tests for transaction rollback, simultaneous actions, retries and role checks. The existing isolated local test helpers can be extended; mocks alone do not establish stock/financial integrity.
- Run typecheck, ESLint on touched source, targeted Vitest and affected-role acceptance. Run full tests/build at release checkpoints. Report existing failures and environment limitations separately; do not call an attempted check a pass.
- Check API authorization directly as well as button visibility. Review Guest, Front Desk, Housekeeping, Maintenance, Accounting and Manager actions; confirm Admin/Owner governance boundaries remain intact.
- Apply additive migrations using `supabase db push` after ledger/function verification and scoped dry-run. Database compatibility comes before dependent app deployment. Do not edit applied migration history.
- Exercise the real signed-in end-to-end flow after release. Each phase is complete only when its acceptance cases pass in the intended environment, with honest remaining limitations documented.
- Prefer forward corrective changes for release problems. Never solve a rollback problem by silently restoring cash bypasses, bypassing inventory safeguards or rewriting historical records.

## Done criteria

The four workflows are complete when stock/history agree, guest payments/folios/receipts reconcile, profile/ID changes cannot report partial success, and requests/handover retain a valid accountable lifecycle. Selected app/database versions must match, role checks must pass, and held HR/Logistics/Financial/Facilities work must remain outside the release manifest.

The initial planning request did not apply changes. The later prototype approval authorized implementation; consult the implementation evidence above for current release state rather than treating the original planning baseline as deployed state.
