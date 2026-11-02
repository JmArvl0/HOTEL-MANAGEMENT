# Haven frontend interface review — 22 October 2026

## Scope and confidence

This is a **targeted review of the current working tree**, including the unfinished shared profile popover changes. It maps the public/guest and staff interface architecture and shared design rules, then inspects the admin, owner, and manager header interactions in detail. It is not an exhaustive review of every role screen. `SYSTEM.md`, the live `DESIGN.md`, current source, the 18 October frontend audit, and the open browser QA checklist informed the review. The older audit is historical; its resolved findings are not counted as new defects here.

**Evidence:** source and CSS cascade inspection, plus existing component test coverage. No authenticated role session or rendered browser inspection was available. A targeted Vitest run was attempted but stopped before test collection with a sandbox `EPERM` rename error in the temporary directory; it establishes no pass or failure of product behavior. Visual fit, contrast, and mobile placement remain unverified.

## Assessment

The interface has a coherent foundation: one role-aware staff workspace, a separate guest surface, shared modal/control components, explicit light and dark palettes, reduced-motion rules, and documented responsive behavior. The main current risk is integration of the new account menu with legacy staff selectors. Source inspection also reveals two keyboard/accessible-name defects. The broad responsive and operational browser checks already listed in `docs/qa/browser-qa-checklist.md` remain outstanding.

## Findings, in priority order

| ID | Priority | Finding and impact | Evidence | Recommended action |
|---|---|---|---|---|
| FI-01 | **P1** | **Legacy staff styles override the new account menu.** Each identity `<p>` receives padding and a bottom border, so the intended compact name/email/role stack becomes three separated rows. The later staff rule also recolors all action buttons and hover states, overriding the new menu's normal and danger treatments. This affects the admin, owner, manager, and staff headers that use the component. CSS effect is source-confirmed; rendered severity needs a browser check. | `app/layout.tsx:18-19` imports the new menu CSS before `staff-theme.css`; `app/staff-theme.css:2272-2276` has the more specific `.app-shell .profile-popover p/button` rules; `components/ui/ProfilePopover.tsx:243-245,297-313` uses those elements. | Remove or narrowly scope the obsolete staff `.profile-popover` rules, then inspect the identity rows and Sign Out hover/focus in both themes and at phone width. |
| FI-02 | **P2** | **Arrow keys skip the Sound control.** The navigation selector includes only `button[role="menuitem"]`, while Sound is rendered as `role="menuitemcheckbox"`. A keyboard user can reach it with Tab, but Down/Up arrows cycle between Settings and Sign Out and omit a visible menu action. | `components/ui/ProfilePopover.tsx:85-103,197-204,297-302`; current tests assert Sound click but do not test arrow traversal (`components/ui/profile-popover.test.tsx:83-92`). | Include both menuitem roles in arrow navigation and add a focused keyboard test covering Settings → Sound → Sign Out in both directions. |
| FI-03 | **P2** | **The admin mobile navigation trigger has no accessible name.** Its only child is a logo marked `aria-hidden`, leaving an icon-only button unnamed to assistive technology. The equivalent owner and manager buttons have `aria-label="Open navigation"`. | `components/admin/admin-dashboard-client.tsx:281`; `components/ui/haven-logo.tsx:7-17`; compare `components/owner/owner-dashboard-client.tsx:272` and `components/manager/manager-dashboard-client.tsx:280`. | Add the same accessible label, and preferably `aria-controls`/`aria-expanded`, to the admin trigger. |
| FI-04 | **P3, latent** | **Submenus are built but not wired by current staff callers.** If an action with `submenu` is later supplied, the submenu sits outside a parent with `overflow: hidden`; it is likely to be clipped. This is a future interaction risk, not a currently observed user-facing failure. | `components/ui/profile-popover.css:32-42,205-224`; `components/ui/ProfilePopover.tsx:252-295`; current staff callers pass no `actions` submenus. | Before exposing submenus, give the submenu an unclipped layer/portal and test pointer and keyboard operation at desktop and phone widths. |

## Existing verification gaps

- **Staff mobile and dense work:** At 390 px, check the Room Reservations, Guest Folios, and Cash & Shifts tables, plus the arrival wizard modal. The current design allows horizontal table scrolling; ease of use is a browser judgment.
- **Shared header:** For admin, owner, manager, and the other staff roles, inspect the account menu at 390, 768, and 1366 px in both themes. Check anchor/bottom-sheet placement, identity spacing, focus, Sound toggle, Settings, and Sign Out. Guest account behavior is separate.
- **Operational flow:** The re-enabled cash-shift Close → count → reconcile path and owner-only sign-out dialog remain browser-unverified. These are already tracked in `nano_bots/05 Memory/Known Issues.md` as KI-014/015 and in `docs/qa/browser-qa-checklist.md`.

## Recommended sequence

1. Resolve FI-01 first because it changes the account menu's visible layout and colors across all staff shells.
2. Fix FI-02 and FI-03 with targeted interaction tests.
3. Perform the focused header browser matrix, then work through the existing mobile/operational QA checklist. Record actual screenshots and failures before rating visual quality or declaring the UI production-ready.

No application code was changed in this review.
