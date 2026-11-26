# Guest draft history — November 24, 2026

The previous build lost the address on Back then Forward and Forward then
Back. Local Edge restored both on the new build, along with incomplete
mobile input, breakfast, arrival and ride selections. The draft belongs to
its history entry and signed-in booking. Browser history contains an opaque
ID and the values live in document memory.

Confirmed in-app departure and accepting reload discarded the draft.
Review booking saved the synthetic address in a disposable room hold.
The regression also verified that a successful hold clears the draft.
The browser stopped before payment and created no wallet session.

The local production build, TypeScript, scoped lint, 50 targeted tests and
the full 2,751-test suite passed.

[R23 and remaining acceptance](../../../../docs/audits/GUEST-REGRESSION-TEST-REPORT.md#browser-back-and-forward)
