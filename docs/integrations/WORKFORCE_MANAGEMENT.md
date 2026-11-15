# Workforce Management integration — Haven side

Prepared 14 November 2026. `haven-workforce-v1` is a **proposed Haven contract**,
not a claim that a partner API or connection already exists. The Hotel receiver,
employee mapping, availability view and automatic checkout assignment are local
implementation. Both connection and assignment default to off.

## Ownership

Workforce Management owns official shifts, attendance, leave and employment
availability. Hotel never writes those records or implements another time clock.
Hotel Admin/Owner own reviewed mapping to an existing Hotel account. Workforce
updates cannot create accounts, change roles, reset access or reactivate staff.
Hotel owns room tasks, current workload, checkout and inspection/readiness.

## Deployment and activation

1. Apply only `20261115090000_workforce_availability.sql` using a scoped
   `supabase db push` after checking the live ledger. Do not push unrelated
   pending migrations from the root checkout.
2. Agree the contract and property/source identifiers with the Workforce team.
   In Admin → Users & Staff → Workforce availability, set the exact source and
   property identifiers, then link each reviewed employee ID. IDs are scoped to
   source + property. Names and email addresses are never identity matches.
3. Configure these server-only Vercel variables using a new dedicated credential.
   Keep the receiver disabled until joint sandbox testing is ready.

   ```dotenv
   HAVEN_WORKFORCE_ENABLED=false
   HAVEN_WORKFORCE_CONTRACT=haven-workforce-v1
   HAVEN_WORKFORCE_INBOUND_TOKEN=<dedicated-random-token-at-least-32-characters>
   ```

4. Enable the receiver with `HAVEN_WORKFORCE_ENABLED=true` and deploy. Test with
   isolated employees and reservations. Confirm fresh events, clock-out, leave,
   break, cancelled/missing shifts, expired evidence and invalid credentials.
5. Enable automatic checkout assignment explicitly in the Admin Workforce panel
   with an audit reason only after the received evidence and mapping are reviewed.
   Enabling also distributes up to 200 pending checkout tasks. Later accepted
   updates continue the queue. Existing human assignments are preserved.

To stop automatic assignments, turn off the Admin assignment setting first.
Disabling just the receiver stops new evidence. Already accepted evidence remains
valid until its original expiry, for at most 15 minutes. There is no hidden
production credential or automatic partner activation.

## Inbound availability contract

`POST https://haven-hotel-management-ten.vercel.app/api/integrations/workforce/availability`

This is the intended deployment URL. It becomes usable after this change is
deployed and configured. HTTPS only in deployment. Send `Content-Type:
application/json`, `Authorization: Bearer <dedicated-inbound-token>` and
`Idempotency-Key: <eventId>`. Maximum body size is 8 KiB. No browser session is
used for this machine endpoint. Credentials are checked before any database call.

```json
{
  "contract": "haven-workforce-v1",
  "eventId": "d38e25d3-91bf-42a0-9a6d-3b9ddf4ab318",
  "sourceSystem": "workforce",
  "propertyId": "haven",
  "employeeId": "EMP-TEST-001",
  "version": 1,
  "observedAt": "2026-11-14T08:00:00+08:00",
  "validUntil": "2026-11-14T08:10:00+08:00",
  "employmentActive": true,
  "department": "housekeeping",
  "attendance": "clocked_in",
  "shift": {
    "startsAt": "2026-11-14T07:00:00+08:00",
    "endsAt": "2026-11-14T16:00:00+08:00"
  }
}
```

The example is historical test data and must use current times for a live test.
Every event is a complete current availability snapshot, including shift and
attendance. No salary, biometric record, home address or leave reason is needed.
The portable [JSON Schema](contracts/workforce-haven-v1.schema.json) describes
the wire shape. The time/version rules below are enforced in addition to schema
validation.

- `eventId` is a UUID unique within source/property. Retry the identical body and
  ID after network errors. Modified reuse returns 409. Exact replay returns the
  original outcome with `replayed: true` and never extends freshness.
- `version` is a strictly increasing positive safe integer **per employee**.
  Older versions are acknowledged as `ignored_stale_version`. A different event
  with an already accepted version returns 409. Higher versions cannot move the
  observation time backwards. Preserve the counter across restarts/remapping.
- All timestamps require an explicit offset. `observedAt` is when Workforce
  verified current availability, not merely a historical time-in timestamp.
  Clock skew up to one minute ahead is accepted. `validUntil` must be after the
  observation and at most 15 minutes later. Expired evidence is stored but never
  establishes eligibility. Refresh current evidence every five minutes and
  immediately after attendance, leave, schedule or employment changes.
- Departments use Hotel operational keys `manager`, `front_desk`, `housekeeping`,
  `maintenance`, `accounting`. Agree an explicit adapter if Workforce uses other
  codes. Department must match the local account role for eligibility.
- Attendance is `clocked_in`, `clocked_out`, `on_break` or `on_leave`.
  A shift is a start/end pair of at most 24 hours, or explicit `null` for no
  active scheduled coverage. A shift ending now is already outside duty.
- Unknown employee mappings return 404 without consuming the event. Map the
  account, then retry. Wrong source/property, malformed evidence or unsupported
  contract returns 422. Disabled/unconfigured receiver or temporary database
  unavailability returns 503. Bad credentials return 401. Oversize bodies return
  413. Retry transient 503s with backoff. Correct 4xx problems before retrying.

Successful response includes `outcome`, `replayed` and the number of checkout
tasks newly `assigned`. A 200 acknowledges evidence processing. It does not
guarantee an assignment if no eligible staff/task exists.

## Eligibility and assignment

Eligible means an active, recovered Hotel account, reviewed employee link, active
Workforce employment, matching department, fresh evidence, `clocked_in`, and
`startsAt <= current time < endsAt`. Login state, legacy staff status, current
task activity and the old local roster never substitute for Workforce evidence.

The database handles assignment in the checkout transaction. It considers only
Housekeeping accounts meeting eligibility. Workload counts every assigned
`pending`, `assigned`, `in_progress` or `deferred` Housekeeping task, across all
task types. Completed cleaning awaiting inspection is not ongoing cleaner work.
The smallest count wins. `random()` selects only among tied minimum counts.
Concurrent automatic selections serialize so the next task sees the first one.

No eligible staff leaves a normal pending, unassigned checkout task. New accepted
availability or explicit assignment activation distributes up to 200 pending
checkout tasks, priority then age. Repeated events do not duplicate assignments.
Only unassigned `pending` checkout cleaning is automatic. Guest-service tasks,
inspection, recleaning and manually assigned/started/deferred work retain their
existing protected workflows. Existing human claim/reassignment permissions stay
in force. The service records `workforce_auto`, a null human actor, workload and
the source event/version in assignment history and audit. It never impersonates
the cleaner or changes a room's readiness as a side effect of assignment.

Clock-out/expiry prevents new automatic work. Existing assigned work remains
visible for explicit handover/reassignment. Cleaning still requires completion
and, when required by policy, a passed inspection before room availability.

## Hotel UI and protected administration

- Admin → Users & Staff includes connection identifiers, explicit assignment
  toggle, reviewed employee linking/unlinking and an audit reason.
- Manager → Staff & Duty displays team Workforce availability separately from
  operational activity and workload.
- Housekeeping displays the signed-in employee's duty/shift and last update.
  Ordinary staff receive only their own employee evidence. Manager/Admin/Owner
  can read the operational team. No payroll/contact/security fields are returned.
- `GET /api/staff/workforce` is session-protected and non-cacheable. The database
  rechecks the active actor and scopes the result. Browser refreshes every 30
  seconds. Expiry and shift end are also reflected locally.
- `POST /api/staff/workforce` is Admin/Owner-only. Supported actions are
  `configure`, `link`, `unlink` with a reason. Settings require `expectedVersion`.
  Unlink requires the exact `linkId`, clears cached availability and preserves
  task/audit history. A new link always needs fresh evidence. Source/property
  cannot change while employee links exist.

New tables have RLS, no browser grants, and service-role read-only table access.
Only protected RPCs may write. Internal assignment functions are not granted to
the service role or browser roles. Keep the dedicated inbound token secret and
rotate it separately from Fleet, Xendit and Supabase credentials.

## Verification and partner handoff

Run `node scripts/workforce-integration-db-test.mjs` against the disposable
loopback test cluster. It clones the established migration template and drops
only its own generated database. Contract/HTTP/UI tests are in
`lib/workforce-*.test.ts` and `components/manager/workforce-panel.test.tsx`.
For the active HTTP flow, run `node scripts/workforce-http-db-test.mjs` with the
production build at `.tmp/workforce-build` and the local PostgREST executable at
`.tmp/breakfast-browser/postgrest.exe`. This signs in real NextAuth test accounts,
calls actual Next endpoints and uses real PostgREST/SQL on a disposable clone.
A loopback adapter supplies the Supabase REST URL prefix. Workforce messages are
simulated. The harness tests nine active scenarios, including checkout through
passed inspection, and stops its local services/drops its clone afterward. It
does not test the hosted Supabase gateway or an external Workforce provider.
For joint integration provide the Workforce API/webhook documentation, exact
employee IDs, source/property identifiers, department/status mapping, refresh
SLA and sandbox access. Production activation and hosted browser acceptance are
separate from local implementation and tests.

Browser acceptance remains pending because the chat's browser connection was
unavailable. Check at desktop and 390/320px widths before rollout: Admin mapping
and settings forms, Manager read-only team table, Housekeeping personal shift,
keyboard controls, contained table scrolling, stale/error states and existing
task actions. No visual or physical-device QA is claimed by the local tests.
