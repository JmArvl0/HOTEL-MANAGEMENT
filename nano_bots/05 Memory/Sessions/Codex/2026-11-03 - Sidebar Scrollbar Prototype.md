# Sidebar Scrollbar Prototype — 2026-11-03

## Approved implementation

User approved applying the proposal to shared components. Added scrollbar-only
rules to `app/sidebar-navigation.css` for staff outer/nav containers (Manager and
operational roles, Admin, Owner), Guest outer/nav, reusable AppShell, and reusable
Sidebar nav. Existing overflow, dimensions, focus and event behavior unchanged.

Verified typecheck; 37 navigation/theme/customer tests pass. Full suite 2068 pass /
1 pre-existing password-reset migration CRLF assertion failure. Production build
attempt failed fetching Inter and Playfair Display from Google Fonts. CSS-only
change; no JS/TS lint target added. Diff whitespace check clean.

Production-CSS overflow fixture: all eight expanded/collapsed account states
computed scrollbar-width none. Staff nav retains overflow-y auto; Guest outer
sidebar retains overflow-y auto. Native wheel reached staff nav scrollTop 546;
keyboard Home worked from a focused nav child. Signed-in live QA was not run.
Fixture: `public/prototypes/sidebar-scrollbar-implementation-qa.html` (synthetic
repeated menu items to force overflow; not production data or a real account view).

Earlier prototype work follows; its pending-implementation text is historical.

User requested a prototype hiding visible sidebar scrollbars while preserving
scrolling in expanded/collapsed navigation. Created isolated
`public/prototypes/sidebar-scrollbar-preview.html` and its ESM generator, reusing
the earlier approved sidebar mockup. Four panes compare current-style visible
scrollbars with proposed `scrollbar-width:none` / WebKit scrollbar hiding.
`overflow-y:auto` and keyboard focus remain; no production CSS changed.

Browser verified all four panes overflow and reach their maximum scroll positions.
Proposed expanded nav scrolls with native mouse wheel (scrollTop 355), and Home
returns it to 0 while computed scrollbar-width remains none. Lower-menu/reset
controls work. Generator ESLint and syntax pass. Preview screenshot saved beside
HTML. Current-style panes are explicitly labeled as mockups, not live captures.

URL: `/prototypes/sidebar-scrollbar-preview.html`. Await user direction before
applying scrollbar hiding to shared account sidebars. Earlier sidebar and landing
work preserved.
