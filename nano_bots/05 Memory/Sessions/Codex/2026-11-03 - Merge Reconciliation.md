# Merge reconciliation — 2026-11-03

User requested fixing the in-progress merge. Reconciled 22 files between local
74ebf4d and incoming 8581472; retained both workflows and the local QA fixes.
Kept incoming mobile/profile/font/hotel-operations changes. No DB mutation/push.
Both original handoffs archived verbatim, status sections retained. Local QA
Known Issues IDs moved to KI-018–020 to avoid incoming KI-014–017 collisions.

Verified typecheck/build; 139 targeted tests; full suite 2,239 pass / 2 Windows
exact-text assertion failures. ESLint has no errors; pre-existing hook warnings.
Installed incoming dependencies; current Node24 differs from requested Node22.
No browser/combined SQL replay claimed. See docs/MERGE-RECONCILIATION-2026-11-03.md.
