# Amenities screen fit — 2026-11-12

User requested a single-screen Amenities section after clicking its nav link.
The approved imagery, copy, colors, configurable data and arrow-free cards remain.

The homepage frame is `100svh` minus the existing fixed header (88px desktop,
74px phone). Height-aware spacing keeps all six default amenities and the dining
card visible together at checked desktop/laptop sizes, including1280×720 and
1366×768. Short screens omit decorative icons/divider and the optional subtitle
before reducing useful space. Text stays readable and complete.

Desktop facilities and dining have independent overflow when their content
requires it; the dining height follows the frame rather than the growing list.
Tablet/phone layouts keep the heading visible and scroll their combined content
inside the remaining frame. The scroll areas are focusable and named. Native
keyboard/touch scrolling works, and the next page section stays below the frame.
The admin preview keeps its existing natural-height layout.

Clicking Amenities in desktop nav or the drawer resets its internal panes. Its
underline stays on Amenities when the nested dining card is also visible;
explicit Dining navigation still reaches the card and activates that link.

## Verified

- Node22.22.2 production build, standalone `npm run typecheck`, touched ESLint
  and mechanical design detector pass (detector returns an empty list).
- Full checkpoint:2487 tests across239 files pass with four workers. Final
  targeted suite after the nested-navigation fix:22 tests across four files pass.
- Actual production nav/drawer clicks at1672×941,1440×900,1366×768,1280×720,
  1200×800,1100×800,900×1024,768×1024,390×844,320×740 and844×390.
- All section bounds align below the header and end at the viewport bottom
  within rounding tolerance; no horizontal document overflow.
- Default desktop six-card/dining content fits without internal scroll at the
  checked widths of1280px and above. Narrower screens intentionally scroll
  within the bounded section; they do not display every card simultaneously.
- Keyboard End reaches dining without moving the outer page. Clicking Amenities
  resets to the first facility. Native touch drag scrolls the phone content pane.
- Component-rendered8/10/32-item fixtures retain the frame height; all facilities
  remain reachable and expansion does not stretch dining. Longer text/CTA works.
- Correct active link, smooth/reduced-motion navigation, Dining anchor and real
  booking CTA verified. No browser page errors.
- Evidence: `.tmp/amenities-fit/results.json`, viewport screenshots and
  `count-*.png`. This uses real production CSS with separately rendered fixtures;
  no CMS publication or database write was used for fixture scenarios.

Existing preview updated at `http://127.0.0.1:3078/#amenities`. No hosted release
or commit. Scoped implementation changes: amenities presentation/CSS, homepage
viewport opt-in, shared nav behavior and its regression tests.

## Visual review

ROUND 3
Seen in one second: the complete desktop amenities/dining frame below the nav.
Idea (one sentence): retain the hospitality split while fitting the user's screen.
Live thing: real nav, bounded native scrolling and existing amenities disclosure.
Layout words by section: desktop=split / narrow=bounded vertical flow.
Scores: design6.5 · usability8.5 · creativity6 · content8 → overall6.5.
Caps applied: existing user-specified card shadows/dividers from the reference.
Top three problems (most visible first), each with the screenshot it shows in and the fix:
1. 1280×720 overflow: recovered optional header space and tightened card/icon spacing.
2. Compact desktop underline favored nested Dining: keep Amenities current unless
   Dining was explicitly navigated to.
3. Returning from scrolled phone content retained its old position: reset native
   pane offsets from both nav entry points.
