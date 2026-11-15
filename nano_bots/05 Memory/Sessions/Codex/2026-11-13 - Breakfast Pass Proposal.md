# Breakfast Pass Proposal

Date: 2026-11-13. Guest UI proposal only.

User requested a modern premium separate breakfast QR and clarified where guests
would find it. Extended the existing guest plan with a dedicated breakfast-purpose
token and owned guest route: My Reservations → stay → View breakfast pass.
Existing check-in QR remains separate; no current QR code or route was changed.

Created the interactive design at:
`C:/Users/Mark Rowell/.codex/visualizations/2026/11/13/01a1d498-2ae6-7840-adc8-083dea20424f/haven-breakfast-pass.html`.

The design extends the existing ivory/forest/gold Inter/Playfair identity. It
includes reservation entry, a photographic guest breakfast ticket, date selection,
remaining-meal states and a matching restaurant lookup/confirmation screen. The
existing generated breakfast concept is reused, disclosed, and embedded as a
compressed derivative; its source provenance remains in
`public/website-samples/dining/README.md`. Sample QR decodes only to harmless
non-redeemable preview text. No real guest data, credentials or network calls.

Verified with executed jsdom checks: navigation/entry, service-date coverage,
scan without consumption, one guest first, fresh verification before another
redemption, full usage, repeated clicks/scans, future allowance, wrong reference,
unavailable connection, persistence and unique IDs. Verified the sample QR decode.
Detector warnings prompted scanner padding and caption/narrow-header fixes.
Final detector returned `[]` (exit 0) after those fixes. No browser-rendered layout,
camera, restaurant API, database atomicity or actual entitlement was verified.

No production application change, schema migration, DB write, deployment or Git
commit. The plan now describes the restaurant integration boundary and token
scope, but no integration has been built. Existing unrelated work preserved.

## Optional image download follow-up (2026-11-13)

User preferred a saved image containing the QR, with downloading optional.
Added Download pass image beside the pass, explicit optional copy, an exact saved
image preview and two date-specific PNG samples. Upcoming confirmed entitlements
may be saved in advance while restaurant eligibility is enforced at service.
Images show original coverage/date/hours/venue/reference, with no stale live
remaining-meal claim. The production plan specifies stable purpose/date-bound
tokens, revocation, server verification, mobile download semantics and no automatic
download. No actual financial/QR code was changed.

Generated sample PNGs in the same authorized thread folder:
`haven-breakfast-room-301-2026-11-21-preview.png` and
`haven-breakfast-room-301-2026-11-22-preview.png`. The helper
`make-breakfast-pass-images.mjs` renders the code-native pass layout from the
existing generated breakfast concept plus non-redeemable sample QR data.

Inspected the exported 21 November PNG. Executed verification: both exported
900×1360 PNGs and their390px derivatives decode to the correct harmless date-
specific QR payload; embedded download bytes match their files; date/filename/
preview switching, partial-use download, consumed current-date hiding, future
download availability, old image stability, prior redemption flow, unique IDs,
script syntax and no network calls pass. Final detector returned `[]` after
adding a real image thumbnail fallback. Inline fragment remains below1MB.

Actual browser download delivery, Photos saving, browser layout, camera and real
restaurant redemption remain untested. Application/schema/database/deployment
are unchanged. Another session's new Homepage policy snapshot handoff was
re-read and preserved before adding this download follow-up.
