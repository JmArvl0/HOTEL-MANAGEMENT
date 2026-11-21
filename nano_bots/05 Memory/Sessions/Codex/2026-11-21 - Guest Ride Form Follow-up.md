# Guest ride form follow-up

My Stay and checkout reveal a required bag count from 1 to 20 with luggage
assistance. The checkout confirmation trigger copies the saved count into
the pickup profile. Both flows deliver the count in Fleet's luggage field.

The location picker loads real OpenStreetMap tiles and requests a Photon
address only when the guest uses the pin. The result is editable and
coordinates fill the location when an address is unavailable. The ride
schedule controls retain native keyboard and mobile date and time pickers.

The local production build, scoped lint, all 2,670 tests, migration replay,
and authenticated Edge runs passed. Edge exercised public map tiles, pin
autofill, both guest flows, luggage counts in the synthetic partner request,
and fare deduplication. The updated preview on port 3218 uses the existing
synthetic credentials and leaves Fleet delivery off. Production was read
only to verify the migration ledger.
