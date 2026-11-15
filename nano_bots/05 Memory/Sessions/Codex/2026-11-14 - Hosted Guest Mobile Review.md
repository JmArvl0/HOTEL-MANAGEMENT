# Hosted Guest Mobile Review — 2026-11-14

User requested guest sign-in and mobile exploration, then explicitly authorized
creating an account. Created one Mobile QA guest with synthetic contact details;
registration and automatic sign-in succeeded. No credentials recorded. Account
and signed-in preview remain available; no bookings, holds, payments, rides or
guest requests were submitted.

Reviewed hosted public booking and guest pages in an interactive Chromium
browser at 320×568, 390×844 and selected 430×932 viewports. Shared header title
overlap, clipped notification popup, registration country overlay/assets,
dated-search nav, narrow date fields, FAQ floating Top, and hosted auth screen
fit need attention. Main content reflows; calendars, room details, gallery,
guest drawer, tier comparison, support FAQ, profile and concierge open/close work.

Full findings, evidence and limits:
`docs/qa/mobile-guest-2026-11-14.md`. New-account empty states only for stays,
payments, rides and requests. Physical touch/iOS not tested. Hosted presentation
differs from local source. No application edits, source checks, deployment or
migrations in this session. Preserved the extensive pre-existing working tree.
