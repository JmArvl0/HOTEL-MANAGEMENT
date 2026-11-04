# Cash & Shifts — Phase 1 design review

4 November 2026 · Asia/Manila · Proposal awaiting user review

No application files, database records, backend contracts, or production functionality were changed by this review. All new deliverables are outside the repository. The repository already had substantial uncommitted work; other work continued during this review.

## Evidence and scope

- Inspected the authenticated local Cash & Shifts screen in Chrome at `http://localhost:3000/manager_dashboard`. The observed session was Front Desk, light appearance, with no open drawer, 11 historical shifts, zero awaiting reconciliation, and ₱226,480.00 net recorded historical variance.
- Captured the actual existing screen as `cash-shifts-current.jpg` without altering its presentation. Opened the opening dialog to inspect its fields, then cancelled; no shift was opened.
- Read `SYSTEM.md` cash controls, `DESIGN.md`, current memory summaries, `components/manager/manager-dashboard-client.tsx`, `cash-count-panel.tsx`, `cash-exceptions-panel.tsx`, `team-operations-panel.tsx`, `lib/accounting.ts`, `lib/operations.ts`, cash-shift route handlers, and restored-cash-control migration source.
- The live open-drawer/count/reconcile states were not exercised against hotel data. Their existing behavior was inspected in source. Proposed examples are synthetic and explicitly labeled.
- The comparison assesses hierarchy and workflows, not a financial change between the two pictures: the existing capture is a closed-drawer state; the proposed initial view illustrates an active count draft.

## Current UI inventory

| Area | Existing behavior and presentation |
| --- | --- |
| Shell | Shared role navigation, header date, global search, shared drawer open/closed indicator, theme, notifications, account menu. |
| Structure | Two columns: a larger Accounting ledger area and a persistent physical-count panel. At ≤850px the count panel stacks after the ledger. |
| Header | “Cash & shifts”; accounting eyebrow; explanation of expected cash and immutable payments; Open cash shift action. |
| Summary | Four equal cards: Open shifts, Awaiting reconciliation, Recorded variance, Shifts on record. In the observed viewport the fourth card wrapped to its own row. |
| Search / filters | JSON-based text search across shift records, a matching-result count and clear-search behavior. No dedicated shift-state or date filter in this screen. |
| Table | Opened, Cashier, Location, Float, Collected, Expected, Counted, Variance, Status, Actions. Ten rows per page in the observed view; range and previous/next controls preserve the full history. |
| Active shift | The open record appears within the same historical ledger. Cashier, location and opening timestamp are present. Shift ID and elapsed duration are not primary visible fields. |
| Balances | Opening float plus net collected. Net collected is paid payments linked to the shift, with refund-purpose payments subtracted. Closed expected/count/variance are stored values. The inline count panel derives running expected from opening plus collected. |
| Cash in / out | The shift table combines incoming cash and refunds into Collected. There is no cash-movement list inside Cash & Shifts. Linked payment records are already in the accounting ledger. There is no generic cash disbursement/expense action. |
| Physical count | Independent nonnegative count, expected amount, computed variance, count note / variance explanation, Close shared drawer button. Count is blank initially and must be entered explicitly. A nonzero difference requires an explanation in the current count form. |
| Count ownership | A different drawer, operator, or role resets the physical-count draft. Only the opener or Accounting sees the close form; other staff see an explanatory read-only message. |
| Opening modal | Required opening cash float (default 0, nonnegative); optional cash point / location; Cancel and Open shift. One shared drawer can be open at a time. |
| Close action | A qualifying open table row has “Close & count”; this scrolls to and focuses the existing physical-count input. Closure itself posts from the inline form, with a stable retry key and preserved input on failure. |
| Reconciliation | Accounting alone receives Reconcile on a closed row. The notes dialog requires an explanation for a nonzero variance. A reconciled shift retains its original counted value and variance; reconciliation does not make it balanced. |
| Handover | Separate Operational Handover module. Cash shifts can be source records; handovers have a submitter, follow-up owner, submitted time, acknowledgement, resolution, version checks and department/role constraints. This is follow-up responsibility, not a cash-transfer ledger or financial-custody acceptance. |
| Historical exceptions | Separate Accounting-only unattributed-cash investigation workflow. Investigation does not attach old payments to arbitrary drawers or settle a variance. |
| Other reconciliation | External statement reconciliation is a separate Accounting section; it must remain distinct from drawer reconciliation. |

## What works

The screen already carries the essential financial evidence, full searchable history and status badges. The visible physical-count form avoids a hidden closing prompt, calculates the difference, preserves a retryable draft and explains its next action. Role gates and server-side cash arithmetic are established. Those behaviors should survive unchanged.

## UX findings

1. **The historical ledger consumes the operational canvas.** No dedicated current-shift focus makes staff search the history to understand the active drawer. On mobile, the physical-count panel comes after the full ledger.
2. **The split compresses a ten-column table.** In the actual screenshot, raw ISO timestamps and currency figures wrap within cells; the action edge is clipped in the table viewport. This increases the chance of misreading a cash amount or matching it to the wrong shift.
3. **Equal summary cards conceal priority.** The observed fourth card is orphaned on a second row, leaving a large empty area. A lifetime signed variance total receives similar or greater emphasis than an actual pending task.
4. **Historical variance is easy to misinterpret.** ₱226,480.00 is a net sum of closed/reconciled shifts, not today’s cash on hand, the active drawer’s difference, or an unresolved shortage total. Opposing variances can cancel in the net sum.
5. **Reconciled and balanced are different facts.** The actual table includes reconciled rows with substantial nonzero differences. Green reconciliation badges can imply financial agreement unless the difference remains visibly separate.
6. **“Collected” requires interpretation.** It represents incoming cash net of refunds; incoming and outgoing amounts are not separately visible here.
7. **Raw technical dates impede scanning.** Friendly Manila date/time display, a concise shift reference, and elapsed/closed duration would better support operations while preserving original timestamps in detail.
8. **Missing values need an explicit state.** The table money formatter coerces absent values to zero. An open shift’s unsaved count must be “Not counted” or “—”, never evidence of a ₱0 count or a balanced result. Stored expected cash and a running derived expected amount also need distinct presentation.
9. **Handover requires leaving the context.** Related follow-up is in another module, so a pending acknowledgement can be missed during closure. The cash screen should summarize only handovers the current user is already authorized to see.
10. **History and action scope are unclear.** A visible state filter can expose the closed shifts needing Accounting review without removing full historical access. Historical totals must state their time/scope and stay secondary.

## Proposed experience

The screen answers: “Who is responsible for this drawer, what should it contain, does the count agree, and what can I do next?”

- A primary current-shift surface groups owner, concise ID, opening time, duration and drawer status.
- Opening float, incoming paid cash and outgoing refunds form a compact supporting calculation strip.
- Expected, independently counted, and the explicit Short / Over / Balanced result form one connected financial group. Draft counts are clearly distinguished from the recorded count at close.
- A contextual primary action follows actual authorization and state: Open cash shift; Review count & close; View drawer details; Awaiting Accounting review; Reconcile shift; View reconciliation.
- Reconciliation is visibly separate from balance. A nonzero difference remains visible after review.
- Authorized handover follow-up sits alongside current operations on desktop and is signposted in the mobile attention message. The existing handover module remains the action destination in eventual implementation.
- The lifecycle follows the implemented financial order: Opened → Cash activity → Count → Close → Reconcile. Handover is parallel follow-up; it does not add a new required financial step.
- Cash movements reuse linked payments, showing time, purpose/reservation, reference, signed amount, status and honest staff availability. Refunds are the only existing outgoing cash category.
- Recent shifts are secondary. Search and a proposed local status filter make review work discoverable; full history and all current financial fields must remain accessible through details and pagination when implemented.

## Five design decisions

1. **Information hierarchy:** Current drawer first; expected/count/difference together; history and aggregate historical variance below current work.
2. **Scanability:** Owner and Open/Closed state sit above the cash comparison; the count difference is written in words; reconciliation and pending acknowledgement are separately named; one authorized next action leads.
3. **Visual hierarchy:** Tabular figures, right-aligned table amounts, readable dates, two-line identities, compact calculation labels, consistent spacing and restrained surfaces replace wrapping values and equal-priority summary cards.
4. **Operational clarity:** An unavailable count never becomes zero; reconciliation never erases shortage; a colleague cannot close the opener’s drawer; Accounting reviews only after close; draft cash remains independently entered; no new expense or transfer workflow is implied.
5. **Visual direction:** Warm alabaster and low-chroma ivory, forest action, charcoal text, brass details, sage agreement and amber review states. Red is reserved for recorded discrepancies. Playfair Display has the single heading job; Inter carries controls, labels and money. The existing shared navigation remains the integration boundary.

## Responsive proposal

| Width | Composition |
| --- | --- |
| Desktop | Current shift and handover/reconciliation rail, then full-width cash movements and secondary history. Preserve shared navigation behavior rather than adopting the prototype’s decorative shell as a navigation specification. |
| Tablet | Navigation folds; current shift spans the width; handover and reconciliation pair where each remains usable, otherwise stack. Tables retain readable columns and signed amounts. |
| Mobile | Owner/state → expected/count → explicit difference → authorized action. Supporting opening/in/out values follow. Movements become labeled rows, followed by handover and history. A pending acknowledgement remains signposted above. |
| Very narrow | Financial comparison stacks into a single column. Opening/in/out become key/value rows. No page-level horizontal scroll. |

Keyboard focus must remain visible. Dialogs return focus and support Escape and a contained tab sequence. Status meaning uses words alongside color. Forms retain explicit labels, nearby errors, explanatory requirements and touch-sized primary controls. The eventual implementation must retain draft preservation, retry behavior, loading/error states, 200% zoom, dark theme parity and the existing backend authorization checks.

## Recommended component hierarchy

```text
CashShiftsWorkspace (inside existing authenticated shell)
  CashWorkspaceHeader + contextual authorized action
  ShiftAttentionSummary
  CurrentShiftSummary / NoOpenDrawerState
    ShiftIdentityAndTiming
    CashBasisBreakdown
    CashCountComparison (draft or recorded)
    ExistingCountAndCloseForm / Review
    ShiftLifecycle
  ShiftCashMovements
  LinkedOperationalHandovers (existing visibility and actions)
  ShiftHistory (search, proposed local state filter, full paging)
    ShiftDetailDisclosure (all existing fields and audit notes)
  ExistingOpenShiftDialog
  ExistingAccountingReconciliationDialog
```

History stays out of the count form’s state. Count drafts remain keyed to drawer, operator and role. Shared API arithmetic and role gates remain authoritative; no new financial-state enum is proposed. “Count draft” and “Needs review” are presentation labels over existing data/state.

## Data boundaries for implementation review

- Existing ledger fields support the financial comparison, time/ID/duration, movement purpose/reference/status and local history filtering.
- Movement staff is **not selected in the current ledger payload**. The proposal shows a dash, never the drawer opener as a guessed receiver. Adding named attribution would require separately reviewing an additive read; it is not necessary to approve this layout.
- Handover data is not in `AccountingLedger`. An implementation can reuse existing authorized operations reads and navigate to existing handover actions. Do not infer a transferable amount or broaden visibility.
- Cash-in / refund-out can be derived from paid linked transaction rows in minor units, retaining the server’s authoritative final recomputation. Do not reconstruct closed financial truth from draft or historical display values.
- Current general expenses, financial custody transfer, denominations, recount persistence, new cash approval gates and arbitrary withdrawals are out of scope.

## Review gate

The interactive proposal is a design-review model, not application integration. User approval of the design direction is required before Phase 2. Approval does not by itself authorize schema changes, deployment, unsupported movement attribution or a new cash-transfer workflow.

## Verification and design critique

- Browser-inspected the isolated proposal at 320, 390, 768, 1024 and 1440px viewport widths. Final DOM measurements found no element extending horizontally beyond the proposal root at these widths. Fixed the narrow-phone history/movement grid overflow found during review. At the narrowest frame the financial comparison and history controls stack.
- Inter and Playfair Display were confirmed loaded in the browser. Sample cash totals assert in minor units: ₱10,000.00 + ₱28,420.00 − ₱3,500.00 = ₱34,920.00; counted ₱34,850.00 gives −₱70.00. Historical sample opening/net/expected amounts also assert.
- Manually exercised the preview: nonzero variance without explanation is rejected; editing count to expected produces Balanced; keeping a draft leaves the drawer open; changing operator clears the independent draft; a Front Desk colleague receives a read-only drawer view; a documented count closes into Awaiting Accounting review; Accounting reconciliation requires a variance note and retains the shortage; no-open-drawer state recommends opening; history filtering and no-results state work.
- Escape closes the preview dialog and focus returns to the triggering primary action. Mobile reading order follows the recomposed layout. This is not a complete screen-reader, zoom or accessibility certification.
- Measured selected palette contrast from the rendered CSS: primary text/surface 13.43:1; secondary text/ivory 5.27:1; warning text/tint 6.14:1; primary button text/forest 9.72:1. These checks do not certify every eventual integration state.
- Static design lint: 0 failures, 2 explainable warnings. Shadow is restricted to the floating dialog. Repeated em dashes are missing-data marks, including unavailable counts/staff, rather than prose punctuation. The skill's standalone automated browser inspector was not run; browser inspection used the available browser-control tools.
- Direction: Achromatic ledger, seed 1517677421, adapted to the user's pinned forest/ivory palette and existing Haven typography/navigation. Signature element: a connected cash basis/count/difference group. No stock media, illustration, chart or invented financial action was needed.
- Critique: the dominant financial group answers the drawer question; handover and reconciliation are individually named; signed amounts and differences agree; missing counts remain missing; phone navigation folds and tables become rows. History intentionally follows current operations rather than competing in the first viewport. Long production histories, dark appearance and authenticated backend behavior remain Phase 2 integration checks.
- No application typecheck, application tests, production build, database mutation or deployment was performed for this design-only phase. These are not claimed as passed.
