# Error microcopy audit — 2026-11-15

## Request and review boundary

Audit user-facing errors across Guest, Front Desk, Admin, Owner and operational staff interfaces, propose clear contextual wording and reusable error handling, then implement and verify. The user explicitly required the proposed audit/changes to be presented before application code modifications. This session completed the audit/report stage only.

## Verified deliverables

- `docs/qa/error-microcopy-audit-2026-11-15.md`: 82 reviewed rows (41 P1, 38 P2, 3 Keep), compatible centralized response/client strategy, role/field/outcome distinctions, implementation order and regression/desktop/mobile/accessibility acceptance plan.
- Matching report directory: full Markdown/CSV message inventory, reviewed CSV, dynamic handoffs, validator sites, historical SQL exceptions, eight isolated validation probes and file-fingerprint manifest.
- Scan: 723 files (575 non-test JS/TS files including root proxy; 148 SQL migrations), 2,314 static message/adjacent-feedback occurrences / 1,672 distinct strings, 243 dynamic handoff sites, 1,698 candidate validator calls and 1,027 historical SQL exception occurrences. Candidates overlap and include internal/machine/adjacent tokens; these counts are not defect counts or proof of runtime exposure.
- Checked all reviewed evidence locations, report-local links, CSV row counts and scanned source fingerprints. No application source or migration changed.

## Findings requiring implementation after review

Raw caught Error messages and default Zod text can bypass friendly fallbacks. Manager notify hard-codes success even for failures; Admin/Owner do not carry severity. Guest Xendit errors include provider-dashboard/test-key instructions. Cancellation/change, guest request/transport and walk-in paths need caught transport/response failures with truthful unknown-outcome recovery; some submissions mint a fresh retry key on every click. Toast auto-expiry does not promote queued messages. Payment polling bypasses its stop check on repeated rejected fetches. Upload parser exceptions are echoed by broad catches. Some server logging retains raw DB message/details/hint or whole error objects; this is a source-level risk, not evidence that secrets were actually logged.

Existing useful behavior is documented for retention: non-enumerating login copy, uncertain password/registration recovery, confirmation boundary warnings against duplicate payment, explicit guest flags kept private, payment receipt/retry guards, field associations and toast pause-on-focus behavior.

## Verification and limits

Eight probes reproduced default messages using installed Zod. The shell default was Node 24.21.0; probes were not an application checkpoint under required Node 22.22.2. Installed Next.js documentation confirms error boundaries correctly use `retry`; no change to `reset` is proposed.

No application implementation, new regression tests, typecheck/lint/full suite/build, rendered layout or screen-reader testing occurred. No hosted queries/writes, payment, email, migration, commit, push or deployment occurred. Previous sessions' passing tests/screenshots are not claimed as evidence for this proposal. Existing dirty-tree implementation work was preserved; Current Status, Decisions, Known Issues and SYSTEM.md were not changed for unimplemented plans.

## Next execution state

Present the report and proposed wording for user review. After review, implement the shared safe boundary and mapping first, migrate callers with contract compatibility, repair severity/field placement/retry feedback, add behavior regressions, and perform the report's desktop/mobile/accessibility matrix. Preserve prior validation repairs, Xendit authority, retired payment boundaries and production rollout constraints from the main handoff.
