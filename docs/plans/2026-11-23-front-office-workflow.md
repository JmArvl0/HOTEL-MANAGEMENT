# Front Office workflow implementation plan

November 23, 2026 · Haven Hotel Management

## Outcome

Front Desk can book a returning guest without retyping contact data, work today's arrivals from the first unresolved requirement, and see what needs to happen before the next guest can use a room. Each action uses the existing booking, folio, identity, room and housekeeping rules.

## 1. Booking and repeat guests

- Use one booking dialog for walk-in, phone, and future Front Desk reservations. Carry the source from the chosen entry point and use the hotel date for walk-ins.
- Search or start with an explicitly selected saved profile. Keep the selected guest identity visible and distinguish profile data from stay notes.
- Show priced room types only after the stay dates and party size are valid. Refresh availability after edits and keep the draft during retry or an inventory conflict.
- Resolve uncertain submissions by request identity before allowing a new booking. Keep the walk-in handoff to check-in. Add Book again to the guest dossier.

## 2. Arrival and room readiness

- Direct an arrival to the first actionable server-reported blocker. Keep the existing final check-in gate and use a fresh assessment after relevant changes.
- Restore a previously selected room if it is still eligible. Prefer a valid exact-room assignment and suggest an eligible room for an unassigned stay. Staff confirm the room.
- Give Room Management a quick view of rooms needing attention. Show occupancy, turnover, serviceability and selling status in the existing room detail with the current stay and next arrival.

## 3. Profile and history

- Offer scoped, audited edits to explicitly saved contact and preference fields. Preserve account identity, historical reservation data and Manager/Owner merge restrictions.
- Show a concise set of reservation events backed by recorded timestamps. Give cancellation and no-show separate reason presets and keep notes available.
- Preserve the underlying module's search and date filters while staff work in related details.

## Visual direction

Use Design Taste Frontend's Framed Sheet direction (seed `604338512`) with Haven's existing Inter typography and staff color tokens. The booking dialog uses one quiet, tinted frame around a crisp working surface. Its stay summary keeps the guest, dates, room and quoted total visible as staff move through the form. Arrival and room details lead with the blocker and action. Use 44px touch targets, visible keyboard focus, inline validation, and distinct loading, empty and retry states. Keep the shared staff shell.

## Acceptance

- Rehearse a repeat phone booking, new walk-in, concurrent room loss, and an uncertain create. A selected returning guest requires zero retyped contact fields and one unchanged retry creates one reservation.
- Exercise a clean arrival and blocked identity, payment, room, or inspection states. Confirm that stale room data still fails the final server check.
- Review saving permitted profile details, viewing activity, and recording cancellation/no-show reasons. Check role boundaries and preserved history.
- Run touched-file lint, TypeScript, targeted tests, the full Vitest suite and production build. Review desktop, tablet and phone layouts in a real browser with synthetic data.

## Local acceptance evidence

- Disposable PostgreSQL replay and workflow checks passed for concurrent retry, quote changes, recovery scoped to the operator, profile edit conflicts, stay-only contact, and cancellation reason persistence.
- Typecheck, production build, 2,704 Vitest tests and 82 final targeted tests passed. ESLint reported zero errors on the changed files.
- Edge exercised phone booking recovery, the arrival room action, and room turnover navigation at 1440, 768 and 390 pixels with synthetic records.
- The automated design scan allowed the dialog shadow and the masked background behind the open dialog. It still flagged button shadows in the preview shell.
- Release pairs migration `20261123010000` with the matching app build. A signed-in production rehearsal and before-and-after staff timings remain pending.
