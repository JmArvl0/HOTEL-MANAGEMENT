# DESIGN.md — Haven Hotel design system (live)

The source-of-truth reference for the shipped UI. **Do not apply
`design-system/haven-hotel/MASTER.md`** — it is superseded (see `DESIGN-STATUS.md` F2).
This doc and `app/ui-primitives.css` are the current system.

**Guest My Stay (2026-11-14, local).** The guest account uses warm ivory, navy ink
and restrained brass accents. Compact page headings replace the navy banners.
One photo-led booking surface carries the actual room, dates, guests, booking
progress, next action, verified payments and saved preferences. Small linked rows
replace repeated empty metric cards. Controls retain the shared six-pixel radius
and 44px touch floor; room/card frames use 12px. The guest theme is scoped in
`components/customer/my-stay.css`; semantic status colors remain independent.
Narrow layouts stack the room/photo, use a two-column booking timeline and
stack the next action and supporting sections. Guest detail forms stack their
summary below the form at 1100px and optional requests/transport use disclosures.
Booking-related auth shows the room photo and summary on desktop and a compact
summary on mobile. Search and exact-room browsing use compact controls and
deposit estimates; the hold remains the pricing authority.
Desktop account and narrow hold/recovery renders were inspected. Final stay-guide,
auth, dark-mode and full mobile-matrix visual QA remain pending after browser
control became unavailable.

**Reservation checkout (2026-11-14, local).** The Xendit payment step follows the
user's supplied two-column checkout reference and Stripe's published payment
selector examples: a rounded Haven canvas, two logo-led GCash/Maya rows, an
explicit selected state, exact deposit and a wallet-specific continue action.
The existing authoritative stay summary appears alongside it at desktop widths,
with its room photo, dates, guests, total, deposit and remaining balance. Below
900px it stacks beneath the controls. Official locally stored wallet wordmarks,
native keyboard radios, 78px choice rows and a 48px action preserve usability.
Peso values never split across lines. The surface consumes the customer light/
dark tokens; sandbox labeling stays visible and no wallet/card credentials are
collected on Haven. Styles are confined to Xendit and its payment-stage class.

**Forgot password in sign-in (2026-11-13).** The login page swaps its form
for the email/code/reset-link states through `?view=forgot-password`, retaining
the photo, brand, header and compact policy footer. Back to sign in replaces the
account tabs and preserves the callback/booking intent. Essential recovery copy
sits outside the optional short-window description. Existing `/forgot-password`
links redirect here. Browser fit and switch/return pass at desktop 1366×768,
the default narrow preview and 320×568. Live email/recovery completion was not tested.

**Account screen fit and logo (2026-11-13, local).** Login and registration
use dynamic viewport spacing, paired name/password fields, a compact policy
footer and one account-access tab row. The photo/story stays alongside the
desktop form and is omitted at 900px and below; the narrow header carries the same
transparent logo as the landing page. Short windows reduce optional supporting
copy before reducing usable control sizes; targets remain at least 44px and
inputs 16px. Errors, zoom and expanded booking context retain natural scrolling.
The shared logo, loading mark, app header and browser icon use the cropped
landing asset without a white tile. Rendered screen-fit QA remains pending.

**Homepage scroll reveals (2026-11-13).** Below the hero, room cards, section
headings and the amenities, location, FAQ and closing content enter once with
a 900ms fade and 6px rise using the shared premium easing. The observer starts
just before the viewport edge to avoid a visible reset. Gallery retains
its own entrance. `HotelScrollReveal` observes section content within the
existing main element, including streamed Location content. Content is visible
by default. Reduced motion skips the effect and keyboard focus cancels an
active entrance. Initially visible content appears immediately.

**Breakfast pass (2026-11-13, local).** The guest reservation links to a dated
breakfast pass. The forest and ivory ticket presents venue, hours, covered guests,
current usage and the QR. The optional Download pass image action generates a
separate PNG with the same date and QR. The image presents the booked allowance.
Front Desk and Manager use a small service form with code entry or local PNG
reading and a distinct confirmation for recording meals.

**Homepage first screen (2026-11-13).** The photographic hero and Plan your
stay form share a stage at least one viewport tall. The hero fills the space
above the form. Rooms & suites and its decorative arch begin after this stage.
Narrow layouts let the stage grow with the booking form. The live snapshot
appears on the dedicated booking policy page, accessible from the footer.

**Booking policy (2026-11-13).** The supplied reference extends the existing
ivory/navy/gold Inter/Playfair system: centered title and italic subtitle,
four-item snapshot, 250px overview sidebar, open editorial policy sections,
thin gold dividers and a bell/flowers support panel. The screen-fit follow-up
uses height-aware spacing/type and a compact footer. The follow-up removes
Quick links and consolidates the three public policy links into one Booking
policy destination in the footer. At-a-glance
facts now use the freed sidebar space; short windows omit the repeated intro.
All three sections fit the tested desktop/laptop windows.
At 1100px and below, three keyboard-accessible tabs replace the section jump;
the snapshot stays two columns and the repeated sidebar is omitted. The current
631px-wide preview fits every tab without scrolling. Small phones/long content
retain natural scrolling and 16px policy text. Decorative leaves are reused; the
new still life has generation provenance in `public/decor/README.md`.
Focus rings and reduced-motion feedback remain explicit. See
`docs/qa/booking-policy-links-2026-11-13.md` and the screen-fit QA.

**Amenities & dining (2026-11-12).** The supplied reference owns this section:
centered Playfair heading, sprout divider, ivory/navy/gold palette, subtle
botanical artwork and wave linework. Arrow-free facility cards use a growing
two-column grid, stacking on phones; the forest-green dining photo card stays
top-aligned on desktop and follows the facilities on narrower screens. The
homepage section fills one viewport below the fixed nav, using height-aware
heading/card spacing. Short screens omit the optional flourish, dining icon
and, when needed, subtitle. Extra/long desktop facilities scroll within their
pane; tablets/phones scroll the combined content below the section heading.
The complete copy remains accessible by keyboard and native touch. Clicking
Amenities resets the content panes and keeps its nav underline. The
first eight enabled facilities are followed by a native View all disclosure
when needed. Full availability/fee descriptions remain readable without text
clamping. Dining imagery has a layered legibility scrim, and time values keep
their AM/PM together. The optional demo art is disclosed. The same component
fits the editor preview using container queries. See
`docs/qa/amenities-dining-2026-11-12.md` and
`docs/qa/amenities-screen-fit-2026-11-12.md`.

**Public navigation (2026-11-12).** A single gold underline moves to the
current section during page scrolling and anchor navigation. Desktop includes
FAQ; the drawer uses the same current-location state. The demo omits its
duplicate Contact shortcut. A navy Top button appears after scrolling and
returns focus to the brand, with instant scrolling for reduced motion. All
homepage nav targets reserve the header once through the root scroll padding.
The homepage header pairs its section links with Log in or My account. Plan
your stay carries the primary Check availability button.

**Before you arrive FAQ (2026-11-12).** The supplied reference is adapted to
the existing ivory canvas, with a centered Playfair heading, gold sprout divider,
botanical shadow, doorway outline and two closing wave lines. Gold icon shortcuts
open and focus native FAQ disclosures without filtering questions. The wide
accordion and compact support strip use Inter, visible focus and reduced-motion
fallbacks. Shortcuts scroll horizontally on phones; support actions stack.
The Contact Front Desk and Email us actions use the configurable Website Content
phone/email in both client and demo modes. Demo contacts are mock values, as
explicitly requested by the user.

**Homepage arrival and labels (2026-11-12).** The homepage skips the timed
startup splash. The hero copy is readable before client hydration and uses a
short position transition when motion is allowed. Booking labels use sentence
case, and the affected room, gallery and location labels use at least 13px.
The compact Rooms layout recovers space around the labels and actions.
The homepage goes directly from the hero/booking panel to Rooms & suites;
the former Make yourself at home introduction is removed. Rooms & suites and
Amenities & dining center both their headings and supporting copy.

**Public website backgrounds (2026-11-12).** The hero wave, homepage sections,
full gallery and public policy pages use the same warm ivory canvas. Brass
doorway outlines frame the room and gallery photography. Gallery linework can
cross section boundaries while the carousel stays clipped horizontally. The
closing availability panel overlaps the navy footer, echoing the hero booking
bar. Background accents are decorative and never capture pointer events.

**Location section (2026-11-12).** The supplied reference owns this scoped
ivory/green/gold editorial layout: centered Inter/Playfair header, a 1.52:1
photo/map pair, gold arc/chips/directions CTA and three photo-led highlights.
The map fills its entire rounded card; the user removed the address/action
footer. The homepage overview fits the viewport below the fixed header, sharing
the remaining height between the photo/map and highlights. The main pair stays
side by side above680px and stacks on phones; below1100px highlights use native
horizontal snap scrolling. Compact screens omit optional chips/subtitle, while
expanded photo notes and very short windows use normal page flow.
The photo layers share a grid and use
`overflow:clip`, preventing its oversized decorative arc from creating a
scrollable card when links receive keyboard focus. Saved property images,
client copy, native map controls and the full searchable guide remain connected.
A centered Explore Nearby Places button opens the ivory full-screen guide.
Desktop pairs a live area map with photo cards and a scrollable results pane.
Phones lead with the list and use a bottom View map / View list action. The
close control and Escape restore focus to the homepage button. Place cards with
map targets show a Show on map action, use a gold outline when selected, and
switch to the focused map on phones. Map reset restores the area overview.
See `docs/qa/location-reference-2026-11-12.md` and
`docs/qa/location-screen-fit-2026-11-12.md`.

**Inside Haven gallery (2026-11-12).** The public gallery follows the supplied
ivory/navy/gold reference: a 66% featured photo with side previews, category
pills, five thumbnails and position controls, restrained wave linework and a
centered full-gallery action. Exterior is selected first. The homepage gallery
fits one viewport beneath the fixed nav; the image takes the remaining height
after the heading and controls. At tablet widths the peeks narrow; phones use a
taller central image, scrolling filters/thumbnails and swipe. Short phones omit
the optional flourish/thumbnails; short landscape windows use normal page flow.
See full gallery opens a full-screen overlay over the homepage. All Photos is
selected initially, with three columns sized to show the nine demo photos
together on common desktop and phone screens. The grid scrolls when more space
is needed, and the close control stays visible. Category filters narrow the
collection. A selected tile opens the uncropped photo viewer. Photo credits,
Inter/Playfair, 44px controls, keyboard navigation, reduced motion and
the focus-contained full-screen viewer are part of the component. The untouched
fictional seed uses disclosed local concepts; edited/published client galleries
use CMS photos, categories and supporting captions. See
`docs/qa/landing-gallery-2026-11-12.md` and
`docs/qa/full-gallery-grid-2026-11-12.md`.

**Public hotel and Website Content (2026-11-11).** The hero places Playfair
display copy over a representative photo. The light Inter booking form sits
below the image. Its native dialog presents a date range without clipping, and
the room cards retain the search intent. Location now follows the supplied
photo/map/highlights reference described above. The account handoff
places the room, dates and party size above the form, with secondary details in a
disclosure. Owner/Admin Website Content pairs editor fields with a guest preview
and shows the published and saved values side by side before publication. See
`docs/qa/landing-audit-implementation-2026-11-11.md`.

**Front Office workspaces (2026-11-04):** Separate Room Management, Reservations
and Guest Management navigation entries. Room Management defaults to a full-width
seven-day room/guest calendar, with Cards as an alternate format. Its room column
and date header stay visible inside a horizontally scrollable frame; named stay
bars carry status/reference/dates, with distinct lanes for overlapping allocations.
Reservations opens the ledger directly, with four clickable shared summary cards
and an actionable Needs attention rail. Summary links navigate between modules.
List order is search → queue filters → scope/date controls → results. Dates stay
visible in both views when the selected-window scope applies; full history is
explicit. Rows expose stay dates/nights, payment/balance, advisory readiness and
the next authorized action. Room history lives in a collapsed details disclosure.
At ≤600px summaries use two columns and header actions wrap; at ≤760px the
attention rail leads with a bounded scrollable queue and the table scrolls inside
its frame. All styling is scoped to the reservation workspace; shared controls
and live business workflows retain their ownership.

**Front Desk dashboard spacing (2026-11-03):** Approved metric cards use
top-right icons and aligned values/helper text. Direct panel headings in
`.overview-role-front_desk` have zero left/right padding. Shared staff
`.panel-heading` styles also have zero top padding; existing bottom padding
and outer article padding remain intact.

**Shared panel dividers (2026-11-03):** Direct `.panel > .panel-heading`
dividers extend to the container edges across staff portals. The divider inset
tracks the panel's actual padding, including analytics, reports and AI responsive
variants; heading and body spacing remain unchanged. Flush `.data-panel` headers
retain their existing full-width borders.

**Approved HMS workflows (2026-11-03):** `app/hms-workflows.css` follows
`staff-theme.css` and precedes the final shared sidebar layer. Inventory uses
the approved table/history plus adjacent issue/count form. Cash now uses the
approved Cash & Shifts workspace (2026-11-04): connected expected/count/difference,
independent count review in the shared Modal, handover/reconciliation rail, and
full-width movements/history. `cash-shifts-workspace.css` owns its ivory/forest
light palette, equivalent dark palette and mobile row recomposition. Financial
comparison precedes supporting cash basis in both DOM and visual order. Count
drafts remain owned by `CashCountPanel`; filters and same-drawer refresh preserve
them. Unavailable counts never imply agreement. Operational Handover has a
standalone source/owner form and filterable follow-up log. Guest and uploaded-ID
forms preserve the existing portal/arrival shell. Labels, draft preservation,
stable retry keys, truthful status/error feedback and keyboard focus are part of
the workflow; no prototype/sample records are wired into production screens.

**Cash safeguards (2026-11-05, local):** Count review distinguishes unsaved edits,
an explicitly saved server draft, resume/fresh count and final Close. Changed
cash activity requires recounting; stale versions and unconfirmed close responses
retain recoverable input. Refund payout uses the existing Modal and native
method/drawer selectors, with an explicit completed-payout confirmation. Closed
drawers show scoped handover and report status/actions within the current drawer
stack and history detail. Handover prefill and report-date navigation never submit
automatically. Existing light/dark tokens, mobile stacking and 44px label/action
targets are retained; the payout checkbox remains 20px inside its larger label.

**Verified cash UI gaps (2026-11-06):** Actual-app light/dark QA confirms the
cash workspace reflows at 320/390/768/1024/1440px, but the shared header clips
controls at 320/390/1024px. Modal actions measure 36px high and refund selectors
40px, short of the 44px target above; the checkbox's larger label is intentional.
Report currency display drops centavos and a closed drawer's own handover can say
“Other cash shift.” These remain findings, not implemented design changes.
Evidence: `docs/qa/cash-delivery-ui-qa-2026-11-06.md` (CD-02–05).

- **Companions:** `DESIGN-STATUS.md` (what is off / what got fixed), `SYSTEM.md` (behavior).
- **Snapshot:** working tree on `main`, 2026-10-06 staff-layer rewrite fold
  (see `DESIGN-STATUS.md` and `.impeccable/surfaces/app-booking-search.md`).

---

## 1. How CSS is loaded (what wins)

**Navigation update (2026-11-03):** The table below is historical; current
`app/layout.tsx` loads `staff-theme.css` near the end, followed by
`sidebar-navigation.css` as the final shared navigation layer. It owns sidebar
metrics for Manager/operational staff, Admin, Owner, and Guest: 280px expanded,
80px collapsed, 48px targets, 22px expanded / 24px collapsed icons, and 48px
cropped transparent logo marks. Mobile drawers retain labels even when a desktop
collapse preference is saved. Staff property pills have been removed. The shared
small logo uses its original colors in light mode and a white silhouette in dark
mode; public/auth large logo tiles retain their existing presentation.
Sidebar scrollbars are hidden with `scrollbar-width:none` and WebKit scrollbar
rules in that same layer, including staff outer/nav containers, Guest, and the
reusable navigation shells. Existing overflow, focus and scrolling behavior remain.

`app/layout.tsx` imports, in order — later files win at equal specificity:

| # | File | Role |
|---|---|---|
| 1 | `app/globals.css` | Shared base: tokens, `.btn`, `.badge`, `.modal`, `.toast`, landing + login + app-shell base (staff mobile drawer: `.sidebar{transform…}` at ≤1000px) |
| 2 | `app/guest-booking.css` | Booking flow, guest/account portal |
| 3 | `app/responsive.css` | Mobile hardening, touch targets, micro-interactions, reduced-motion |
| 4 | `components/ui/Modal.css` | Modal / form-dialog, Breadcrumb, PageHeader, chart styles |
| 5 | `components/ui/haven-select.css` | HavenSelect listbox |
| 6 | `components/ui/haven-data-controls.css` | Toolbar / search / filter badges / empty state |
| 7 | `components/booking/room-details.css` | Room detail sheets |
| 8 | `app/design-tokens.css` | Legacy token re-map (legacy OS-dark `@media` block kept off-path) |
| 9 | `app/ui-primitives.css` | **Normalization layer** — shared control metrics + action-row spacing |
| 10 | `components/customer/notification-history.css` | Notification history modal |
| 11 | `app/customer-portal.css` | Customer portal palette + layout (`.customer-shell`) |
| 12 | `components/auth/session-expiry.css` | Session expiry banner |
| 13 | `components/ui/command-palette.css` | Command palette |
| 14 | `components/ui/haven-account-modal.css` | Account modal |
| 15 | `app/staff-theme.css` | **THE staff layer (2026-10-06 rewrite, last import)** — merged `manager-dashboard-theme` + `staff-ops` + `haven-tailadmin` + `fleetops` into one sheet, per-property newest-wins; all rules `.app-shell`-scoped |

Page-scoped sheets import with their chunk: `(landing-page)/landing.css`,
`(booking)/booking/search/search.css`, `components/auth/login.css`,
`auth-vault.css`, `components/ui/haven-loader.css`.

Rule of thumb: **palettes live in each surface's scoped rules** (`.customer-shell …`, `.app-shell …`,
`.theme-light …`); **shared control *metrics* and spacing live in `ui-primitives.css`**. That split
keeps guest / booking / staff character while giving every surface the same button height, radius,
motion, focus ring, and action-row gap.

## 2. Color

Palettes live inside each surface's scoped rules (the 2026-09-09 `coastal-theme.css` overlay was
retired with the 2026-10-06 staff-layer rewrite — its file is deleted and its hexes no longer ship
in any sheet; the same hexes may remain in DESIGN-STATUS history):

- **Staff dashboards:** `.app-shell` dark FleetOps neutrals (`--db/--ds/--ds2/--dl/--dt/--dm/--dg`
  in `app/staff-theme.css`, plus `--tail-*` primitives); `.theme-light` mirrors use the
  `--ops-*` scale. Light mode is a `.theme-light` rule set (colors only — sizes/metrics inherit
  the dark block).
- **Guest / booking:** neutral ink family in `app/globals.css` — `--ink/--forest/--accent` all
  alias `#111827` (dark-consumable), `--green` `#10b981`, grays for line/muted. Terracotta
  `#c9783c` is retired from brand use.
- **Customer portal:** the `--cp-*` scale (`app/customer-portal.css`, dark base + `.theme-light`
  mirrors); light `var(--tail-*)`-adjacent values also re-declared in `globals.css` scope.
- **Extended-family retirement (2026-09-10):** descendant-local modal tokens, booking-search
  gradients, room details, QR placards, staff accent literals, chart slices, loader copy, and
  guest-email presentation were audited and moved from the surviving forest/terracotta family to
  the coastal palette. Semantic success, warning, danger, payment, and reservation-status colors
  remain intentionally distinct.
- **Staff dashboards:** `.app-shell` dark `#141815` family; light mode is a `.theme-light` rule set
  (colors only — sizes/metrics inherit the dark block).
- **Badge status families** (green / amber / red) exist in two mirror palettes on purpose:
  *public/light* = soft pastel background + deep text (`#def1e8`/`#267056`, amber `#fff0dd`/`#a45a22`,
  red `#f9e3e1`/`#a44843`); *app-shell dark* = deep background + bright text (`#173024`/`#65d3a5`,
  `#34291c`/`#dfa062`, `#351f21`/`#ef797e`). Coverage gap closed 2026-09-05: `active`,
  `on_leave`, `suspended`, `escalated` added in both contexts (see `DESIGN-STATUS` F5).
- **Room-type badge colors** (2026-09-25, migration `20260925010000`): each active room type owns
  one semantic key from an eight-color HAVEN palette — `sage`, `gold`, `ocean`, `plum`,
  `terracotta`, `slate`, `sand`, `lavender` — stored on `room_types.badge_color_key` and rendered
  by the shared `RoomTypeBadge` (`lib/room-type-badge.ts`) as `.room-type.rt-<key>` pills.
  Each variant defines a dual palette via custom properties (`--rt-bg`/`--rt-fg` for the dark
  shell, `--rt-bg-l`/`--rt-fg-l` for light theme + shared light modal panels); e.g. sage
  `#173024`/`#65d3a5` dark, `#def1e8`/`#267056` light. Null/unknown keys fall back to the neutral
  pill (`#232823`/`#a8b3a8` dark, `#e8e8e2`/`#4a524a` light). These are **type identity**
  colors only — room-status and housekeeping badge colors are separate rules and never derive
  from the type key. Swatches in the Room Types & Photos editor render as the badge itself.
  Governance (`20260927010000`): a color is reserved by active types *and* types with pending rate
  proposals; creation requires a choice (no neutral escape hatch — null is legacy-fallback only);
  the `terracotta` key is a categorical badge hue and is not the retired brand accent `#c9783c`.
  Physical rooms inherit their type's key — there is no per-room color control anywhere.

**Theming:** `.theme-light` on `<html>`, set pre-paint by the inline script in `app/layout.tsx`.
A staff light palette is a `.theme-light` rule set inside `app/staff-theme.css`. The landing is
**light-only** via `landing.css` `color-scheme: light`. A second, OS-driven block in
`design-tokens.css` is legacy and can drift — keep new dark-theme work
inside `.theme-light`-aware rules, not `@media (prefers-color-scheme: dark)`.

## 3. Typography

- **Inter** (sans) + **Playfair Display** (serif display). Bundled with SIL licenses in `app/fonts` and loaded once via `next/font/local` on `<body>`,
  which writes `--font-sans` / `--font-display` directly. `design-tokens.css` `:root` fallbacks are
  plain stacks (inert vs. the body variables — harmless, no self-reference).
- **No per-role fonts** — surfaces differentiate by palette only.
- **Readability floor (staff, raised 2026-09-05, F4):** nothing below ~9–11px for secondary text /
  row actions / table cells; metadata 8–10px; `.brand small` and captions 8px+. Density comes from
  padding and line-height, not shrinking type.
- **Mobile:** body ≥16px (iOS zoom guard lives in `responsive.css`).

## 4. Spacing

- One 4px scale (`--space-1..24`) is the source; **`gap` for sibling rhythm, not child margins**.
- Action rows (`.btn-row`, `.form-actions`, `.modal-actions`, `.customer-request-form>div`, …) are
  flex + `gap` + `flex-wrap: wrap` — buttons never touch and never overflow on narrow widths.
- A single 12px rhythm separates stacked cards/sections in the guest shell (e.g.
  `.customer-request-list-wrap`, `.customer-detail-grid + .customer-detail-card`).

### 4a. Breakpoints — the 6-step scale (HUI-008 contract)

New responsive rules **must** use one of these `max-width` steps — not an ad-hoc
width. The named scale covers phone → executive desktop:

| Step | Purpose |
|---|---|
| 360 | smallest phone (390px iPhone class gets inside this gate) |
| 480 | large phone / small foldables |
| 680 | tablet-portrait / narrow window (the existing touch-floor gate) |
| 900 | tablet-landscape / small laptop split collapse |
| 1100 | desktop sidebar + dense-grid collapse |
| 1440 | executive desktop (4+ column arrangements) |

`min-width` variants use the same numbers (e.g. `@media(min-width:1201px)`
exceptions already shipped may stay; new ones pick 1101/1441 conventions).
Migration is **opportunistic** — migrate a module's media query when you are
already editing it; do not bulk-rewrite working blocks.

## 5. Buttons — one metric system, two densities

Canonical base (in `ui-primitives.css`, overrides the three legacy `.btn` blocks):

- `min-height:40px`, `gap:8px`, `border-radius:6px`, padding 13px 20px in `globals.css`.
- Hover/active/focus 150–300ms; `:focus-visible` outline 2px offset 2px; `:disabled` not-allowed.
- `svg` never shrinks; icon buttons hold their box.

**Two deliberate densities:**

1. **Public/guest/booking** — base `.btn` at 40px (`.btn-sm` 32px, `.btn-lg` 48px opt-ins).
2. **Staff `.app-shell .btn`** — intentional compact variant at **36px / 11px** (denser panels), not a
   bug. If reviewers want parity, widen there — do not blanket-bump to 40px.
3. **Mobile (≤680px)** — everything lifts to a 44px touch floor; header CTAs collapse to an icon
   square **only** when genuinely icon-only (`:has(> svg:only-child)`), so text-only header buttons
   (Manage users, Update policy, …) never turn into blank squares (bug fixed in `ui-primitives.css`).

## 6. Forms & modals

Staff deposit/stay-payment details and pending reviews share `PaymentDetailsDialog`, matching the
user-supplied green-header receipt reference (2026-11-04), with the actual
HAVEN Hotel & Residences name and shared `HavenLogo` mark (white on the green
header in both themes). Garden Twin is a room type, never the hotel brand. This
scoped exception keeps cream paper, subtle leaves, dotted rows, sage Paid/clay
Cancelled chips, a beige total strip and scalloped bottom in
both themes. The responsive follow-up replaces screenshot-sized geometry with a
560px preferred desktop/laptop width (90vw cap), a tablet width capped at 520px,
and mobile width `100vw - 24px` with 12px minimum side margins (≤680px). Height
is automatic, capped at 88dvh/720px with safe viewport margins; short windows
prioritize the available height. Titles use 26–34px, values 13–15px and labels
10–12px with fluid padding. The branded header and its 44px X control remain
outside the keyboard-accessible scrolling record; the redundant bottom Close
button is removed, with balanced paper padding below Total. Proof content expands the
scroll region. No scale transforms. Values remain live. The common title is
Payment Details; Purpose distinguishes the payment type. The same detail-row
component renders both sections. Deposits include Expected Deposit and over/under
comparison. Payment Details is a read-only record. Pending Xendit payments show
provider settlement status. Legacy manual submissions show their recorded status and proof.

- `.form-actions` / `.multistep-actions` right-align with a 10px gap; the multi-step **Back** button
  sits alone on the left, Cancel + primary hug the right. No spacer elements — the old
  `<div style={{width:80px}}/>` was removed and replaced by
  `.multistep-actions > .btn:first-child:nth-last-child(3){margin-right:auto}`.
- On ≤480px, action rows become `column-reverse` full-width buttons — primary first, Cancel/Back
  beneath.

## 7. Focus & motion

- `:focus-visible` on every interactive element (buttons get an explicit ring in
  `ui-primitives.css`).
- Micro-interactions: 150–300ms; active presses nudge (`translateY(1px) scale(.98)`); fully disabled
  under `prefers-reduced-motion` (`responsive.css`).

## 8. Public booking search

**Approved prototype implementation (2026-11-11):** Room-type selection opens a
dedicated numbered-room page, preserving the neutral Inter/Playfair Haven identity.
Three desktop room columns collapse to two at900 and one at480. Unavailable rooms
remain gray, last and unbookable; details and full-photo access remain available.
The account page carries the selected room beside sign-in/create account, stacking
at900. Guest/review/payment/confirmation retain room identity. A shared searchable
flag/calling-code mobile input defaults toPH+63 and preserves the normalized number
in form submission. A keyboard-focusable range calendar supplements the editable
stay dates. These are real catalog/availability screens, not the static sample data.
Browser visual verification is pending; see the feature QA report.

**Landing Featured Stays (approved 2026-11-07):** The supplied reference and
reviewed prototype replace the horizontal four-card track with a two-column,
two-row comparison for the four current active room types. Each white rounded
card pairs 46% photography with 54% details: display heading, room facts,
description, up to four warm neutral amenity chips, three image-selection
thumbnails and the base-rate/Explore room row. Catalog content and photo order
are admin-managed. The shared full-photo viewer shows uncropped room/bathroom
images and the rest of a longer gallery. Above 900px the four desktop types fit
the 2×2 comparison beneath the nav. At 681–900px the cards use two columns with
photography above details. At 680px and below they form one vertical column.
The section grows with its cards using normal page scrolling. Full descriptions,
amenities, thumbnails and booking actions have natural space, with 16px description
text. Extra desktop types remain scrollable inside the region; short desktop
landscape/zoomed windows use normal flow. All image controls have visible focus
and 44px minimum targets.

The public room-discovery route (`/booking/search`) extends the landing-page identity instead of introducing a separate booking brand.

- Use the shared landing navigation with **Rooms** marked as the current page. Breadcrumbs communicate location; the separate three-step indicator communicates booking progress.
- Lead with a photographic coastal hero, then overlap the compact availability form across the hero/content boundary. Search parameters and availability remain the source of truth for the visible filter chips.
- Room results are photo-first editorial cards. On wide screens, media and details share the card; at `820px` and below they stack. The results and support rail become one column at `1000px` and below.
- Availability is a circular, inventory-backed marker. Hover and keyboard focus coordinate the marker, room photograph, and primary select action; reduced-motion preferences remove these transitions.
- Support copy must remain operationally truthful: live inventory, the configured 15-minute hold, and deposit/terms disclosed before submission. Do not add invented ratings, scarcity, guarantees, sustainability claims, or chain-wide claims.
- `app/(booking)/booking/search/search.css` owns this route's scoped composition. Shared booking validation, availability, rates, and reservation behavior remain in their existing components and domain libraries.

## 9. Customer payments & folio

`/account/payments` keeps the coastal card identity with a decision-first hierarchy:
page hero → three financial KPI cards → transparent filter toolbar → folio cards.
The stable KPI strip shows the filtered folio count, outstanding balance, and
paid-to-date before the user reaches the controls. Search plus the Stay Status and
Payment Status `HavenSelect` controls filter the already-authorized server payload
locally, update faceted option counts and KPI totals without navigation or layout
shift, and mirror state into `?q=`, `?stay=`, and `?pay=` through browser history.
The shared toolbar wrapper remains uncontainerized; only its inputs/selects draw
surfaces. At narrower widths the KPI strip becomes one column and the controls stack.
Each folio card carries a paid-vs-total progress bar (`.folio-progress`, accent =
partial, green = settled) between header and `.folio-summary`, with a text
alternative on the progressbar role. Bucket derivation (`financialPaymentState`) and
money derivation remain shared presentation helpers — no query or business-logic
change. Styling is scoped in `guest-booking.css` (`.folio-*`) using `--cp-*` tokens.

## 9a. Customer rewards

The guest Rewards page uses the customer portal's dark-teal hero, followed by
three live KPI cards (tier/balance, tier progress, redemption value), a
selectable three-tier comparison, and the append-only points ledger. The API
payload remains authoritative; client code validates it before presentation.
Tier comparison cards are real buttons with pressed state and visible focus,
while the current membership is independently marked as Active tier. Progress
uses a semantic progressbar, transform-only animation, and reduced-motion
fallback. The ledger uses the shared pagination primitive on wide screens and
reflows into labeled records on narrow screens without horizontal page scroll.
Loading skeletons reserve the same page regions as the loaded content, and
errors include a retry action.

## 10. Module quick-overview cards (staff dashboards)

`ModuleSummaryCards` (`components/manager/module-summary-cards.tsx`, styled by the
`.mod-kpis` / `.mod-kpi` block in `app/staff-theme.css` — dark and `.theme-light`
mirrors) is the single pattern for the compact operational snapshot at the top of a staff
module. Each card is label / strong value (count or peso total) / one-line hint / icon chip.
It is deliberately **not** the big Overview `metric-card`: 10px label, 22px number, 9px
hint, 13–14px padding — dense enough to read as a snapshot above a table.

- **Tones are accents, not backgrounds.** The four semantic tones (`attention`, `today`,
  `active`, `done`) tint only the icon chip background; the card surface stays neutral.
- **Clickable where a filter exists.** A card with a `queue` renders as `<button
  aria-pressed>` and drives the module's existing filter state (Reservations queues,
  Transportation queues, Approvals status pills, Guest Requests submission queues, Front
  Desk Reports status chips) — one control surface, never a parallel filter. Cards without a
  matching filter (e.g. Reservations "Active" or "Arrivals needing prep") are informational
  `<article>`s. Selected state = ring/border via `aria-pressed`, not color flips.
- **Counts are the filters.** Values derive from the same predicates, the same grouped
  queue (Housekeeping), and the same Asia/Manila `today` string as the module's filters,
  so card == chip == table rows.
- **Ordering is fixed.** Page title → cards → filter chips → search → table; the strip is
  the module's snapshot, read before any control.
- **Grid: one row, any count.** `repeat(auto-fit,minmax(0,1fr))` keeps 2–6 cards on one
  row with equal columns. ≤1000px → 2 columns, with an odd last card spanning the full row
  so nothing dangles; ≤480px → 1 column. Zero is a valid value and renders; the workspace
  loading gate means no false zeros while fetching.
- **Admin governance modules use the same vocabulary** (2026-09-24): Users & Staff, Room
  Configuration, Audit Logs, Security, and Admin Reports all lead with the card strip
  (clickable where a filter exists), and the shared filter-toolbar / table-badge / footer /
  clear-filters-empty-state kit from Users & Staff is the pattern for every admin table.
  Roles & Permissions renders role cards with capability chips; Hotel Policies groups the
  raw columns into labeled stat tiles (times `HH:MM`, booleans Yes/No, basis points as a
   percent) with a fallback group so schema additions are never hidden. Admin CSS lives in
   the `admin-*` block of `app/staff-theme.css` (dark + `.theme-light` mirrors).

- **Data toolbar convention (search-first).** Every combined search/filter surface
  follows the same DOM and visual order: search → quick-filter badges → advanced
  filters → results. Search updates after a 350ms debounce and never needs Apply;
  quick filters and `HavenSelect` changes apply immediately. `All` is first and is
  the default unless the workflow explicitly opens a scoped queue. ≤720px keeps
  the same order while stacking full-width; customer touch targets rise to 44px.
  Search inputs carry accessible labels and clear controls. See
  `docs/HAVEN_UI_STANDARDS.md` for the canonical primitives and migration rules.

## 11. Dropdowns & selects — one Haven language, two mechanisms

`HavenSelect` (`components/ui/haven-select.tsx`, styled by
`components/ui/haven-select.css`, tokens `--select-*` mapped to the coastal
palette in both `.app-shell` dark and `.theme-light` mirrors) is the single
shared dropdown primitive. Zero dependencies beyond `lucide-react` (no
Radix/shadcn — banned in `docs/ui-motion-guidelines.md`).

- **Filter/selector UI uses `HavenSelect`** (button + listbox): 44px trigger,
  11px radius, pale-teal selected row with a right checkmark, grouped options
  where the native control used optgroups, ≤720px full-width triggers with a
  60vh scrollable menu. Keyboard: arrows/Home/End + Enter + Escape, focus
  returns to the trigger; the menu carries "<field> options" as its label so
  it never collides with the trigger's accessible name.
- **Form data-entry keeps the styled native `<select>`** (same border/radius/
  focus/error language + custom chevron via `haven-select.css`): mobile
  pickers, form validation, and date/time inputs are untouched. Never nest a
  `HavenSelect` inside a `<label>` — labels forward clicks on non-interactive
  descendants to the toggle and would reopen the menu; use the neutral
  `.haven-filter` div (filters) or `.arrival-field.haven-field` div (forms)
  with the trigger's stable `aria-label` as the accessible name.
- **Out of scope by design:** action menus (⋮/profile/New-reservation),
  date/time inputs and the room radiogroup keep
  their own semantics and share only radius/type/shadow. Expected arrival is
  exactly such an input — a native `<input type="time">` beside Nationality,
  the same control as Pickup time under Need a ride.

## 12. Performance reports surface (staff Reports section)

`PerformanceReports` (`components/manager/performance-reports.tsx`, styles in
the report block of `app/staff-theme.css` — dark and `.theme-light`
mirrors) is the analytics half of the Reports section; the immutable daily
operations-report review (`FrontDeskReportsPanel`) renders below it as a
visually distinct second workflow, never a competing page header.

- **Header + decision KPIs.** One `page-title` row (eyebrow, title, plain-language
  subtitle, and the shared Download menu with Print / Save as PDF) followed by
  exactly three KPI cards: money (role-aware label/figure),
  average occupancy with seven-day point change, operational readiness. Same
  card grammar as `ModuleSummaryCards` (label / strong value / hint / icon
  chip); numbers derive from the existing `DashboardData` payload only.
- **Chart + evidence + inventory.** The seven-day occupancy `AreaChart`
  carries a `role="img"` summary label and a `<details>` data-table fallback
  with the same values; the room-status aside renders share bars from
  `roomMix` colors with per-slice percentages. Print CSS keeps the 3-column
  KPI row and hides the data-table disclosure.
- **Responsive.** 3→1 KPI columns ≤760px, analysis grid 1.65fr/.75fr → 1fr
  ≤1050px, room-status list 2→1 columns; figures use tabular numerals.

## 13. Known-open items

- **F6 — landing double-styling** (`globals.css` vs `landing.css`): **closed 2026-09-07** — the
  interactive landing redesign consolidated every landing rule into `app/(landing-page)/landing.css`;
  `globals.css` / `guest-booking.css` / `responsive.css` keep only shared primitives (`.btn` family,
  `.eyebrow`, `.brand`, focus-visible, `scroll-padding-top`).
- **`.customer-status` vs `StatusBadge`** convergence on the guest portal: started 2026-10-18 —
  payments surfaces now render StatusBadge (with label passthrough preserving the
  STATUS_LABELS copy); remaining `.customer-status` consumers (reservation detail,
  transportation list) migrate when edited next.

- **Stage 3a StatusBadge entity-map unification** (2026-10-20, commits 6309c1a, 83824a5, 85001c2):
  retired informational `badge ${...}` spans across manager, owner, catalog, guest requests,
  housekeeping, staff duty, transportation, unified room matrix; unified to `StatusBadge`
  with canonical vocabulary (haven-status tokens in `haven-data-controls.css`). Tone
  canonicalization: checked_in→green (was amber), assigned→amber (was amber), audit chips
  info-blue (was amber), inactive→amber (was red), info→blue (was neutral). Raw `.badge`
  families retained: advance buttons (→ `.room-advance` in `haven-data-controls.css`),
  loyalty tiers, source badges, nav badges, demand badges, gateway badges, customer
  portal pills. Generic `.app-shell .badge.*` rules removed from `staff-theme.css` (86 lines);
  scoped families retained (room-card header, room-rack, grp-inventory, tp-table,
  grp-approval, owner-workspace). `.room-advance` added to `haven-data-controls.css`.

## 14. Universal interaction foundation

`HavenDataToolbar`, `HavenSearchInput`, `HavenFilterBadges`, `HavenEmptyState`,
`HavenButton`, `HavenSelect`, `StatusBadge`, `Modal`, and `TablePagination` form
the shared behavior layer. Customer and internal contexts keep different density
and surfaces while sharing keyboard, focus, state, responsive-order, and feedback
semantics. The complete contract and reference consumers are documented in
`docs/HAVEN_UI_STANDARDS.md`.

## 15. Modern Luxury Hospitality SaaS (official direction, approved 2026-09-19)

Reference: `reference/` (Executive Overview + Executive Operations images) plus
the written brief. One token family, two densities (D-017); dark toggle kept
with light default. Reproduce the reference's visual language, never its sample
content — KPI figures always come from authoritative sources, never fabricated.

- **Page hero.** `PageHeader` (`components/ui/Navigation.tsx`) is the single hero:
  `variant="default"` is the compact premium header (forms, settings, dense
  screens); `variant="band"` is the full deep-teal band (dashboards, major
  module landings). Same markup either way. Band tokens `--hero-*` live in
  `design-tokens.css`; the band is a fixed self-contained surface (both themes).
- **KPI cards.** `ModuleSummaryCards` (`components/manager/module-summary-cards.tsx`)
  is the canonical card grammar (label / value / hint / icon chip, queue-click
  where a filter exists). Deltas render only from computed comparison data.
- **Tables.** One grammar: white rounded container, small-caps gray headers,
  hairline dividers, pastel status pills, right-aligned text row-actions,
  footer "View full…" link. The unused TanStack `DataTable` was deleted
  (2026-09-19); surfaces keep their existing tables until converged onto this
  grammar phase by phase.
- **New CSS uses tokens.** The repo-wide hardcoded-hex sweep is deferred to the
  final consistency phase; all new rules reference `design-tokens.css` tokens.

## 16. Organization Executive Dashboard theme — staff pages (2026-09-20, D-025)

Authoritative spec: `reference/design.mdd (1).txt` (FleetOps Executive
Dashboard language, adapted to hotel operations — tokens and grammar only,
never fleet content). Applies to **staff pages only** (every role dashboard,
module, table, form, modal, report, notification surface under `.app-shell`,
plus staff-only `qr-placard`). Landing, customer portal, booking flow, and
auth screens are explicitly out of scope and untouched.

- **Delivery mechanism:** `app/staff-theme.css`, imported last in
  `app/layout.tsx`. Every rule is scoped under `.app-shell` (dark base) or
  `.theme-light .app-shell` (light default) and wins by import order at equal
  specificity — no shared-file edits, no `!important` sprawl.
- **Palette:** Midnight Ink `#111827` (primary buttons, active nav, primary
  text), Cool Paper `#f3f3f3` (light floor), Surface `#ffffff`, Slate border
  `#d1d5db`, secondary `#4b5563`, muted `#6b7280`, status
  `#10b981/#f59e0b/#ef4444/#3b82f6`, Deep Navy `#0b132b` reserved for the
  HAVEN AI intelligence pill. Small status text uses 700-level variants
  (`#047857`, `#b45309`, `#b91c1c`, `#1d4ed8`) over ~10% tints.
- **Type:** Inter only on staff (no serif display); Display 22/600, Title
  18/600, panel title 15/600, Body 14/400 (tables 13), Label 12/500, Caption
  11/400; tabular numerals for financial/room/date/ID/report figures.
- **Shapes:** controls 12px, cards/panels/modals 16px, KPI/stat cards 24px,
  micro 4–8px. Shadows structural only (rest/lift/float); KPI hover lifts
  `translateY(-1px)` on a 280ms tactile curve; page entrance is a single
  0.6s fade-up; all gated on `prefers-reduced-motion`.
- **Headers:** the deep-teal `PageHeader variant="band"` hero is retired on
  staff (manager overview + all 10 owner sections now `variant="default"`);
  cross-role `.page-title` bands, the admin command band, and the
  staff-duty/housekeeping heroes are flat executive headers in the override
  layer. The `.band` variant itself is untouched for other consumers.
- **Cards/panels/tables/badges/buttons/forms/modals/charts/AI:**
  ModuleSummaryCards and overview `metric-card`s share the 24px stat grammar
  (tinted icon chip, 30px/24px semibold tabular value, note + muted trend;
  linked cards are buttons with `aria-pressed`, focus ring, press physics);
  panels carry title/description/`View … →` with skeleton / `role="alert"`
  error / truthful-empty states; tables keep search→quick-filters→advanced→
  results order with All-first; one state = one color (DB status strings
  unchanged; room-type identity keys preserved); primary = ink, secondary =
  white/ink, danger = muted red; modals 16px with ink branded headers
  (staff-scoped); chart heights 220/260/300; the one donut (`roomMix`)
  genuinely partitions room inventory, so the Partition-Only rule holds with
  no change; severity travels on tinted chips, never border bars (owner tone
  insets removed); no pulse/beacon on static records (none existed).
- **Dark variant kept + refined** (user decision, plan phase): ink-family
  surfaces, white primary buttons, same token names.
- **Superseded for staff only:** D-024 teal band hero, dark-green shell,
  7–9px micro-type, decorative metric-card stripes. Landing/customer/auth
  keep their existing systems.

## 17. Authenticated header session countdown

- Shared Customer, operational staff, System Administrator, and Owner headers
  place the countdown in the top-right control group after role indicators and
  before theme, notification, and profile controls.
- Visible content is only a clock glyph plus `HH:MM:SS` while at least one
  hour remains, otherwise `MM:SS`. The glyph hides at compact mobile widths;
  the timer stays visible.
- Normal, approaching-expiration, and critical states use the existing
  neutral/info, warning, and danger tokens. A non-live accessible expiration
  label prevents screen readers from announcing every tick.
- Expiration opens a blocking, focus-directed dialog with one action:
  **Sign in again**.

## 18. Role-based overview composition (2026-09-21)

One visual system, different information hierarchies per role. All five
staff overviews share `Overview` (`manager-dashboard-client.tsx`), the same
`DashboardData` payload, `metric-card`s, `HavenActionItem` queues, and the
room-mix donut — only composition differs:

- **Manager:** decisions-first — `Decisions & exceptions` panel leads
  visually (`order:-1`, DOM unchanged) with approvals, escalations, and a
  Predictive Insights link; occupancy-area chart retained (only role with
  one, plus Owner Reports).
- **Front Desk:** arrivals/departures queue panel replaces the chart;
  compact room-mix donut kept for assignment decisions.
- **Accounting:** financial card set (pending verifications with oldest-age
  hint, past-SLA, pending refunds, collections, outstanding, refunds today)
  + `Pending financial actions` panel; no occupancy chart.
- **Housekeeping / Maintenance:** task-first queue panels replace the chart
  and the duplicate room-activity panel; their `Needs attention` panels hide
  items duplicated by the queue panel (cross-department approvals remain).
- Overview action items link to existing module sections only (never to a
  filter the target module does not support); counts are the same
  predicates the modules use. `overview-role-<role>` scopes composition
  CSS; `≤1000px` stacks `.dashboard-grid` to one column.
- Customer `/account` stays the dedicated personal dashboard (stay hero,
  attention list, folio/requests/notifications cards, quick actions);
  `/my-reservations` stays the separate history module.

## 19. Predictive pricing workspace (2026-09-22)

- The Occupancy Outlook keeps the FACT bars and dashed PREDICTION line as the
  primary evidence. A responsive recommendation workspace sits beside it at
  wide widths and stacks below it before mobile.
- Recommendation cards show room/date, base rate (FACT), proposed rate,
  percentage movement, demand-tier badge, confidence, and plain-language
  reasoning. Color is never the only status signal.
- The top three highest-impact recommendations preview in the panel. The
  branded review modal exposes all seven-day room/date recommendations with
  native checkboxes, bounded numeric inputs, visible focus treatment, and a
  sticky semantic footer count/action group.
- The sole primary action says **Submit Proposal to Owner**. Supporting copy
  states that submission leaves live rates unchanged and creates pending
  Owner/Admin work. Reduced-motion removes skeleton and row transitions.

## 20. System Health module conformance (2026-09-26)

The System Health module (`SystemHealthView`, `SystemHealthLedger`,
`system-health.css` — self-scoped, no shared-theme edits) follows the §16
staff grammar with four module-specific applications: health cards use the
24px stat step with tone-tinted icon chips and base-card hover lift; ledger
and job states use honest badge names (`applied`, `succeeded`, `failed`,
`info` — `paid` stays a payment word); pending filenames wrap to two lines
instead of truncating; payment/audit panels own skeleton and empty-with-action
states per the Honest Feed Rule. Severity still travels on chips, never
border bars; tone stays on value lines and theme-flipping tokens.

## 21. Canonical severity color code (2026-09-26)

One vocabulary everywhere — red is crucial, amber is attention, green is
success, blue is informing:

| Severity | Meaning | Transport |
|---|---|---|
| `critical` / red | Act now — failures, rejections, critical states | Badge/chip + icon + text (`expired`, `failed`, toast `error`) |
| `attention` / amber | Needs attention this cycle — the single attention family (`urgent` included) | Badge/chip + icon + text (`pending`, toast `warning`) |
| `success` / green | Completed well | Badge/chip + icon + text (`healthy`, `applied`, `succeeded`, toast `success`) |
| `info` / blue | Informing, no action needed | Badge/chip + icon + text (`info`, toast `info`) |

Rules: color never travels alone (icon + text label always); severity lives
on chips/badges/icon-chips only — never colored border bars, never whole-card
tints; small text uses AA-safe 700-level variants. Sources:
`lib/notifications.ts` (`NOTIFICATION_SEVERITY`, bell + history chips),
`ToastStack` tones (the reference implementation, all shells),
`HavenActionItem` tones (incl. `info`), `StatusBadge` families, System Health
queue badges. Unknown notification types default to info — never alarming on
the unrecognised.

Phase 2 (2026-09-26): `urgent` unified into the amber family (icon + label
kept); `refunded`/`closed` moved to green as completed outcomes while
`checked_out` stays informational blue; approval `critical`/`high` severities
gained real theme rules (danger red / warning amber — previously unstyled
gray); reservation `.mr-issue.info` moved from neutral gray to informing blue.
Modal `danger`/`warning` map to the same red/amber tokens — no change needed.

UPDATE 2026-10-19 - Stage 1 chart-token consolidation (reference-design roadmap).
Recharts panels no longer declare private palettes: lib/chart-tokens.ts is the single source for chart hexes (grid, axis, occupancy fact #176773, report occupancy #2a9098, forecast #b8860b, template line #1d4ed8), consumed by the manager overview, HAVEN AI predictive chart, performance reports, and the tailadmin visual template; lib/chart-tokens.test.ts pins the values and forbids raw hex series attributes in those files. Values shipped unchanged - this is an ownership consolidation, no visual change expected; rendered-chart spot checks go to the manual browser checklist. The status tint grammar (10% fill + 700/800-level text variant, FleetOps reference rule) is now stated in app/design-tokens.css comment form.

UPDATE 2026-10-19 - Stage 2: THE one KPI/overview card (reference-design roadmap,
commits b964270..1244d58). One card format for staff AND guest surfaces:
.mod-kpis/.mod-kpi lives solely in app/ui-primitives.css (section 7), painted
per-surface by token fallback chains (--st-* staff, --cp-* customer) with
--kpi-* component tokens set by two small theme mirrors (staff dark / light).
Absorbed families deleted outright: .sd-kpi (staff-duty), .report-kpi
(performance reports, horizontal -> vertical form change), .haven-ai-kpi
(HAVEN AI; skeleton kept until Stage 3 shared skeleton work), .folio-kpi-card
(guest payments), .loyalty-kpi (executive gradients + corner badges retired
per product decision), and the unrouted tailadmin-haven kit + visual template
(StatCard/TailAdmin* deleted from components/ui). Component:
components/manager/module-summary-cards.tsx - tones attention/today/active/
done/danger/gold (icon-chip tints follow the 10% fill + 700-ink grammar),
aria-pressed queue cards (buttons), articles otherwise, disabled support,
optional 'extra' slot (loyalty progressbar). Known visual deltas on staff
surfaces: dark cards drop to 16px 18px padding / 24px stat radius (light
theme's documented values), chips become 46x46 absolute top-right with the
dark theme acquiring the light theme's tone-tint grammar; HAVEN AI's 5-across
mini strip becomes the standard card at 20px gap; report cards go vertical.
Manual browser checks required: staff dark + light, guest payments + loyalty,
HAVEN AI skeleton, report print.
