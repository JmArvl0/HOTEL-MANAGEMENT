# Exact Room Booking Implementation — 2026-11-11

User explicitly authorized all reviewed booking prototype features. Implemented
dedicated type/numbered-room pages; available first, gray unavailable last; account
room context; roomId through auth/OTP/details and selected-room number through
review/payment/confirmation; shared flag/code mobile field and range calendar.
Real catalog only. Existing registration/profile autofill and deposit policy kept.

Verified live ledger before additive migration20261111010000. Isolated CLI dry-run
and push applied only this migration, excluding all other pending changes. Ledger
version verified. Exact holds and assignment guards share the type lock; manual/
gateway conversion assigns the selected room transactionally; owned edits replace
holds atomically. Legacy/staff type-capacity RPC remains compatible.

Typecheck/release build pass; full2434/229 checkpoint, final targeted55/7 (including
two new calendar cases), touched lint0 errors/1 existing warning. Clean SQL replay,
23 backend and9 exact-room tests pass. HTTP16 pass against actual production app:
five Deluxe King/two Garden Twin rooms, retained callback/account context, unavailable
buttons/details, flag delivery and API401. Detector clean. No live account/booking/
email/payment created. No commit/push/app deployment; unrelated dirty work preserved.

Computer Use stopped on browser URL-confidence policy; visual/mobile and live
authenticated walkthrough pending. Node24 runtime differs from required22.x.
See `docs/qa/exact-room-booking-2026-11-11.md`. App3014 current server40003, build
`.tmp/exact-room-build-release`; receipts and isolated CLI in `.tmp/exact-room-release`.
