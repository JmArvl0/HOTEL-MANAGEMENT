# Local Layout AI Placement Prototype — 2026-11-22

## User direction

The previous standalone preview replaced HAVEN's module contents with invented
cards and tables. Keep the current local module layouts and add only minimal AI
placement UI. The right-edge toggle opens an overlay without moving the module.

## Verified work

- Replaced the standalone preview page with a launcher for the real staff
  workspace and Guest portal. Staff review uses normal sign-in for each of the
  seven roles; Guest uses its existing separate concierge.
- Added one session-scoped, preview-only drawer to the shared staff, Owner, and
  Admin shells. It renders through a fixed portal and shows each account and
  module's purpose from a generated static copy of the 94-entry placement
  report. It has sample states, a simulated new-information control, manual
  Ask with scope refusal, Escape/close, and Exit Preview. It reads no hotel
  records and calls no Gemini or operational endpoint.
- Updated the canonical placement report and `SYSTEM.md` to distinguish this
  placement prototype from future real AI implementation. D-046 records the
  visual direction.
- `node public/prototypes/haven-ai-system-preview.smoke.cjs` passed. The new
  drawer's 3 targeted Vitest tests passed. `npm run typecheck` and the full
  `npm test` suite passed (245 files, 2,529 tests). An isolated
  `npx next build --webpack` completed. The ordinary Turbopack build could not
  create a Windows junction under sandbox permissions; the first webpack
  attempt also collided with the active `.next` output, so an isolated output
  directory was used and removed after verification.
- Browser QA confirmed the launcher renders and its staff button opens the
  workspace. A later authenticated Front Desk Room Management check verified
  the header ends at 60px, the drawer begins at 60px, and the toggle stays at
  90px in both states. The workspace remained 985px wide while the drawer was
  open. The toggle and drawer adjust to the rendered header height.
- Moved the collapsed guidance label below the Front Desk dashboard action row
  and added an X that hides only the label for the current module visit. The
  toggle remains fixed; leaving and reopening the module restores its label.
  Authenticated browser QA measured 31px clearance below Scan QR, New
  reservation, and Shift briefing, then verified dismiss and return. The four
  targeted drawer tests, typecheck, touched-file ESLint, and diff check passed.
- Aligned the toggle's top edge with that label at 160px on the Front Desk
  dashboard; both now clear the action row by 31px. Browser QA verified the
  toggle remains at 160px with the drawer open and closed, while the drawer
  still starts beneath the 60px app header. At 390px phone width, browser QA
  caught an overlap with Shift briefing; moving the pair below the stacked
  actions left 11px of clearance. Other phone modules remain to review.

## Next review

User reviews the staff drawer in signed-in local accounts, especially dense
modules such as Financial Documents, and at phone width. No live automation,
approval policy, or Stripe work follows until the prototype is accepted.
