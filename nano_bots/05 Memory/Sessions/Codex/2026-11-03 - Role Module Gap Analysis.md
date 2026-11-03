# Role Module Gap Analysis — 2026-11-03

User requested analysis of missing modules/functions by assigned role. Read-only source audit; no runtime changes or tests.

Deliverable: `docs/ROLE-MODULE-GAP-ANALYSIS-2026-11-03.md` covers all eight roles and separates confirmed incomplete workflows from optional scope.

Verified source findings: cash close UI suspended while drawer-less payment bypass remains active (backend close path still exists); PO receipt finalizes even partial quantities; Housekeeping authorized to receive but excluded from listing/UI; Staff & Duty has no roster model; asset service dates do not create work orders; general guest-request withdrawal endpoint not found; production review fallback can show sample reviews under real-stay messaging.

Optional additions: roster/handover, Lost & Found, linked PM work, linen management, formal business-day close. OTA/group booking/full accounting require separate scope decisions. Existing booking, payment, PO, loyalty, rate-plan and asset modules must not be reported as absent based on obsolete lack-of-system notes.

Limits: no live DB/migration ledger inspection, signed-in acceptance testing or deployment verification. Preserve role separation and existing unrelated working-tree changes. No implementation authorized by this analysis request.

Follow-up: user requested a draft improvement plan. Delivered
`docs/ROLE-MODULE-IMPROVEMENT-PLAN-2026-11-03.md`: baseline verification, cash,
PO receiving, guest trust/withdrawal, roster/handover and linked PM, conditional
Lost & Found/other extensions. Includes role boundaries, acceptance criteria,
data compatibility, rollout gates and proposed business decisions. Noted
SYSTEM.md §7.15 draft-only purchasing vs implemented submit/receive drift for
resolution before expansion. Documentation only; no runtime changes or tests.
