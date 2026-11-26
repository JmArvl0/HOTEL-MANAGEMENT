# Movable AI toggle — 2026-11-26

The user asked to move the AI toggle anywhere vertically within header/footer
bounds. A shared client hook now controls the live and sample right-edge AI
toggles. Pointer dragging and Arrow/Home/End reposition them without changing
their horizontal edge. A 12px gap clears the visible app header and viewport
bottom or visible shell footer. The chosen pixel height is saved in localStorage
for this device, clamps when space shrinks, and returns when space grows. A
vertical drag or horizontal swipe does not activate the toggle; a click does.
The summary label follows the toggle. The sample initializes its saved height
when its toggle becomes available after loading. No AI route or hotel data
behavior changed.

Verification: 13 focused drawer tests; full Vitest 248 files / 2,551 tests
with `--testTimeout=30000`; `npm run typecheck`; touched AI ESLint with zero
errors or warnings; Impeccable detector returned no findings; isolated webpack
production build passed. The default 5s encoding guard timed out twice, but
the targeted guard and full suite passed with the longer CLI timeout. Build
output and generated Next config edits were removed. Authenticated desktop and
phone visual QA was unavailable because `/manager_dashboard` redirects this
browser to sign-in. No migration, deployment, or operational write.
