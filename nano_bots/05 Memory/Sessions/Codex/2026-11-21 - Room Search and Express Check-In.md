# Room search and Express check-in

The public booking header keeps the wordmark and Book on one line. The
public search, exact-room page, and guest Find a Room share a compact stay
editor with readable date ranges and guest counts. Both public room lists
show availability and lead with the estimated stay total. Exact-room
booking preserves the chosen room through sign-in.

Express check-in now shows the Haven brand, a camera retry, manual entry
for the Express Pass QR code, and a Front Desk link. Sign-in help preserves
the kiosk destination. The booking sign-in contact link has an accessible name.

The final local build, scoped ESLint, typecheck, and 2,672 automated tests
passed. Edge at 320, 390, 768, and 1440 pixels verified room selection,
date edits, camera-denied fallback, and layout fit. The retry recovered a
simulated camera stream. A real synthetic guest QR reached the existing
eligibility check and received the expected rejection for the test stay.
No physical camera or completed check-in was exercised. The local preview
uses port 3261 and has live Fleet delivery off.
