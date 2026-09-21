# 2026-09-18 - Customer Receipt Surface

Redesigned Customer → Payments & Folio so a customer can tell whether a payment is still being
verified, preview an official receipt once it is settled, and take it away as PDF, PNG, print or
email — all from one server-authoritative document.

## Delivered

- **One canonical model.** `lib/receipt.ts` defines `ReceiptDocument`, `receiptEligible()` and the
  ordered `receiptRows()` that *every* renderer walks (modal, print sheet, PNG painter, PDF writer,
  email body). Client-safe by design: it imports only `lib/format`, so the service-role Supabase
  client never reaches the browser bundle.
- **One server-authoritative assembler.** `getCustomerReceipt(userId, paymentId)` in `lib/customer`
  loads the payment, applies the eligibility predicate, loads the reservation with
  `.eq("user_id", userId)` (ownership), re-derives the VAT-inclusive breakdown from the frozen
  `operational_policy_snapshot` with a `getOperationalPolicy()` fallback, and attaches a real
  `financial_documents` `RCP-` number only when one exists. It never synthesises one.
- **Eligibility** = `status='paid' and purpose<>'refund'`, mirroring `accounting_generate_document`.
  This fixed a live defect: a `refund`-purpose payment with `status='paid'` used to render
  `View receipt` — an action the staff system would have refused.
- **Preview in a modal** (`components/customer/receipt-action.tsx`) instead of navigation, with
  `Email receipt` / `Print` / `Download` (PDF + PNG only, hand-rolled popover, Escape + click-outside,
  focus returned to the trigger). The canonical route `/account/receipts/[id]` still exists for
  direct links and printing and renders the *same* `ReceiptDocumentView`.
- **Zero new dependencies.** `lib/receipt-pdf.ts` is a hand-written base-14 Helvetica/WinAnsi A4 text
  PDF (isomorphic — it also produces the email attachment server-side); `lib/receipt-image.ts` paints
  a fixed-width canvas and exports a PNG of the *document*, never a page screenshot.
- **Print isolation** via `Modal portal` (`.dialog` becomes a direct `<body>` child) plus
  `body:has(> .dialog) > *:not(.dialog) { display:none }`, with a second branch for printing
  `/account/receipts/[id]` directly. Sidebar, header, bell, backdrop and toasts are all excluded.
- **Email destination** is `session.user.email` and nothing else — the route reads no address from
  the request body. With `RESEND_API_KEY` unset it returns `503 EMAIL_UNAVAILABLE`; the modal shows
  "Email receipt is currently unavailable." rather than faking a send.
- **Pending payments show no receipt.** A `pending_verification` row reads "Payment proof
  submitted — awaiting verification."; payment proof is the customer's upload, never a
  HAVEN-issued document.
- **`View reservation`** is now a real secondary button (`btn btn-soft`: border, padding, 44px hit
  area) instead of a bare text link, unchanged in route (`/my-reservations/<id>`).
- `lib/email.ts` gained optional `attachments`, additive; existing callers unchanged.

## Known limitation

Base-14 PDF fonts have no `₱` glyph, so the PDF prints `PHP 1,740.00` where the modal and PNG show
`₱1,740.00` — the same number from the same model, only the currency symbol differs. Documented
in-file. Accented characters in guest names are dropped (not transliterated) because the xref byte
offsets are string lengths.

## Verification

- `npm run typecheck`: clean.
- Targeted: `lib/receipt.test.ts` 22/22, `lib/receipt-route.test.ts` 10/10,
  `lib/customer-ownership.test.ts` 23/23, `lib/customer-workflows.test.ts` (receipt contract
  relocated from the page source to `lib/customer.ts` + `lib/receipt.ts`) — 66/66 together.
- `npm run build`: clean.
- `npm test`: 1447 passing / 4 failing. **All four failures are in the in-flight
  notification-history redesign** (`lib/notification-display.test.ts`,
  `components/customer/notification-history-modal.test.tsx`,
  `components/customer/customer-shell-notifications.test.tsx`); none of those files imports any
  receipt module. Those files were also being rewritten during this session by a concurrently
  active session in the same working tree.
- `npm run lint`: 1 error / 146 warnings. The single error is a pre-existing
  `react-hooks/static-components` finding in `components/customer/customer-notification-row.tsx`,
  present identically at HEAD (`git show HEAD:…`) and untouched by this work.
- Manual browser QA (all six scripts, three viewports, both themes) remains manual — this
  environment has no logged-in browser tooling.

## Related

`SYSTEM.md` §3 / §7.3 / §7.9 / §11 / §12 · [[D-018]] · [[Customer Payments & Folio]]
