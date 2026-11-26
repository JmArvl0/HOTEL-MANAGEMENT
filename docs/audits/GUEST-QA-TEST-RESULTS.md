# Guest QA test results

November 24, 2026 · [Audit index](GUEST-EXPERIENCE-AUDIT.md) · [Evidence directory](evidence/2026-11-24-guest/)

## Environment

Tested the current shared working tree on Next.js 16.4.6, Node 22.22.2 and headless Microsoft Edge using Playwright. The fresh production build was `0O2Kq_X717eIC9pLezf1h`. Next.js, PostgREST 16.5 and PostgreSQL 18.6 ran on loopback. All 161 migrations replayed before the guest run. The database used synthetic rooms, accounts and dates. The browser blocked direct external requests. Provider API responses and wallet return were simulated, while Haven's HTTP routes, callbacks, records and database calculations ran normally. Storage fallback used a local fixture and SMTP was confined to a local test sink. No hosted application records, real payments or external notifications were used.

Screenshots contain only synthetic data. Input fields, confirmation references where designated and scannable QR images are masked. Network entries below use route patterns and contain no tokens or identifiers. Phone dimensions refer to desktop Edge viewport emulation.

## Browser and HTTP

Each row is one distinct guest expectation. Related assertions and tested viewport widths are grouped. Observations that passed their narrow validation assertions can still have a separate failed presentation expectation.

**51 browser and HTTP cases executed · 35 passed · 16 failed.** The follow-up backlog contains one blocked production acceptance group and five untested or partially exercised acceptance groups. The database test runner's blocked host-side group is tracked separately below.

| Case | Expectation and verified observation | Result |
| --- | --- | --- |
| B01 | Signed-out landing, gallery and booking policy render. Landing identifies the hotel and exposes the date planner. | Passed |
| B02 | Landing and room catalogue fit at 360, 390, 430, 768, 1280, 1440 and 1920 px. Measured document scroll width never exceeded viewport. | Passed |
| B03 | Signed-out My Stay returns to sign-in and signed-out checkout visibly explains that account access is required. | Passed |
| B04 | Same-day solo and next-day two-person searches show the sellable synthetic room and correct one-night estimate. | Passed |
| B05 | A 90-night search renders live supply, and a 366-night search falls back safely. | Passed |
| B06 | Past, reversed and identical dates and a party of nine are refused as availability queries. | Passed |
| B07 | Invalid search recovery preserves actionable context. Errors went to a short-lived toast and the date fields reset. GUEST-010. | Failed |
| B08 | Live catalogue opens numbered exact-room choices. Keyboard Enter, Escape and focus return work in the room details dialog. | Passed |
| B09 | A mixed-rate quote explains the amount. Display was ₱6,400 for two nights with `₱2,500 / night`. The total is correct. GUEST-004. | Failed |
| B10 | Unavailable online booking gives guests a clear assisted action. Exact room still showed Available while the disabled button said Unavailable. GUEST-002. | Failed |
| B11 | Privacy opens a privacy notice. It redirected to the booking policy. GUEST-003. | Failed |
| B12 | Short and mismatched passwords are rejected. The weak-password error is associated with its input. | Passed |
| B13 | A new guest account persists and resumes the selected exact room, dates, two guests and breakfast. | Passed |
| B14 | Breakfast toggle calculates ₱5,000 room-only or ₱6,800 with breakfast, with corresponding deposit/balance values. | Passed |
| B15 | Guest Details shows one current total. It shows ₱6,800 under breakfast and ₱5,000 as the sidebar Stay total. GUEST-005. | Failed |
| B16 | Pre-hold refresh preserves entered address. The field reset. GUEST-008. | Failed |
| B17 | Checkout shows the room, breakfast and conditional transportation. The hold froze ₱6,800 with a ₱2,040 deposit. | Passed |
| B18 | Payment choice updates payable amounts and mobile Maya payment returns to one pending reservation. Refresh leaves settlement pending. | Passed |
| B19 | Simulated provider completion changes the reservation to confirmed. Duplicate delivery leaves one payment and the folio at ₱6,800 total, ₱2,040 paid and ₱4,760 due. | Passed |
| B20 | Populated My Stay, reservation detail, booking history, payment history and portal modules render. Dark My Stay was exercised at 390 px. | Passed |
| B21 | Owned confirmation PDF emits a browser download and confirmed breakfast opens its dated pass. | Passed |
| B22 | Checkout transportation is filed after payment and shown in the portal under the owned stay. Fare remained unset. | Passed |
| B23 | A new structured service request returns 201 and persists against the stay. | Passed |
| B24 | Review a breakfast-stay date change. The restriction is enforced after submission with 409 and the stay remains unchanged. The guest entered details for a known ineligible action. GUEST-017. | Failed |
| B25 | Cancellation requires review and reason, updates the stay and frees the exact room. The repeat action is removed from the cancelled stay. | Passed |
| B26 | Confirmation distinguishes cancellation from expiry. A cancelled paid reservation displayed “This checkout has expired” and a retry-payment action. GUEST-013. | Failed |
| B27 | Confirmation preserves the original collected amount and explains cancellation accounting. The original ₱2,040 payment persisted, while a ₱1,020 folio application appeared as Amount paid. GUEST-016. | Failed |
| B28 | A profile update persists in the account and after reload. | Passed |
| B29 | A separate synthetic guest sees the reservation not-found view. The owned-document route and staff reservation API return 404 and 403 respectively for that guest. | Passed |
| B30 | Real guest shell interaction renews eligible session activity. The automatic activity POST returned 415. GUEST-007. | Failed |
| B31 | Mobile confirmation and the Express Pass remain readable at 390 px. The header split a word, the overlay covered a summary value, and the kiosk action wrapped almost letter by letter. GUEST-014–015. | Failed |
| B32 | The public, checkout and confirmation date format stays consistent. Payment/confirmation templates exposed raw date strings. GUEST-006. | Failed |
| B33 | Empty room media is labelled accurately and tolerates an unavailable image. A type without media showed an unlabelled stock image, and the checkout image broke under isolation. GUEST-009. | Failed |
| B34 | An owned active room hold can reopen the existing review from My Stay. The matching review opened from the featured hold card. | Passed |
| B35 | Release hold frees an owned active claim. The actual button returned HTTP 415 and the hold stayed active. GUEST-007. | Failed |
| B36 | An incorrect password is rejected and the reveal/hide control changes the field type as labelled. | Passed |
| B37 | An existing synthetic guest signs in and sees the empty My Stay with a Find a room action. | Passed |
| B38 | Signed-in guest edits both dates and the party size at 390 px. The submitted live search uses the new values. | Passed |
| B39 | A nonsensical profile phone receives 400 with guest-facing mobile validation copy. | Passed |
| B40 | Sign Out returns to the public site and clears the guest session. | Passed |
| B41 | At 390 px the homepage date picker opens via keyboard, closes with Escape and returns focus to its trigger. | Passed |
| B42 | A room in maintenance is no longer bookable. The last matching fixture room became disabled. | Passed |
| B43 | A zero-supply result offers a clear next step before the catalogue. The first visible results stayed as a list of priced, unavailable options. GUEST-018. | Failed |
| B44 | An empty registration request returns 400 and field feedback. | Passed |
| B45 | A syntactically invalid email returns 400 and email field feedback. | Passed |
| B46 | Invalid phone data returns 400 and phone field feedback. | Passed |
| B47 | A registration name beyond the configured maximum returns 400 and field feedback. | Passed |
| B48 | Names trim leading and trailing whitespace and preserve accented characters and curly apostrophes. Verified in PostgreSQL. | Passed |
| B49 | Registering a second time with a case variant returns 409. The synthetic account count remains one. | Passed |
| B50 | Landing completes one throttled mobile load. The page reached its heading and recorded navigation timings with a fresh context. | Passed |
| B51 | At 390 px a sentence-length cancellation reason stays within the stay card. The single-line badge extended beyond the card. GUEST-019. | Failed |

## Database

| Scope | Result | Evidence summary |
| --- | --- | --- |
| Schema replay | 161 migrated, 23 checks passed | OTP failure accounting, ownership, rates, deposits, age and room safety, plus related workflow regressions. |
| Exact-room claims | 9 passed | Concurrent exact-room hold, named room assignment, release, back-to-back stays, type/owner constraints, and replacement. The original runner attempted to reapply an already replayed migration. Its temporary audit copy used the existing final migration once. |
| Availability and amendments | 11 SQL checks passed, 1 host-side group blocked | Nightly capacity, competing front desk and website claims, manual/gateway parity, immediate and reviewed amendments. The runner's optional TypeScript shim lacked the current Fleet schema, blocking its assertions. |
| Xendit and transport | 18 passed | Last-room race, replay, amount/reference matching, late payment, expiry, failed and uncertain session creation, fare itemization and no duplicate ride filing. Uses SQL and synthetic provider evidence. |
| Breakfast | 6 passed | Room-only and optional/included offers, frozen rate/deposit, idempotent date entitlements, denial before eligibility and consumption limits. |
| Occupants and guest controls | 21 passed | Assisted and Express check-in controls, identity and arrival-date enforcement, paid walk-in constraints, invalid scan safety, and checkout state effects. These checks used role-scoped SQL fixtures. |

**88 completed database assertions passed.** The blocked host-side group is outside that count. PostgreSQL checks exercised local SQL functions and synthetic fixtures. Deployed-environment acceptance remains open.

## Network, console and performance

| Step | Observed status or measure |
| --- | --- |
| Account creation and NextAuth | `POST /api/register` → 201. Credentials callback and subsequent session returned 200. |
| Bodyless guest actions | `POST /api/auth/session-status` → repeated 415 on real interaction. `DELETE /api/booking/holds/[token]` → 415 from Release hold. |
| Booking and settlement | Hold creation succeeded through `/api/booking/holds`. Wallet initiation and simulator settlement succeeded through `/api/booking/payments/xendit` and `/api/webhooks/xendit`. The confirmed view and folio were reread. |
| Follow-up actions | `/api/account/profile` PATCH → 200, `/api/account/requests` POST → 201, breakfast change POST → 409, and cancellation preview and mutation → 200. |
| Ownership | The second synthetic guest received a not-found view through a 200 streamed shell. Document endpoint → 404 and staff reservation endpoint → 403. The protected stay was absent. |
| Browser console | Several intentionally blocked remote requests logged `ERR_FAILED`. The actual same-origin 415 was separately captured. No screenshot or metric from aborted navigation was used as UI proof. |
| Landing navigation sample | Two 1440 px loopback observations were 45/223 ms and 98/762 ms for first byte/DOMContentLoaded. One fresh 390 px run with cache disabled and 150 ms latency, 200 KB/s down and 93.75 KB/s up recorded 160 ms first byte, 1,134 ms DOMContentLoaded and 6,016 ms load. These samples establish local observations only. |
| Design inspector | Edge inspection completed at 1440, 768 and 390 px. It flagged 14 px common mobile body type, 2 tablet horizontal scrollers, and a sticky-overlay sample in dining. Criteria such as cream palette, photo scrims and outlines are design-skill rules. The audit retains brand-compatible treatments unless guest evidence calls for a change. |

## Repository checkpoints

- Production webpack build passed at the candidate above, including Next.js TypeScript compilation. A separate `npm run typecheck -- --incremental false` also passed.
- Full Vitest passed **2,746 tests across 276 files**. The focused rerun passed **53 tests across six files**. These overlap and are separate from the real browser and database cases.
- Scoped ESLint across the reviewed guest, booking and proxy files returned **zero errors and one warning** for the existing session effect. No application source changes required a changed-file lint gate.

## Untested or blocked acceptance groups

| Group | Status / remaining scope |
| --- | --- |
| Production payment and payout | Blocked by the candidate's test-mode design and absence of an approved live rehearsal. Test provider cancel/failure/expiry, payout and settlement with an approved provider environment. |
| Browser staff lifecycle | Check-in and checkout guards were exercised in local SQL, but a single reservation was not walked through paired staff/guest browsers from check-in to issued checkout folio and history. |
| Account security and recovery | Recovery screen opened. Email verification, OTP login, password reset/change, policy expiry and session revocation end to end are untested in this browser pass. |
| Reservation and guest edge cases | Families with children and occupant data, many/one/no room types, fully occupied date ranges, maximum supported Unicode input and multi-tab checkout need additional browser acceptance. Maintenance and basic registration input validation were covered. |
| Guest services and money | Transportation acceptance/dispatch, ride cancellation, service approval/withdrawal, loyalty redemption, receipt email and actual refunds were outside the confirmed browser walkthrough. SQL covers a subset. |
| Full responsive/accessibility/performance matrix | Firefox, WebKit, physical phone, camera, screen reader, systematic contrast scan and network-throttled checkout remain open. Dark theme was checked on the populated dashboard. |

Evidence notes and observed gaps are linked from the master table. The browser counts in the index refer to this table. Harness setup retries and overlapping software tests are not additional guest passes.
