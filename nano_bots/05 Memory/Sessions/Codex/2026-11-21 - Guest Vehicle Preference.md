# Guest vehicle preference

Updated both guest ride forms. My Stay only asks for a passenger name or
number when the saved value is missing or invalid. Checkout uses the room
booking contact. The vehicle selection is optional and must fit the group.
Haven sends it as a Fleet special request and retains the guest's own note.

Typecheck, scoped ESLint, 65 targeted tests, production build and local Edge
QA passed. The synthetic HTTPS Fleet accepted the selected vehicle preference
for both paths, and fare confirmation still posted once across replays. The
manual preview uses an isolated local guest and stay with Fleet delivery off.
No production migration, deployment or ride was created.
