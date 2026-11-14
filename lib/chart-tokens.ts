/**
 * Single source of truth for chart color values.
 *
 * Recharts SVG attributes cannot consume most CSS tokens safely across the
 * staff dark/light surfaces, so charts need raw hex strings. Before this
 * module, each panel kept a private hex palette (manager overview, HAVEN AI
 * predictive, performance reports), which is
 * the same drift FleetOps fixed with its own `src/lib/chart-tokens.js`.
 *
 * Values mirror what shipped in each panel as of 2026-10-19, so adopting the
 * module is a no-visual-change consolidation. If you change a value here,
 * expect a browser check on every consumer below.
 */
export const CHART_GRID = "#e8e7e2";
export const CHART_AXIS = "#94a3b8";
/** Occupancy "fact" series accent (manager overview, predictive bar). */
export const CHART_OCCUPANCY = "#176773";
/** Report-surface occupancy variant (performance reports). */
export const CHART_REPORT_OCCUPANCY = "#2a9098";
/** Settled collections (Accounting Reports). */
export const CHART_COLLECTED = "#1b7b81";
/** Refund outflows (Accounting Reports). */
export const CHART_REFUNDED = "#c46a62";
/** Prediction/forecast series (amber). */
export const CHART_FORECAST = "#b8860b";
