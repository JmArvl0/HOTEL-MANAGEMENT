# Homepage Policy Snapshot — 2026-11-13

This report records the original layout. The follow-up removed the snapshot
from Home and kept Rooms & suites below the hero and booking form stage.

User requested the snapshot below Plan your stay, filling the first screen so
Rooms & suites does not appear in the same initial viewport.

## Result

The four highlights replace the collapsed booking-policy disclosure after the
existing booking form/party-size note. `BookingPolicySnapshot` and its item
builder are shared with the full policy page: percentage/fixed/disabled deposit,
hold duration, check-in/out and timezone remain settings-backed. The linked
homepage title opens `/booking-policy`; the document retains its own snapshot.
The room-selection page's existing detailed summary remains in use.

The hero stage is a flex column with minimum100svh. The photo takes the remaining
desktop space with height-aware title/spacing. The booking form and snapshot
retain natural height. There is no page-scroll lock, transform scaling, clipping
or clamping of text. Desktop uses a single highlight row, <=900px uses2x2 and
<=680px places each icon above its copy. Long content, short windows and phones
grow naturally. Existing photos, copy, date/guest search, room intent and
section navigation are unchanged.

## Verification

- Node22.22.2 production build, final standalone typecheck and ESLint on four
  touched TSX files passed. Own temporary generated-type entries were removed.
- Focused23/23 across four files, full2528/2528 across242 files passed. The
  full suite retains existing jsdom navigation/canvas notices. Real-rendering
  tests verify live nondefault snapshot values and the homepage policy link;
  booking form/intent and hero regressions remain covered.
- Impeccable detector returned `[]`. The user-specified ivory/navy/gold snapshot
  extends the existing system; no new generated artwork or CMS fields.
- Real in-app browser production measurements, scrollY0:

| Viewport | Snapshot bottom | Rooms section top |
|---|---:|---:|
|1900x945|925|945|
|1440x900|880|900|
|1366x768|748|768|
|1280x720|700|720|
|1024x768|748|768|

All five have no horizontal overflow and the hero image loaded. Development
checks at768x1024,390x844 and320x740 retain horizontal fit and natural flow;
phone snapshots continue below the stacked form rather than shrinking text.
The development date dialog opens inside the viewport and Cancel closes it.
The production snapshot link opens the full policy page, which still renders
four highlights. Returning home after the policy stylesheet loads preserves
the first-screen boundary. No headless suite or physical-device touch claim.

Final screenshots live in `.tmp/hero-policy-qa/`.
Local production preview: `http://127.0.0.1:3083/`.
No database write, commit or hosted deployment; unrelated concurrent planning
notes and source changes preserved.
