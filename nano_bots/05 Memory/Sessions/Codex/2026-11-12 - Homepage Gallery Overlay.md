# Homepage gallery overlay — 2026-11-12

The user asked for the whole photo grid to appear on the landing page. See full
gallery opens a native full-screen dialog with All Photos selected and three
columns. The photo viewer opens in a second native dialog above the grid. Closing
the viewer restores tile focus. Closing the grid restores the button and page
scroll position. The footer links to the homepage gallery section, and direct
`/gallery` URLs share the grid component. Short windows and longer collections
can scroll inside the overlay, with Close gallery always visible.

Production Edge verified all nine demo photos and captions in view at 1910×942,
1440×900, 1366×768, 1280×720, 768×1024, 390×844 and 320×640. Verified the same URL,
category filters, Close/Escape, two levels of focus restoration, phone taps and
filter swipe, short landscape scrolling and the direct route. Fixed a short
landscape homepage flex overlap found during production QA. Final browser run
passed with no page errors. Screenshots and bounds are in `.tmp/gallery-overlay/`.

Final production build, typecheck, touched ESLint, focused 15 and full 2,469
tests passed. The full suite preceded the final CSS-only landscape adjustment,
which was checked in the final build and browser run. Source detector returned
`[]`. Preview `http://localhost:3052/#gallery` (session 60655).
