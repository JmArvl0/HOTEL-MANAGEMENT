# Guest My Stay redesign — 2026-11-14

## Request and implementation

Implemented the user's guest UI review direction in the existing Next.js app.
Preserved the extensive earlier working tree and existing booking/payment rules.

- Credentials forms navigate through a validated relative callback, avoiding a
  different NEXTAUTH_URL development origin while retaining booking intent.
- Arrival is visibly required with native validation, field focus and an inline
  message. Optional room preferences/transport are disclosures; contact fields
  are wider and the summary stacks below the form at narrower desktop widths.
- My Stay leads with actual current/upcoming reservations or owned active holds,
  photo, dates/guests, shared booking timeline, next action and payment summary.
  Submitted manual evidence and folio credit remain separate from verified paid.
  A hold suppresses the misleading no-upcoming-stay panel.
- Saved hold preferences are available on the dashboard and Requests without
  creating service work before confirmation. Hold expiry refreshes the overview.
- Shortcuts, recent updates and Front Desk help replace repetitive empty metrics.
  Stay guide reads published property/location content and configured policy;
  reservation-specific terms remain on the booking details.
- Guest headings/palette/buttons and auth context are coordinated. Room search
  is compact, with policy-based estimated deposits and aligned result headings.
- Unavailable checkout has retry, support, My Stay and hold-expiry guidance.
- Fixed a mobile selector that hid the bell because its wrapper shares the
  account identity class.
- Build found unsupported private exports in vehicle-type and payment-QR route
  files. Removed only their unused exports, preserving runtime behavior.

## Verification

Node22.22.2 typecheck, full Vitest2628/252, focused85/10 and isolated production
webpack build passed. Touched lint had0errors/one existing customer-shell hook
warning. Impeccable detector had no findings. Taste lint0failures/one false
positive for a selector hiding legacy eyebrows. The initial build encountered
Windows sandbox mkdir denial; an isolated retry passed after the export fixes.
Native route types were regenerated after the isolated build.

Real UI Review Test Guest browser flow: Deluxe King / Room101 / Nov20–22 /
two guests; missing arrival prevented submission and focused its inline error.
Arrival15:00 and quiet-room preference survived review and the temporary hold.
My Stay showed total/balance₱12,800, deposit₱3,840, verified paid₱0, room held,
the next action and saved preference. No reservation confirmation or payment.
Desktop empty/held account and narrow hold, drawer and checkout recovery were
inspected. Existing browser zoom meant the390px override measured about355CSSpx.
No overflow reported. Retry returned to unavailable checkout. Demo contacts were
labeled. Browser connection disappeared after the session tool update.

## Remaining verification

Final stay-guide/auth/search visual QA,320/768px, dark theme, physical devices and
confirmed booking receipt/change/cancel browser QA remain pending. Initial
full-page screenshot exports clipped content and misplaced a sticky header;
rejected and removed rather than presented as evidence. See
`docs/qa/my-stay-2026-11-14.md`.

No schema migration, configuration activation, payment, deployment, commit or push.
The temporary hold naturally expires. Earlier unrelated changes remain intact.
