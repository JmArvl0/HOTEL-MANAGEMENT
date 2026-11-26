# Financial Documents Design Prototype

The [standalone preview](../../../../public/prototypes/financial-documents-preview.html)
uses twelve fictional issued documents. The register filters by type, issue
date in Manila, document number, guest name, or booking reference. Desktop
shows the selected snapshot beside the list. On phones, Back to documents
restores the filtered page and focus.

The receipt leads with its own payment. The folio leads with the balance at
issue. The other recorded figures, optional VAT breakdown, payments, charges,
and adjustments remain available in disclosures.

Chromium verified both themes at nine widths from 320 to 1,440 px, keyboard
and touch navigation, the empty/reset state, paging, and the older snapshot
without a tax breakdown. Sampled text contrast exceeded 4.5:1 in both themes.
Prototype JavaScript lint, typecheck, and 88 focused finance tests passed.

This is a design review artifact only. No live screens, document issuance
flows, access rules, database, or deployment changed.
