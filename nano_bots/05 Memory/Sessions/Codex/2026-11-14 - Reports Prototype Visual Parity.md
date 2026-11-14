# 2026-11-14 - Reports Prototype Visual Parity

## Scope

The user supplied the live Front Desk Reports DOM and said the production page
still did not resemble the approved Reports prototype. Compared the supplied
DOM, the `/prototypes/reports` Front Desk view, and the production component.

## Finding

The first production pass had matched the broad page sections but retained the
old visual system: boxed page header, icon KPI cards, an empty line-chart state,
and a second row of history KPI cards. The prototype uses an editorial header,
a joined metric strip, grouped vertical bars, a concise shift summary, and one
history panel.

## Changes

- Rebuilt the Front Desk page heading and action row to match the prototype's
  title, date picker, Export preview, and Generate preview order. The staff
  shell labels the module `Reports` so the page title is not repeated.
- Replaced four icon cards with a joined four-value metric band.
- Configured `AccessibleChart` to render grouped vertical bars for this report;
  existing charts keep their default horizontal orientation. The chart retains
  its accessible data table. The all-zero state shows each date and actual
  arrival/departure counts without invented bars.
- Reshaped the snapshot as a compact `Shift activity` preview and moved Export
  to the page header. Submission remains a separate Front Desk action.
- Removed redundant history KPI cards; inline status filters and the paginated
  immutable report table remain.
- Existing role checks, report endpoints, live snapshot data, review actions,
  and print behavior remain in place.
- Replaced legacy Front Desk teal/ochre CSS literals with the shared Haven
  brand/gold tokens after the FleetOps stylesheet guard exposed the mismatch.
- Updated the print/export regression assertion to use the current accessible
  `Export preview` button label.

## Verification

- `npm run typecheck` passed; ESLint with `--quiet` passed for the Reports
  panels, the Front Desk export test, and the affected dashboard clients.
- Targeted Reports/RBAC checks passed: 158 tests across nine files. The full
  Vitest suite passed: 232 files, 2,420 tests. The focused report/theme rerun
  passed: 37 tests across three files.
- The Impeccable layout detector returned no findings; `git diff --check`
  passed.
- Localhost browser review at desktop size confirmed the new header, metric
  band, compact zero-activity view, shift summary, inline history filters, and
  `Reports` shell label. Live data for the selected date had zero arrivals and
  departures; positive-value bar rendering was not visible in that session.
- Role-wide Playwright/browser QA was not completed: the runner's web server
  could not start alongside the existing Next dev process, and no Playwright
  Chromium binary was installed. The live browser check therefore remains
  Front Desk only; related feature and RBAC tests for the other roles passed,
  but their Reports pages are not claimed as browser-verified. No production
  build, deployment, hosted writes, commit, or push were performed.
