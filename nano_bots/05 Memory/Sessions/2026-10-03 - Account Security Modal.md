# 2026-10-03 — Account security opened as a modal (guest portal)

## Context

Reported: *"the account security in the profile menu it should be in modal form so there could be
a less conflict in the processing stuff etc."* The guest account menu
(`components/customer/customer-shell.tsx:29`) rendered **Account security** as
`<Link href="/account/settings">` — clicking it navigated the guest away from whatever they were
doing (a half-filled booking step, an open folio, a draft request) and the return trip was a
browser Back. Same password change, in place, was the ask.

## Chosen shape (user-selected)

- The dialog holds **the notification-sound switch + the password form** — parity with the old
  `/account/settings` page. The **Appearance/theme row is deliberately NOT included**: the theme
  toggle already lives permanently in the customer header
  (`.customer-header-theme`), unlike the staff shells where `SettingsDialog` has to carry it.
- The **My Profile page title button opens the same dialog** (not a second dialog, not a link).
- **`/account/settings` stays as a working fallback page** — direct URLs and bookmarks still
  resolve; nothing was deleted.

## Component — `components/account/account-security-dialog.tsx` (new)

- `AccountSecurityDialog({ isOpen, onClose })` — pure presentation, modeled on the existing staff
  `components/ui/SettingsDialog.tsx`: `Modal size="sm" headerVariant="branded"` wrapping
  `.settings-body` with `<SoundToggleRow/>`, an `<h3>Password</h3>` and `<PasswordForm/>`.
- `AccountSecurityProvider({ isOpen, onOpen, onClose, children })` — supplies
  `{ open }` by context and renders the single dialog instance after `{children}`. The open flag
  is **owned by the shell**, not the provider, because the shell's own menu item has to open it and
  a component cannot consume a context it renders itself.
- `useAccountSecurity()` → the context value or `null`.
- `AccountSecurityButton({ className, label })` — the in-shell trigger (My Profile title). With no
  provider it **falls back to `<Link href="/account/settings">`**, so the control can never become
  a dead button.

`PasswordForm` was already safe to render here: it calls `signOut` only (never `useSession`), so no
`SessionProvider` is needed inside the shell — `ProfileForm` is the one that needs it, and
`/account/profile` still wraps that locally.

## Placement — why not `portal`, and why not in the header

- **`portal: true` was rejected**: a portal renders into `document.body`, *outside*
  `.customer-shell`, which would drop the portal's own form theming
  (`.customer-shell .account-form-grid input` — `app/guest-booking.css:22`) and the `--cp-*` token
  scope.
- **Rendering inside `.customer-content-header` was rejected**: that element carries
  `backdrop-filter: blur(12px)`, which makes it the containing block for `position: fixed`
  descendants — the dialog would have positioned against the 66px header instead of the viewport.
- The provider is therefore mounted **inside `<main className="customer-main">`**, wrapping the
  header and content, so the dialog lands inside `.customer-shell` but outside the header. The
  `.dialog-backdrop` is `position: fixed` with no transformed ancestor, so it is not a grid item of
  `.customer-shell`'s two-column grid.
- `Modal` returns `null` while closed (`Modal.tsx:136`), so the always-mounted provider adds
  nothing to the DOM until opened. `HavenNotificationModal` (which does portal) is unaffected.

## Shell wiring — `components/customer/customer-shell.tsx`

- New `accountSecurityOpen` state; the popover entry became
  `<button type="button" onClick={() => { setAccountOpen(false); setAccountSecurityOpen(true); }}>`.
  `.customer-account-popover a, .customer-account-popover button` already share one rule set, so no
  menu CSS was needed.
- `<AccountSecurityProvider>` wraps `<main>`'s contents.
- The existing document-level outside-`pointerdown` / Escape handlers needed no change: the popover
  closes on the same click that opens the dialog, and `Modal` owns Escape while open.
- `TITLES` keeps its `/account/settings` → "Account Security" entry for the fallback page.

`app/(booking)/(customer)/account/profile/page.tsx` — the title `<Link className="btn btn-soft"
href="/account/settings">` became `<AccountSecurityButton className="btn btn-soft"/>`
(`.customer-shell .customer-page-title>.btn-soft` already themes it) and the now-unused `next/link`
import was dropped.

## CSS — `app/customer-portal.css`

`.settings-theme-row` and `.settings-body h3` were styled **only** under
`.app-shell .modal-content` (`app/manager-dashboard-theme.css:289-292`), which never matches in the
portal — so the sound row rendered as a bare flex-less div, **including today on
`/account/settings`**. A customer-scoped block was added (tokens only, every selector prefixed —
[[D-029]]): `.settings-body` grid, the row surface, its `b`/`small` type, and the switch pill
(including `:focus-visible` and `[aria-checked="true"]`). `.modal-content` re-pins `--cp-*` to the
light dialog surface, so the same rules read correctly in both portal themes. A
`.settings-theme-row+.account-form` margin covers the fallback page, where the row and the form are
siblings rather than `.settings-body` children.

## Tests

- **New** `components/account/account-security-dialog.test.tsx` (6 jsdom cases): renders nothing
  while closed; carries the sound switch and all three password fields; toggling writes
  `haven-sound-muted` and does not close; Escape and overlay click both call `onClose` and nothing
  links to `/account/settings`; the provider opens the dialog from an in-shell trigger and Escape
  closes it; `AccountSecurityButton` outside a provider falls back to the settings-page link.
- **Extended** `components/customer/customer-shell-notifications.test.tsx` (+2 cases): opening the
  account menu and clicking *Account security* opens the dialog, leaves the popover, and the page
  content stays mounted — this is the regression that pins "no navigation".
- Grep confirmed no other test referenced `/account/settings` (only the settings page, the shell's
  `TITLES`, and the profile page).

## Behaviour that deliberately did not change

`PasswordForm` still calls `signOut({ callbackUrl: "/login?reason=password-changed" })` on success —
a password change signs the guest out, and the modal does not soften that security contract. No
API, route handler, RPC, or database change.

## Verification

- `npm run typecheck` — clean.
- Targeted `npx vitest run components/account/account-security-dialog.test.tsx
  components/customer/customer-shell-notifications.test.tsx` — 2 files / 20 tests passed.
- Full `npx vitest run` — 177 files / 1981 tests, **1 failing**: `lib/password-reset-audit.test.ts`
  (pre-existing CRLF assertion, [[KI-012]], unrelated and unmodified). +8 tests over the previous
  1973.
- `npm run lint` — 0 errors, 70 pre-existing warnings, none in the changed files.
- `npm run build` — clean.

## Deploy (2026-10-03)

- **Committed** as `17b824d` with a **pathspec commit** (`git commit -- <paths>`) — the 8 files
  below. The parallel session's staged work (`app/api/account/profile/route.ts`, `lib/customer.ts`,
  `lib/manager-attention.*`, `lib/cancelled-folio-consistency.test.ts`) was left staged and
  untouched, and its `lib/request-batches.ts` / `lib/housekeeping-queue.ts` were not added.
- **Pushed** `b641d01..17b824d` to `origin/main` (`git ls-remote` confirms `17b824d`).
- **Deployment proven live, not assumed** — same public technique as the loyalty deploy: the
  app-router CSS chunks are content-hashed and `app/layout.tsx` imports `customer-portal.css`
  globally, so the portal chunk is fetchable from the production alias without credentials.
  - Before push: `1k_zs0e1djhi-.css`, sha256 `e13948be23088ddf…`, **0** `settings-theme-row` /
    `settings-body` matches.
  - After: the portal chunk became `2odo9rj1od4bl.css`, sha256 `47fb7070ca507aa8…`, carrying
    `.customer-shell .settings-theme-row{`, four `.customer-shell .settings-theme-row>button`
    rules (base, `:hover`, `[aria-checked=true]`, `:focus-visible`),
    `.settings-theme-row+.account-form` and `.customer-shell .settings-body{` — plus the previous
    deploy's `.loyalty-redeem` (40 matches), which confirms the same mechanism carried `febfc54`.

## Unresolved / next

- Authenticated browser QA pending ([[KI-005]], needs a guest login): from **My Reservations** with
  a form half-filled, open the account menu → **Account security** → the dialog opens over the
  untouched page; Tab stays inside it, Escape closes and focus returns to the menu button; the
  sound switch survives a reload; a real password change still lands on
  `/login?reason=password-changed`. Repeat from **My Profile**'s title button, in dark and light
  theme and at 390px, and confirm `/account/settings` typed directly still renders the fallback.
- The tree still holds a parallel session's staged work (`app/api/account/profile/route.ts`,
  `lib/customer.ts`, `lib/manager-attention.*`, `lib/cancelled-folio-consistency.test.ts`,
  `lib/request-batches.ts`, `lib/housekeeping-queue.ts`) — untouched by this change.
- No SYSTEM.md change: the guest account menu and `/account/settings` were never documented there.
