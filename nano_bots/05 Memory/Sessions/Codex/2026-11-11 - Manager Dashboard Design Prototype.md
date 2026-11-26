# Manager Dashboard Design Prototype

The [standalone preview](../../../../public/prototypes/dashboard-preview.html)
uses a fixed Manila shift snapshot. Four headline metrics open sample
details. Decisions and exceptions can be filtered, and the room rack
shows the count and details for each readiness state. The shift briefing
summarizes the priority work. Booked occupancy compares two seven-night
periods, alongside today's collections and open folio figures.

Chrome opened the HTML directly and verified all 13 detail controls, keyboard
focus return, the three queue filters, both chart periods, section navigation,
and light and dark layouts at 14 widths from 320 to 1,920 px. Sampled text
contrast, JavaScript lint, typecheck, and all 2,417 repository tests passed.
The isolated Next.js build stopped when Windows denied creation of a `sharp`
junction. The prototype reads only bundled sample assets and records.

Today's finances masks each peso amount after its first digit. The eye
button reveals all four amounts with centavos, and a reload restores the
masked state. Chrome verified keyboard and pointer toggling, reload, and
both themes at 320, 390, 768, and 1,440 px. JavaScript lint and typecheck passed.
