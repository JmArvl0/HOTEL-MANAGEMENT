# HMS Scope Comparison — 2026-11-03

User clarified HMS-only ownership within separate HR/Financial/Logistics/Facilities/Restaurant ecosystem, then requested comparison with current implementation. Analysis only; no runtime changes, tests or fresh remote check.

Report: `docs/HMS-SCOPE-COMPARISON-2026-11-03.md`. Existing reservation, housekeeping and admin workflows are substantial. Main HMS weaknesses: pending source/schema compatibility and cash release readiness; non-atomic stock/movement writes; partial guest-profile updates; pre-arrival ID review ignores the separate document-update result; pending request withdrawal/handover; reporting terminology and source-data quality.

Source evidence: generic inventory PATCH logs before updating; consumption reads/updates/logs separately and failures are swallowed after task completion. Profile PATCH writes account then guest separately. Verify-ID route returns success after an unchecked document update. Findings identify code-established failure risks, not observed corrupt historical records.

Do not count missing payroll, official rosters, GL/AP, procurement or restaurant POS as HMS gaps. Review previous local roster/PO/asset additions before remote rollout. Seven November migrations remain pending per last verification; do not blindly push them. No existing implementation removed.
