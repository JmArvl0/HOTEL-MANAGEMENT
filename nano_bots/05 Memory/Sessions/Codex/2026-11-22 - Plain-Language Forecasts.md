# Plain-language forecasts

- Replaced the shared KPI strip with the primary answer for each forecast tab. Occupancy gives tomorrow's booked rooms and expected occupancy. Seasonal Outlook gives an expected room count on an exact date or explains when earlier records are missing.
- Renamed the Forecast Accuracy view and report link. It states which forecast was closer and shows the average errors. MAPE, formulas and forecast records remain available in disclosures and the evidence export remains available.
- Typecheck, scoped ESLint, the production build and all 2,691 tests passed. Authenticated Edge checked the room outlook, accuracy, cold-start seasonal view, exact date, and the 390px layout with synthetic records. Screenshots are in `.tmp/plain-forecast-qa`.
- Local changes only. The frozen defense release branch still points to `91e910b`.
