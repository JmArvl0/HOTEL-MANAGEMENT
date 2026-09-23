# 2026-09-23 - System Health Executive Dashboard Layout

## Outcome

IMPLEMENTED locally, all gates green. `SystemHealthView` is now a 3-tier
executive layout: header + 8-card infrastructure grid, automations × alerts
workspace, hand-rolled tablist ledger (migrations / payment / audit trail).

## Changes (4 files, no migrations)

- `lib/system-health.ts` — optional `gateway` (listening_test /
  listening_live / not_configured, presence + mode only) and `recentProbes`
  (safe columns, capped) fields. Unknown-first rule kept.
- `app/api/admin/data/route.ts` — `systemHealth()` derives gateway mode
  server-side from the PayMongo key prefix (key never leaves the server)
  and selects the last 10 audit rows (action/entity/at only).
- `components/admin/admin-dashboard-client.tsx` — rewritten
  `SystemHealthView`: `System Health & Infrastructure` header + `Run Health
  Probes` (`RefreshCw`); 8 `metric-card` articles (`Database, Cpu,
  HardDrive, Mail, Globe, CreditCard, Layers, CheckSquare` icons);
  automations table + alerts panel (drift, unreachable, test-mode,
  domain, issues); keyboard-navigable tabs (`ArrowLeft/Right/Home/End`,
  `hidden` panels, zero refetch — single `data` prop). Deployment stays
  honest `Unknown`; email stays Resend-presence; last-run stays `Unknown`.
  `PaymentHealthPanel` reused unchanged as Tab 2.
- `components/admin/system-health-view.test.tsx` — 16 tests: header +
  trigger, 8-card grid, alerts, ledger rows/count, debounced search,
  tab switching without refetch, arrow-key nav, drift/unreachable,
  shape-safety, extended facts, Unknown fallbacks, issues, gateway
  states, zero-emoji, no-secrets.

## Honesty notes

Spec example values (`116 ms`, `84/86`, `Listening`, `Test mode active`,
`🟢/⚠️`) were placeholders: all values render live from the payload;
gateway mode is the only newly derived fact (server-side prefix check).

## Gates

typecheck clean · eslint 0 errors (2 pre-existing warnings) ·
**159 files / 1759 tests pass** · build green.

## Pending

Manual browser QA (KI-005). No migration to push.
