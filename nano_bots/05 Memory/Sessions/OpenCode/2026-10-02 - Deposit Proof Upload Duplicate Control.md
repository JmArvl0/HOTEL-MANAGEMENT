# 2026-10-02 - Deposit Proof Upload Duplicate Control

## Symptom
On the reservation deposit page, two visibles controls with the same purpose:
a native file input (`input.sr-only-proofs`) beside the styled
`button.proof-upload`. User asked to remove the input.

## Finding
One control in two halves (`components/booking/confirm-booking-form.tsx:120-133`):
the input owns `onChange/pickFile`, the `accept` filter, the `aria-label`, and
is the reset target for staged Replace/Remove; the button only forwards clicks
via `fileInput.current?.click()`. Deleting the input tag would silently kill
the upload, so the visible duplication was removed instead of the tag: the
`sr-only-proofs` class matched NO loaded CSS rule (`.sr-only` lives only in
`haven-loader.css` and staff-scoped theme CSS; no `input[type=file]` rule in
`app/`), so the native input rendered in the open.

## Fix
- `app/guest-booking.css` — one scoped rule
  `.proof-field input[type="file"]` with the standard 1px-clip hiding block
  (never `display:none`, which would break picker forwarding). Zero JSX churn.
- `components/booking/confirm-booking-form.test.tsx` — new describe:
  stylesheet-walk asserts the hiding rule exists with `clip:`, and forbids
  `display:none` / `visibility:hidden` on it.

## Gates
typecheck clean; eslint clean on touched test; targeted 4 files / 116 tests
pass; full suite 1922/1923 (1 pre-existing unrelated
`password-reset-audit.test.ts` failure, identical without this change);
`npm run build` clean; `git diff --check` clean. Manual browser QA pending
(KI-005): deposit page shows one upload control, keyboard + 390px.
