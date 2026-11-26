# Front Office Reference Implementation (2026-11-09)

Applied the two supplied staff references to the existing Front Office workspace. Room Management has compact, collapsible room cards, shared status counts, Today's focus and Quick insights. Status filters and today’s booking queues use the same counts as their entry points. Dirty or blocked rooms are not shown as ready.

Bookings opens on the seven-day calendar. Its date controls, room groups, stay bars and Needs attention cards use current data and existing review actions. Booking list remains reachable when the calendar read fails. Recorded allocation segments, checkout-exclusive nights, and protected room and booking actions are retained.

Node 22 production build and 64 focused tests, including the encoding guard, passed. Full suite on Node 22 with four workers and a 15-second timeout had 2,402 passing tests and the existing purchase-order source assertion failure. The encoding guard timeout from the first run did not recur. Typecheck and touched-file ESLint passed. Browser layout checks used actual component markup with sample data at 320, 390, 1,024, 1,440 and 1,672 px in light and dark. Calendar scrolling remained contained and pinned the room column. No authenticated live staff workflow or deployment was performed.

Follow-up enlarged the focus and attention text, matched the Bookings header surface, and fixed both desktop rails to the available viewport height. Browser wheel checks at 1920×950, 1440×768, and 1280×650 kept both headings and panel frames in place while the main work areas scrolled. Long rail contents scroll within their frames. The 390px layout still stacks. Typecheck, touched ESLint, and 62 Front Office tests passed for the follow-up.

The staff header clock updates on the minute in Asia/Manila. The Bookings subtitle keeps the workspace description. Typecheck and 45 focused tests passed, including the Manila midnight rollover. ESLint reported five existing manager dashboard warnings and zero errors. Browser layout checks used sample data from 320 to 1,920 px in both themes.

November 10 follow-up gave Booking List its own full-width heading and separated its search and date range from the calendar. Existing booking actions and deep-linked queues remain available. Room Management hides both inner scrollbars and expands Today's focus and Quick insights into spare height. Typecheck, touched lint, and 62 focused tests passed. Sample-data Edge checks at 320, 390, 1,280, 1,440 and 1,920 px verified layout, with wheel and keyboard scrolling on desktop.
