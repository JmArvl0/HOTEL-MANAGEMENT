# Desktop Forecast Workspace — 2026-11-22

Predictive Analytics now sizes its charts, summary rails and pricing
table from the available desktop workspace. Compact layouts keep the
four KPI cards and place summary panels under the chart. Mid-sized
workspaces use a full-width pricing table. Wider monitors use a capped
1740px workspace.

The pricing table can be filtered by stay date. A shortcut from the
featured recommendation selects its date and focuses the filter.
Selections survive filter changes and produce a bounded review set.
Housekeeping highlights the busiest date by forecast task count.

Verified all five views in Edge at 1024×768, 1280×800, 1366×768,
1440×900, 1920×1080 and 2560×1440 with the sidebar open and collapsed.
Also verified dark-mode pricing selection, chart tooltip and accuracy
navigation. Typecheck, build and all 2,691 tests passed. Scoped lint
reported two existing effect warnings and zero errors. Screenshots are
under `.tmp/desktop-forecast-qa/`.
