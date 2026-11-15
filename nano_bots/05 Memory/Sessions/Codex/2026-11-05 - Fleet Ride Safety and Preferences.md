# Fleet ride safety and preferences — 2026-11-05

User revised the earlier mockup: photo optional, Fleet-issued vehicle plate and
shareable tracking link for trusted contacts, quiet ride/other preferences,
luggage and notes. Also requested updated instructions to send the Fleet team.
Single agent, existing dirty work preserved. PayMongo and hosted rollout remain
deferred. No Google OAuth was added; current registration already collects contact.

## Implemented locally

- Guest pickup-profile GET prefills account name/email and the unambiguous linked
  guest mobile when no per-ride profile exists. Editable for the actual passenger.
  Photo stays optional, including a complete create/prepare/send without it.
- Profile UI/API/DB capture QUIET_RIDE, HELP_WITH_LUGGAGE and COOL_CABIN requests,
  0–20 bags, luggage notes (300 chars) and ride notes (500). Preferences are
  requests pending accommodation, not an automatic charge or service guarantee.
- Additive migration 20261105020000 composes the existing ownership/version/photo
  writer in one transaction, attaches ride details through the shared outbox
  snapshot trigger, and projects allowlisted guest safety fields from APPLIED
  ordered inbox events in the original receiver transaction. No fare/local status
  RPC changes. Existing callers/triggers preserve rollback and invalidation.
- Fleet contract accepts assignment_reference and optional tracking {url,
  expires_at,assignment_reference}. Tracking needs a positive version, active
  ASSIGNED/IN_TRANSIT state, plate and matching assignment. HTTPS origin is
  explicitly allowlisted by HAVEN_FLEET_TRACKING_ORIGINS; blank withholds links.
  Create ACK requires both pickup_profile_accepted and ride_details_accepted,
  plus consistent original source references. Current Fleet needs these changes.
- Guest-only owner/current-actor/stay/trip scoped ride-safety API, no-store.
  Guest card shows Fleet plate/driver/vehicle, Track ride and Share ride. Refresh
  on foreground/30 seconds/profile change; expiry disables links locally. Native
  sharing has clipboard fallback. Errors remove cached links. New assignments
  replace old snapshots; completion/cancel/review/local changes remove exposure.
- Fleet still hosts GPS/public tracker and must revoke already-shared tokens.
  Haven cannot revoke a public Fleet URL by hiding it; machine update/revocation
  is still a partner dependency and activation blocker. No SOS dispatch feature.
- Delivered docs/integrations/FLEET_TEAM_RIDE_SAFETY_INSTRUCTIONS.md with complete
  request/ACK/callback examples, driver UI, public tracker scope/expiry/reassignment,
  synthetic joint QA and earlier read/update/cancel/fare/recovery obligations.
  Updated SYSTEM, D-036, Task 22 and integration/acceptance notes. Task 22 stays
  in progress; role/partner sign-off remains pending.

## Verification

- Node 22.22.2. Read-only hosted ledger checked before numbering: 112 applied,
  latest20261103150000. New migration remains local; no supabase db push.
- Fresh replay129 migrations + original SQL regression suite pass. Existing
  Fleet SQL26 pass. New fleet-ride-safety-db-test.mjs SQL14 pass: optional photo,
  atomic contact/preferences rollback, role/ownership/version, both-leg snapshots,
  assignment/replay/reassignment/stale/concurrent versions, completion/revocation,
  source isolation, no local fare/status mutation and browser-role denial.
- Focused Vitest80/3; full2,375/221. Final ACK ambiguity assertion is included in
  the final focused run. Touched ESLint0 errors/0 warnings; typecheck/build pass.
- Authenticated real Edge + real NextAuth/PostgREST/PostgreSQL, synthetic Fleet
  HTTPS receiver and locally intercepted tracking page. Contact defaults and no-
  photo save; quiet/help/cool/luggage/notes persisted; staff sees requests and
  both outgoing leg payloads; guest plate/link; new-tab tracking; share and copy
  browser API calls; wrong auth/another registered guest404; changed/stale event;
  unsafe-origin refusal; reassignment; client/server expiry; completion/revocation;
  stale-cache removal on failure. 390/320px and desktop, dark/light screenshots
  visually reviewed. No document overflow in tested 320px forms.
- OS share/clipboard were observed with browser-boundary test doubles to avoid
  sending real messages or touching the system clipboard. Actual iOS/Android
  share sheets, real Fleet map/GPS/token revocation and hosted storage are pending.
- Evidence ignored .tmp/fleet-safety/: baseline.log, replay.log,
  original-database.log, database.log, targeted-final.log, full.log,
  lint-final.log, typecheck-final.log, build.log, browser-verify.log,
  browser-extra.log and PNGs. QA tree and owned clone removed, PG stopped, only
  owned generated type paths restored. No commit/push/deployment/partner message.
