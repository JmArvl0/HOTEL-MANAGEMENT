# Booking account summary

The booking sign-in screen previously showed both versions of the stay
summary on mobile. The rate block also inherited grid styles that squeezed
its text against the left edge. The shared summary now uses a clear room
heading, stay dates, guest count, estimated total, and an edit link. Desktop
pairs the room photo and summary with the form. Narrow layouts show one
thumbnail summary with all facts and actions.

Local Edge at 320, 390, 643, 768, 900 and 1440 pixels verified one visible
summary, the room image and rate, no horizontal overflow, and the sign-in
heading in view. Mobile verified keyboard navigation to room selection,
switching between sign-in and registration, and guest sign-in back to
checkout. The production build, typecheck, scoped ESLint and all 2,670
tests passed. The visual inspector found no failures and flagged the
intentional warm neutral from the existing Haven palette.

The local preview on port 3241 uses a fictional Deluxe King room and the
existing local guest credentials, with live Fleet delivery off.
