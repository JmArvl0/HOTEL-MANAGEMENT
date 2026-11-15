# Enterprise Workflow Contracts — 2026-11-04

## Request and scope

User said “do it” after the Task 3 explanation. Continue roles-first documentation
from Task 2. PayMongo remains deferred and the earlier hosted rollout stop stays
in force. One agent, no delegation. Existing dirty runtime/test files preserved.

## Prepared result

- Added `docs/integrations/ENTERPRISE_CONTRACTS.md` with proposed Finance, HR,
  SCM, Facilities and Fleet workflows. References the existing Restaurant
  proposal without duplicating its API/schema definition.
- Defined Facilities incident through verification/reopen, preventive scheduling
  and independent Hotel room blocks. Defined SCM requisition through partial
  receipt, rejection, return and Finance invoice matching, with UOM/location and
  one stock authority/effect.
- Included saved acknowledgments, status queries, exact retries, changed-payload
  conflicts, stale events, corrections, separate occurrence/receipt/posting/
  accounting dates, reconciliation, controlled fallback and adoption triggers.
- Recorded six partners with 11 readiness items each, all Pending, a role-based
  acceptance template and 15 future runtime acceptance scenarios. Preserved
  current transport assignment-time charging until an accepted cutover.
- Linked the document from the ownership register and plan. Updated the QA
  register and current memory without recording any unaccepted decision.

## Verification and limits

147 content assertions passed for table widths, local links, ownership IDs,
readiness states, ordered scenario IDs and required scope terms. Manual review
used Task 3, audit Part 7, the ownership register, Restaurant proposal and relevant
SYSTEM behavior. `git diff --check` passed, with only a pre-existing CRLF notice
for the refund test script. No runtime behavior changed, no new automated runtime
or browser testing was performed, and no migration or release was attempted.

The document is prepared for authorized role review. All partner readiness and
sign-off remains pending. G1 is not yet accepted. Runtime adapters and real
partner evidence belong to their conditional implementation tasks. Names can be
added later, and roles alone do not constitute approval. PayMongo stays deferred.
