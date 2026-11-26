# Predictive Dashboard Charts — 2026-11-22

Predictive Analytics now has five views in the existing Manager shell. The
scenario uses the property's forecast periods, data-quality labels, and
hotel-day time zone. The sidebar keeps the standard background. The Occupancy,
Housekeeping and Demand & Rate headers use existing Haven photos.

- Occupancy and Inventory show a solid historical series, a separate dashed
  forward series, a date divider and data gaps. Housekeeping pairs turnovers
  and hours and shows matched historical evidence below. Maintenance charts
  recorded weekly counts. Rates chart property-wide occupancy and one room
  type's nightly rate against its own currency axis.
- Forecast Accuracy previews share the existing matched-pair scoring and
  evidence endpoint. Existing Seasonal Outlook and comparison downloads are
  still reachable. Rate proposals retain the Owner/Admin approval step.
- The reference version compiled and rendered in the authenticated local
  Playwright run, with tests for mobile reflow, accuracy navigation, room and
  inventory selectors, pending rate proposals, and Gemini fallback. The
  polished chart update passed typecheck, scoped lint, the production build,
  and all 2,691 tests. The final Playwright run covered 1440px, 1024px and
  390px layouts, both modes, hover tooltips and the standard sidebar
  background. Screenshots are under `.tmp/reference-forecast-qa/`.
