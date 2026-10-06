# 2026-10-06 - Capstone Title Traceability: AI Links + QR Scan-to-Act (Part 1+2)

No About page per user decision — the system proves the title while demoed.
AI advises, never executes (held). QR scope: housekeeping + maintenance +
kiosk. No migration, no new RPC, no RBAC change.

## Part 1 — AI visibly fed by forecasts, assisting flows

- `lib/ai/schemas.ts`: brief `priority_actions` gain optional `queue` tag
  (`BriefActionQueues`: housekeeping_tasks, maintenance_orders, inventory,
  guest_requests, transportation, approvals). Unknown tags fail closed
  (whole brief → unavailable state, existing invalid path).
- `app/api/ai/brief/route.ts` (`BRIEF_TASK`): instructs the tag, omitted
  when no queue fits.
- `components/manager/haven-ai-panel.tsx`: tagged actions render
  "Open {queue}" buttons via optional `onOpenQueue` (whitelist-checked;
  plain text without a handler); wired in `manager-dashboard-client.tsx`
  to `setSection`.
- One-line forecast pointers appended to the Housekeeping queue header and
  the Maintenance module subtitle (copy-only, no new fetch).
- Tests: new `lib/ai/schemas.test.ts` (accept/omit/refuse tag);
  `haven-ai-panel.test.tsx` (link navigates; no-handler renders text).

## Part 2 — QR scan-to-room-work + kiosk

- `app/api/qr/resolve/route.ts` (`resolveRoom`): housekeeping scans also
  return open task `[{id,status}]` (capped 20); maintenance scans return
  open order `[{id,status}]` plus due room assets `[{id,name,
  nextServiceDate}]` (active, due ≤ Manila today+7d or no history).
  Counts exact as before; guests/other roles unchanged.
- `components/qr/qr-scanner.tsx`: room CTAs read "Open Room N tasks/orders",
  show due-asset names, and pass the room number through `onCta`;
  `scanCta` pre-filters the target queue via `setSearchForSection` before
  switching section. Mutations stay in the queues (existing confirms +
  guards). Ruling: scan deep-links with room context instead of mutating
  from the scanner — one-tap task start would bypass assignment guards
  (e.g. TASK_ASSIGNED_TO_ANOTHER_WORKER) and needs per-item confirm UX
  the modal does not have.
- Kiosk: `check-in-qr.tsx` pass strip gains "Use Express kiosk"
  (`/checkin/kiosk`); kiosk + `express_qr_self_check_in` logic untouched.
- Tests: `lib/qr/tokens.test.ts` (ids per role, none for guests);
  `qr-scanner.test.tsx` (CTA label + `onCta` args); `check-in-qr.test.tsx`
  (kiosk link href + placement).

## Gates

`npm run typecheck` clean; eslint 0 errors (pre-existing warnings only);
full suite 185 files / 2062 tests green; `npm run build` clean (88 routes).
Note: `manager-dashboard-client.tsx` also carries other streams'
uncommitted work — my hunks there are the `HavenAiPanel onOpenQueue`,
`scanCta` room filter, and maintenance subtitle only. Not committed.
