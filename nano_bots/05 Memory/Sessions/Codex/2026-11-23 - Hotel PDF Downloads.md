# 2026-11-23 Hotel PDF downloads

The local app downloads branded A4 Booking Confirmation, Checkout Folio,
Cash Shift Close Summary and Daily Operations Report PDFs. The shared route
checks guest booking ownership, existing drawer scope and report roles. It
only renders eligible booking states, issued checkout folios, closed drawers
and saved reports. The existing Front Desk/Accounting issuance action refreshes
an open reservation so the PDF is available immediately after issuance.

The renderer embeds the existing Haven logo and full Inter and Playfair fonts.
The variable-font subset rendered missing glyphs in Poppler, so the shipped
renderer uses full fonts. Long folio tables continue with repeated headings.
Guest documents omit payment references and adjustment reasons. This work
requires no migration and was not deployed.

The production build passed. Edge exercised all four download controls with
synthetic records and denied out-of-scope guest and cash drawer requests.
All four production-rendered examples passed visual and text checks. Typecheck
and the 52 focused tests passed. ESLint reported zero errors. The full suite
reported 2,734 passes and the pre-existing Room Rack style assertion failure.
