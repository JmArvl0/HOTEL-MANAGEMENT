"use client";

import { fetchPublic, readResponse } from "@/lib/client-errors";

import { userMessage } from "@/lib/errors";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, BedDouble, Boxes, CalendarDays, ChartNoAxesCombined, Clock, ClipboardCheck, RefreshCw, Sparkles, Target, TriangleAlert } from "lucide-react";
import { usePrefersReducedMotion } from "@/lib/motion/reduced-motion";
import { CHART_GRID } from "@/lib/chart-tokens";
import { TablePagination, useTablePagination } from "@/components/ui/table-pagination";
import { Modal, PageHeader } from "@/components/ui";
import { HavenSkeletonCard } from "@/components/ui/haven-data-controls";
import PredictivePricingPanel from "@/components/manager/predictive-pricing-panel";
import ForecastEvaluationPanel, { ForecastAccuracyPreview } from "@/components/manager/forecast-evaluation-panel";
import SeasonalOccupancyPanel from "@/components/manager/seasonal-occupancy-panel";
import { shiftDate } from "@/lib/analytics/types";
import type { EvaluationMetric } from "@/lib/analytics/evaluation";
import { OCCUPANCY_MODEL_VERSION, type OccupancyDay } from "@/lib/analytics/occupancy";
import { HOUSEKEEPING_MODEL_VERSION, type HousekeepingDayForecast } from "@/lib/analytics/housekeeping";
import { INVENTORY_MODEL_VERSION, type InventoryRisk } from "@/lib/analytics/inventory";
import { MAINTENANCE_MODEL_VERSION, maintenanceRiskKey, type MaintenanceRisk } from "@/lib/analytics/maintenance";
import { FORECAST_TABS, ForecastLegend, ForecastTimeline, ForecastTooltip, ForecastCard, ForecastHeader, ForecastMetrics, ForecastQuality, forecastPeriod, type ForecastTab } from "./forecast-workspace";
import frame from "./forecast-evaluation-panel.module.css";
import styles from "./forecast-workspace.module.css";

/**
 * Predictive Insights — the analytics engine's storefront. Every number on
 * this page is computed by HAVEN's own forecast models (lib/analytics); the
 * [Explain with AI] buttons send that same server-rebuilt output to Gemini
 * for interpretation. Gemini never produces figures, and the panel labels
 * what is booked fact versus predicted.
 */

type InsightsData = {
  generatedAt: string; lastSnapshotAt: string | null; snapshotUnavailable?: boolean; snapshotCount: number; databaseMode: string;
  occupancy: { today: string; days: OccupancyDay[]; method: string; notes: string[]; historyUnavailable?: boolean; history?: { date: string; percent: number | null }[] };
  housekeeping: { today: string; days: HousekeepingDayForecast[]; method: string; notes: string[] };
  inventory: { today: string; items: InventoryRisk[]; shortageCount: number; attentionCount: number; method: string; notes: string[] };
  maintenance: { today: string; risks: MaintenanceRisk[]; elevatedCount: number; method: string; notes: string[]; history?: { date: string; count: number }[] };
};

type Explanation = {
  explanation: string;
  key_factors: string[];
  data_quality_note: string;
};

const AI_DISCLOSURE = "AI-generated operational guidance. Verify important decisions using authoritative HAVEN records.";

const label = (value: unknown) => String(value ?? "—").replaceAll("_", " ");
const fmtDay = (value: string) => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
};
const fmtStamp = (value: string | null) => value
  ? new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" }).format(new Date(value))
  : "—";
const riskBadge = (risk: string) => `badge ${risk === "high" ? "cancelled" : risk === "medium" ? "pending" : "confirmed"}`;
const priority = { high: 2, medium: 1, low: 0 };
const percent = (value: number | undefined) => value === undefined ? "—" : `${value}%`;
const fixed = (value: number | undefined | null, unit: string) => value == null ? "—" : `${value} ${unit}`;
const lastReported = (days: number | null) => days === null ? "—" : days <= 0 ? "Today" : days === 1 ? "Yesterday" : `${days} days ago`;

function ExplainButton({ type, onExplain, busy }: { type: string; onExplain: (type: string) => void; busy: boolean }) {
  return (
    <button type="button" className="btn btn-soft btn-sm" onClick={() => onExplain(type)} disabled={busy}>
      <Sparkles size={14} aria-hidden="true" /> {busy ? "Preparing explanation…" : "Explain with Gemini"}
    </button>
  );
}

function ExplanationCard({ explanation, onClose }: { explanation: Explanation; onClose: () => void }) {
  return (
    <Modal isOpen onClose={onClose} className={styles.drawer} title="Gemini explanation" description="Read-only interpretation of HAVEN’s model output.">
      <div className="ai-explanation">
        <p>{explanation.explanation}</p>
        <ul>{explanation.key_factors.map((factor) => <li key={factor}>{factor}</li>)}</ul>
        <small>{explanation.data_quality_note}</small>
        <footer>{AI_DISCLOSURE}</footer>
      </div>
    </Modal>
  );
}

export default function PredictiveInsightsPanel({ view, onViewChange, onOpenWork }: {
  view?: ForecastTab; onViewChange?: (tab: ForecastTab) => void;
  onOpenWork?: (section: "housekeeping_tasks" | "inventory" | "maintenance_orders", search?: string) => void;
}) {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [explanation, setExplanation] = useState<{ type: string; data: Explanation } | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [localTab, setLocalTab] = useState<ForecastTab>("occupancy");
  const activeForecastTab = view ?? localTab;
  const setActiveForecastTab = onViewChange ?? setLocalTab;
  const [accuracy, setAccuracy] = useState<{ metric: EvaluationMetric; inventoryItem?: string }>({ metric: "occupancy" });
  const [occupancyDate, setOccupancyDate] = useState("");
  const [inventoryItem, setInventoryItem] = useState("");
  const [maintenanceIssue, setMaintenanceIssue] = useState("");
  const tabRefs = useRef<Partial<Record<ForecastTab, HTMLButtonElement | null>>>({});
  function viewAccuracy(metric: EvaluationMetric, inventoryItem?: string) {
    setAccuracy({ metric, inventoryItem });
    setActiveForecastTab("evaluation");
    window.requestAnimationFrame(() => document.getElementById("forecast-panel-evaluation")?.focus());
  }
  // Roving tabindex + arrow/Home/End, mirroring the room-detail tab pattern.
  const handleTabKeys = (event: React.KeyboardEvent) => {
    const index = FORECAST_TABS.findIndex((entry) => entry.key === activeForecastTab);
    let next: number | null = null;
    if (event.key === "ArrowRight") next = (index + 1) % FORECAST_TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + FORECAST_TABS.length) % FORECAST_TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = FORECAST_TABS.length - 1;
    if (next === null) return;
    event.preventDefault();
    setActiveForecastTab(FORECAST_TABS[next].key);
    tabRefs.current[FORECAST_TABS[next].key]?.focus();
  };
  // Motion policy: chart draw-in off under prefers-reduced-motion (docs/ui-motion-guidelines.md).
  const chartAnimated = !usePrefersReducedMotion();

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetchPublic("/api/analytics/insights", { cache: "no-store", signal });
      const body = await readResponse(response);
      if (signal?.aborted) return;
      if (!response.ok) throw new Error(body?.error ?? "Unable to load predictions.");
      setData(body.data);
      setError("");
    } catch (caught) {
      if (!signal?.aborted) setError(userMessage(caught, "Unable to load predictions."));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (!controller.signal.aborted) return load(controller.signal);
    });
    return () => controller.abort();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    setToast("");
    try {
      const response = await fetchPublic("/api/analytics/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const body = await readResponse(response);
      setToast(response.ok ? "Predictions refreshed and snapshot recorded." : body?.error ?? "Unable to refresh predictions.");
      if (response.ok) await load();
    } catch {
      setToast("Unable to reach HAVEN.");
    } finally {
      setRefreshing(false);
    }
  };

  const explain = async (type: string, focus?: string) => {
    if (explaining) return;
    setExplaining(true);
    setExplanation(null);
    try {
      const response = await fetchPublic("/api/ai/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, focus })
      });
      const body = await readResponse(response);
      if (response.ok && body.data) setExplanation({ type, data: body.data });
      else setToast(body?.message ?? body?.error ?? "AI interpretation is unavailable right now.");
    } catch {
      setToast("AI interpretation is unavailable right now.");
    } finally {
      setExplaining(false);
    }
  };

  const housekeepingRows = data?.housekeeping.days ?? [];
  const stockPriority = { "predicted-shortage": 3, "current-low-stock": 2, "predicted-below-reorder": 1, none: 0 };
  const inventoryRows = [...(data?.inventory.items ?? [])].sort((a, b) =>
    stockPriority[b.riskBasis] - stockPriority[a.riskBasis] || a.name.localeCompare(b.name));
  const housekeepingPage = useTablePagination(housekeepingRows);
  const inventoryPage = useTablePagination(inventoryRows);

  if (loading) return <div role="status" aria-label="Preparing this week’s outlook"><HavenSkeletonCard hasHeader /></div>;
  if (error) return <div className="insights-state insights-state-error" role="alert"><Activity size={24} /><h3>Predictions unavailable</h3><p>{error}</p><button type="button" className="btn btn-soft" onClick={() => { setLoading(true); void load(); }}>Try again</button></div>;
  if (!data) return null;

  const attentionItems = inventoryRows.filter(item => item.riskBasis !== "none");
  const overbookedDay = data.occupancy.days.find(day => day.overbookedRooms > 0);
  const housekeepingToday = housekeepingRows.find(day => day.date === data.housekeeping.today);
  const occupancyTomorrow = data.occupancy.days.find(day => day.date === shiftDate(data.occupancy.today, 1));
  const selectedOccupancy = data.occupancy.days.find(day => day.date === occupancyDate) ?? occupancyTomorrow;
  const housekeepingTomorrow = data.housekeeping.days.find(day => day.date === shiftDate(data.housekeeping.today, 1));
  const occupancyToday = data.occupancy.days.find(day => day.date === data.occupancy.today);
  const predictedDays = data.occupancy.days.flatMap(day => day.predictedOccupancyPct === undefined ? [] : [{ date: day.date, expected: day.predictedOccupancyPct }]);
  const rankedOccupancy = [...predictedDays].sort((a, b) => b.expected - a.expected);
  const peak = rankedOccupancy[0];
  const low = rankedOccupancy.length > 1 ? rankedOccupancy.at(-1) : undefined;
  const averageExpected = predictedDays.length ? Math.round(predictedDays.reduce((sum, day) => sum + day.expected, 0) / predictedDays.length) : undefined;
  const occupancyPeriod = forecastPeriod(data.occupancy.days[0]?.date, data.occupancy.days.at(-1)?.date);
  const busiest = [...housekeepingRows].sort((a, b) => b.totalTasks - a.totalTasks)[0];
  const hasWork = busiest && busiest.totalTasks > 0;
  const staffingDay = housekeepingTomorrow ?? busiest;
  const selectedItem = inventoryRows.find(item => item.itemId === inventoryItem) ?? inventoryRows[0];
  const selectedShortage = (selectedItem?.projectedShortage ?? 0) > 0;
  const maintenanceRows = [...data.maintenance.risks].sort((a, b) =>
    priority[b.risk] - priority[a.risk] || b.openIncidents - a.openIncidents || b.incidents90Days - a.incidents90Days);
  const selectedIssue = maintenanceRows.find(issue => maintenanceRiskKey(issue) === maintenanceIssue) ?? maintenanceRows[0];
  const highIssue = maintenanceRows.find(issue => issue.risk === "high");
  const itemsWithoutEstimate = data.inventory.items.filter(item => item.predictedConsumption === null).length;
  const history = data.occupancy.history ?? [];
  const hasActualOccupancy = history.some(day => day.percent !== null);
  const chartData = [
    ...(hasActualOccupancy ? history.map(day => ({ date: day.date, actual: day.percent })) : []),
    ...data.occupancy.days.map(day => ({
      date: day.date, booked: day.totalRooms ? Math.min(day.knownOccupancyPct, 100) : undefined,
      expected: day.predictedOccupancyPct
    }))
  ];
  const usageChart = selectedItem ? [
    ...(selectedItem.usageHistory ?? []).map(day => ({ date: day.date, actual: day.quantity })),
    { date: data.inventory.today },
    ...Array.from({ length: 3 }, (_, index) => ({ date: shiftDate(data.inventory.today, index + 1), expected: selectedItem.dailyExpected }))
  ] : [];
  const hasTimedWork = housekeepingRows.some(day => day.estimatedLaborHours !== undefined);
  return (
    <div className={`predictive-insights ${styles.workspace}`} data-view={activeForecastTab}>
      <PageHeader variant="band" className="insights-title" title="Predictive Analytics" actions={<>
          <span className="insights-freshness"><Activity size={15} /><span><b>{data.databaseMode === "demo" ? "Demo outlook" : "Live forecast calculated"}</b><small>{fmtStamp(data.generatedAt)} Manila</small></span></span>
          <button type="button" className="btn btn-accent" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={refreshing ? "is-spinning" : ""} size={16} /> {refreshing ? "Refreshing…" : "Refresh predictions"}
          </button>
        </>} />

      <div className={styles.utilityBar}>
      {data.databaseMode !== "demo" && <p className={styles.description}>
        {data.snapshotUnavailable ? "Saved forecast status is unavailable." : data.lastSnapshotAt ? `Last saved forecast · ${fmtStamp(data.lastSnapshotAt)} Manila` : "No forecast batch has been saved yet."}
      </p>}
      <label className={`${styles.control} ${styles.viewSwitcher}`}>Forecast view
        <select value={activeForecastTab} onChange={event => setActiveForecastTab(event.target.value as ForecastTab)}>
          {FORECAST_TABS.map(tab => <option key={tab.key} value={tab.key}>{tab.label}</option>)}
        </select>
      </label>
      </div>
      {toast && <p className="insights-toast" role="status">{toast}</p>}

      <div className="insights-tabs" role="tablist" aria-label="Forecast views" onKeyDown={handleTabKeys}>
        {FORECAST_TABS.map(({ key, label: tabLabel, icon: TabIcon }) => (
          <button key={key} ref={(element) => { tabRefs.current[key] = element; }} type="button" role="tab" id={`forecast-tab-${key}`} aria-selected={activeForecastTab === key} aria-controls={`forecast-panel-${key}`} tabIndex={activeForecastTab === key ? 0 : -1} className={activeForecastTab === key ? "active" : ""} onClick={() => setActiveForecastTab(key)}><TabIcon size={14} aria-hidden="true" />{tabLabel}</button>
        ))}
      </div>

      {FORECAST_TABS.filter(tab => tab.key !== activeForecastTab).map(tab => <div key={tab.key} id={`forecast-panel-${tab.key}`} hidden />)}
      {activeForecastTab === "occupancy" && (
        <article className={styles.view} role="tabpanel" id="forecast-panel-occupancy" aria-labelledby="forecast-tab-occupancy" tabIndex={0}>
          <ForecastHeader view="occupancy" title="Occupancy Forecast" description="See how full the hotel could get, based on past stays and current bookings." period={occupancyPeriod}>
            <ExplainButton type="occupancy" onExplain={type => explain(type, selectedOccupancy?.date)} busy={explaining} />
          </ForecastHeader>
          {overbookedDay && <div className={styles.alert} role="status"><TriangleAlert size={20} aria-hidden="true" /><div>
            <strong>{fmtDay(overbookedDay.date)} has {overbookedDay.overbookedRooms} bookings above currently serviceable capacity.</strong>
            <p>{overbookedDay.knownOccupied} booked · {overbookedDay.serviceableRooms} serviceable</p>
          </div></div>}
          <ForecastMetrics metrics={[
            { label: "Already booked today", value: occupancyToday?.totalRooms ? percent(occupancyToday.knownOccupancyPct) : "—", detail: occupancyToday ? `${occupancyToday.knownOccupied} of ${occupancyToday.totalRooms} rooms` : "Hotel-wide", icon: BedDouble },
            { label: "Expected tomorrow", value: percent(occupancyTomorrow?.predictedOccupancyPct), detail: occupancyTomorrow ? fmtDay(occupancyTomorrow.date) : "No estimate available", icon: CalendarDays },
            { label: "Average expected", value: percent(averageExpected), detail: predictedDays.length ? `Across ${predictedDays.length} estimated ${predictedDays.length === 1 ? "date" : "dates"}` : "More history needed", icon: ChartNoAxesCombined },
            { label: "Highest expected", value: percent(peak?.expected), detail: peak ? fmtDay(peak.date) : "More history needed", icon: Target }
          ]} />
          <div className={styles.split}>
            <ForecastCard title="7-day occupancy outlook" description="Recorded occupancy before today and the expected occupancy for upcoming nights.">
              {occupancyToday?.totalRooms ? <ForecastTimeline data={chartData} actualLabel="Recorded occupancy" expectedLabel="Expected occupancy" today={data.occupancy.today} unit="%" maximum={100} focusDate={selectedOccupancy?.date} animated={chartAnimated} />
                : <p className={styles.unavailable}>Add active rooms to get an occupancy outlook.</p>}
              <ForecastLegend items={[
                ...(hasActualOccupancy ? [{ label: "Recorded occupancy", series: "actual" as const }] : []),
                ...(predictedDays.length ? [{ label: "Expected occupancy", series: "expected" as const }] : []),
                { label: "Already booked", series: "booked" as const }
              ]} />
              <details className={frame.details}>
                <summary>Daily room figures</summary>
                {data.occupancy.historyUnavailable && <p>Recorded occupancy is temporarily unavailable.</p>}
                <div className={styles.table} tabIndex={0} role="region" aria-label="Daily room figures">
                  <table>
                    <thead><tr><th scope="col">Date</th><th scope="col">Booked</th><th scope="col">Expected occupied</th><th scope="col">Available to sell*</th><th scope="col">Recorded occupancy</th></tr></thead>
                    <tbody>{history.map(day => <tr key={day.date}><th scope="row">{fmtDay(day.date)}</th><td>—</td><td>—</td><td>—</td>
                      <td>{day.percent === null ? "Unrecorded" : percent(day.percent)}</td></tr>)}
                    {data.occupancy.days.map(day => (
                      <tr key={day.date}><th scope="row">{fmtDay(day.date)}</th><td>{day.knownOccupied} rooms</td><td>{day.predictedOccupied ?? "—"}{day.predictedOccupied !== undefined && ` rooms · ${percent(day.predictedOccupancyPct)}`}</td><td>{day.roomsAvailableToSell ?? "—"}</td><td>—</td></tr>
                    ))}</tbody>
                  </table>
                </div>
                <p className={styles.description}>*Estimate uses currently serviceable rooms less current bookings for each date.</p>
              </details>
            </ForecastCard>
            <div className={styles.rail}>
              <ForecastCard title="Forecast summary" emphasis>
                {averageExpected !== undefined && <div className={styles.figure}><strong>{averageExpected}%</strong><span>Average across {predictedDays.length} estimated {predictedDays.length === 1 ? "night" : "nights"}</span></div>}
                {selectedOccupancy && <label className={styles.control}>View a hotel night
                  <select value={selectedOccupancy.date} onChange={event => setOccupancyDate(event.target.value)}>
                    {data.occupancy.days.map(day => <option key={day.date} value={day.date}>{fmtDay(day.date)}</option>)}
                  </select>
                </label>}
                {selectedOccupancy?.totalRooms ? <>
                  <h4>{fmtDay(selectedOccupancy.date)} · {selectedOccupancy.knownOccupied} of {selectedOccupancy.totalRooms} rooms are already booked.</h4>
                  <p>{selectedOccupancy.predictedOccupancyPct !== undefined
                    ? `HAVEN expects ${selectedOccupancy.predictedOccupied ?? "—"} ${selectedOccupancy.predictedOccupied === 1 ? "room" : "rooms"} to be occupied (${selectedOccupancy.predictedOccupancyPct}%).`
                    : "HAVEN needs more saved booking snapshots and closed nights to estimate occupancy."}</p>
                  <dl className={styles.facts}>
                    <div><dt>Estimated rooms available to sell</dt><dd>{selectedOccupancy.roomsAvailableToSell ?? "—"}</dd></div>
                    {low && <div><dt>Lowest expected</dt><dd>{low.expected}% · {fmtDay(low.date)}</dd></div>}
                  </dl>
                  <ForecastQuality value={selectedOccupancy.dataQuality} basis={`This date’s estimate uses ${selectedOccupancy.basisObservations} matched booking snapshots.`} />
                </> : <p className={styles.unavailable}>No active room capacity is available for this outlook.</p>}
              </ForecastCard>
              <ForecastAccuracyPreview metric="occupancy" snapshotAt={data.lastSnapshotAt} description="Past estimates compared with recorded stays." onOpen={() => viewAccuracy("occupancy")} />
            </div>
          </div>
          <details className={frame.details}><summary>How HAVEN estimates occupancy</summary><p>{data.occupancy.method} {data.occupancy.notes.join(" ")}</p><p>Model version {OCCUPANCY_MODEL_VERSION}</p></details>
        </article>
      )}

      {activeForecastTab === "rates" && (
        <article className={styles.view} role="tabpanel" id="forecast-panel-rates" aria-labelledby="forecast-tab-rates" tabIndex={0}>
          <PredictivePricingPanel key={data.generatedAt} snapshotAt={data.lastSnapshotAt} onAccuracy={() => viewAccuracy("occupancy")} />
        </article>
      )}

      {activeForecastTab === "housekeeping" && (
        <article className={styles.view} role="tabpanel" id="forecast-panel-housekeeping" aria-labelledby="forecast-tab-housekeeping" tabIndex={0}>
          <ForecastHeader view="housekeeping" title="Housekeeping Workload Forecast" description="Plan room cleans, inspections and guest-request work by date."
            period={forecastPeriod(housekeepingRows[0]?.date, housekeepingRows.at(-1)?.date)}>
            <ExplainButton type="housekeeping" onExplain={explain} busy={explaining} />
          </ForecastHeader>
          {housekeepingToday && <ForecastCard title="Today’s housekeeping queue">
            <dl className={styles.facts}><div><dt>Open work now</dt><dd>{housekeepingToday.openTasks ?? "—"}</dd></div>
              <div><dt>Additional work expected today</dt><dd>{housekeepingToday.expectedNewTasks ?? "—"}</dd></div></dl>
            {onOpenWork && <button className={styles.textButton} type="button" onClick={() => onOpenWork("housekeeping_tasks")}>Open housekeeping tasks</button>}
          </ForecastCard>}
          {staffingDay && <ForecastMetrics metrics={[
            { label: "Room cleans", value: staffingDay.checkoutCleans + staffingDay.stayoverServices, detail: fmtDay(staffingDay.date), icon: BedDouble },
            { label: "Estimated work hours", value: fixed(staffingDay.estimatedLaborHours, "h"), detail: fmtDay(staffingDay.date), icon: Clock },
            { label: "Average timed task", value: fixed(staffingDay.meanTaskMinutes, "min"), detail: "Recorded task duration", icon: Activity },
            { label: "Expected inspections", value: staffingDay.inspections, detail: fmtDay(staffingDay.date), icon: ClipboardCheck }
          ]} />}
          <div className={styles.split}>
            <ForecastCard title="Housekeeping work by date" description="Checkout cleans and estimated labor hours for each date.">
              <ForecastLegend items={[
                { label: "Checkout cleans", series: "actual" },
                ...(hasTimedWork ? [{ label: "Estimated work hours", series: "hours" as const }] : []),
                ...(hasWork ? [{ label: `Busiest by tasks · ${fmtDay(busiest.date)}`, series: "focus" as const }] : [])
              ]} />
              <div className={styles.chart}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={housekeepingRows} accessibilityLayer>
                    <CartesianGrid stroke={`var(--forecast-grid, ${CHART_GRID})`} strokeDasharray="3 4" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={fmtDay} axisLine={false} tickLine={false} minTickGap={14} />
                    <YAxis yAxisId="rooms" width={35} allowDecimals={false} axisLine={false} tickLine={false} />
                    {hasTimedWork && <YAxis yAxisId="hours" orientation="right" unit=" h" width={47} axisLine={false} tickLine={false} />}
                    {hasWork && <ReferenceArea yAxisId="rooms" x1={busiest.date} x2={busiest.date} fill="var(--forecast-actual)" fillOpacity={0.11} />}
                    <Tooltip cursor={{ fill: "var(--forecast-actual)", fillOpacity: 0.07 }}
                      content={props => <ForecastTooltip {...props} units={(name, number) => name === "Estimated work hours" ? `${number} h` : `${number} rooms`} />} />
                    <Bar yAxisId="rooms" dataKey="checkoutCleans" name="Checkout cleans" fill="var(--forecast-actual)" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={chartAnimated} />
                    {hasTimedWork && <Bar yAxisId="hours" dataKey="estimatedLaborHours" name="Estimated work hours" fill="var(--forecast-hours)" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={chartAnimated} />}
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {!hasTimedWork && <p className={styles.description}>More timed tasks are needed to chart work hours.</p>}
            </ForecastCard>
            <div className={styles.rail}>
              <ForecastCard title="Coverage to review" emphasis>
                {hasWork ? <>
                  <h4>Review coverage for {fmtDay(busiest.date)}.</h4>
                  <p>{Math.round(busiest.totalTasks)} expected tasks make it the busiest day by task count. {busiest.estimatedLaborHours !== undefined
                    ? `Allow about ${busiest.estimatedLaborHours} hours of work when reviewing the schedule.`
                    : "More timed tasks are needed to estimate labor hours."}</p>
                  <ForecastQuality value={busiest.dataQuality} basis={busiest.basisNote} />
                  {onOpenWork && <button className={styles.textButton} type="button" onClick={() => onOpenWork("housekeeping_tasks")}>Open housekeeping tasks</button>}
                </> : <p className={styles.unavailable}>No upcoming workload is available.</p>}
              </ForecastCard>
            </div>
          </div>
          <ForecastAccuracyPreview chart metric="housekeeping" snapshotAt={data.lastSnapshotAt} description="Forecast work hours compared with logged hours." onOpen={() => viewAccuracy("housekeeping")} />
          <ForecastCard title="Daily cleaning breakdown">
            <p className={styles.tableHint}>Scroll the table to see all columns.</p>
            <div className={styles.table} tabIndex={0} role="region" aria-label="Daily cleaning breakdown">
              <table aria-label="Housekeeping workload forecast">
                <thead><tr><th>Day</th><th>Checkout cleans</th><th>Stayover services</th><th>Guest requests</th><th>Inspections</th><th>Open now</th><th>Expected new</th><th>Total tasks</th><th>Workload</th><th>Est. work hours</th><th>Based on</th></tr></thead>
                <tbody>{housekeepingPage.rows.map(day => <tr key={day.date}>
                  <th scope="row">{fmtDay(day.date)}</th><td>{day.checkoutCleans}</td><td>{day.stayoverServices}</td><td>{day.guestRequestTasks}</td><td>{day.inspections}</td>
                  <td>{day.openTasks ?? "—"}</td><td>{day.expectedNewTasks ?? "—"}</td><td><b>{day.totalTasks}</b></td><td><span className={riskBadge(day.workload)}>{label(day.workload)}</span></td>
                  <td>{fixed(day.estimatedLaborHours, "h")}</td><td><small>{day.basisNote}</small></td>
                </tr>)}</tbody>
              </table>
            </div>
            <TablePagination {...housekeepingPage} onPageChange={housekeepingPage.setPage} noun="forecast days" />
          </ForecastCard>
          <details className={frame.details}><summary>How HAVEN estimates the work</summary><p>{data.housekeeping.method} {data.housekeeping.notes.join(" ")}</p><p>Model version {HOUSEKEEPING_MODEL_VERSION}</p></details>
        </article>
      )}

      {activeForecastTab === "inventory" && (
        <article className={styles.view} role="tabpanel" id="forecast-panel-inventory" aria-labelledby="forecast-tab-inventory" tabIndex={0}>
          <ForecastHeader view="inventory" title="Inventory Consumption Forecast" description="See what could run short over the next three full hotel days."
            period={forecastPeriod(shiftDate(data.inventory.today, 1), shiftDate(data.inventory.today, 3))}>
            {selectedItem && <label className={styles.control}>Inventory item
              <select value={selectedItem.itemId} onChange={event => setInventoryItem(event.target.value)}>
                {inventoryRows.map(item => <option key={item.itemId} value={item.itemId}>{item.name} ({item.unit})</option>)}
              </select>
            </label>}
            <ExplainButton type="inventory" onExplain={type => explain(type, selectedItem?.itemId)} busy={explaining} />
          </ForecastHeader>
          {attentionItems.length > 0 && <div className={styles.rateToolbar}>
            <label className={styles.control}>Items needing attention ({attentionItems.length})
              <select value={attentionItems.some(item => item.itemId === selectedItem?.itemId) ? selectedItem?.itemId : ""} onChange={event => setInventoryItem(event.target.value)}>
                <option value="" disabled>Choose a flagged item</option>
                {attentionItems.map(item => <option key={item.itemId} value={item.itemId}>{item.name} · {item.projectedShortage ? "Shortage forecast" : item.belowReorderPoint ? "At or below reorder point" : "Reorder point forecast"}</option>)}
              </select>
            </label>
          </div>}
          {selectedItem && (selectedShortage || selectedItem.risk !== "low") && <div className={styles.alert}>
            <TriangleAlert size={20} aria-hidden="true" />
            <div><strong>{selectedItem.name} {selectedShortage ? "may run short" : selectedItem.currentStock <= selectedItem.reorderPoint ? "has reached its reorder point" : "may reach its reorder point"}</strong>
            <p>{selectedShortage ? `Expected shortage of ${fixed(selectedItem.projectedShortage, selectedItem.unit)} over the forecast period.` : `There are ${fixed(selectedItem.currentStock, selectedItem.unit)} in stock.`}</p></div>
          </div>}
          {selectedItem ? <>
            <ForecastMetrics metrics={[
              { label: "Current stock", value: fixed(selectedItem.currentStock, selectedItem.unit), detail: selectedItem.name, icon: Boxes },
              { label: "Expected 3-day use", value: fixed(selectedItem.predictedConsumption, selectedItem.unit), detail: selectedItem.predictedConsumption == null ? "More history needed" : "From recorded usage", icon: CalendarDays },
              { label: "Reorder point", value: fixed(selectedItem.reorderPoint, selectedItem.unit), detail: "Configured stock threshold", icon: Target },
              { label: "Suggested order", value: fixed(selectedItem.recommendedReorder, selectedItem.unit), detail: "For stock review", icon: ClipboardCheck }
            ]} />
            <div className={styles.split}>
              <ForecastCard title="Consumption forecast" description={`${selectedItem.name} · daily usage in ${selectedItem.unit}`}>
                <ForecastTimeline data={usageChart} today={data.inventory.today} unit={selectedItem.unit} actualLabel="Recorded usage" expectedLabel="Expected daily use" animated={chartAnimated} />
                <ForecastLegend items={[
                  ...(usageChart.some(day => "actual" in day && day.actual != null) ? [{ label: "Recorded usage", series: "actual" as const }] : []),
                  ...(selectedItem.dailyExpected != null ? [{ label: "Expected daily use", series: "expected" as const }] : [])
                ]} />
                <details className={frame.details}><summary>Daily usage figures</summary>
                  <div className={styles.table} tabIndex={0} role="region" aria-label="Daily usage figures">
                    <table><thead><tr><th scope="col">Date</th><th scope="col">Recorded use</th><th scope="col">Expected use</th></tr></thead>
                      <tbody>{usageChart.map(row => <tr key={row.date}><th scope="row">{fmtDay(row.date)}</th>
                        <td>{"actual" in row ? row.actual == null ? "Unrecorded" : fixed(row.actual, selectedItem.unit) : "—"}</td>
                        <td>{"expected" in row ? fixed(row.expected, selectedItem.unit) : "—"}</td></tr>)}</tbody>
                    </table>
                  </div>
                </details>
              </ForecastCard>
              <div className={styles.rail}>
                <ForecastCard title="Stock review" emphasis>
                  <h4>{selectedItem.predictedConsumption === null && !selectedItem.belowReorderPoint ? "Shortage forecast needs more history." : selectedShortage ? "Review replenishment now." : selectedItem.risk !== "low" ? "Check stock against the reorder point." : "No reorder alert for this item."}</h4>
                  <ForecastQuality value={selectedItem.dataQuality} basis={`${selectedItem.movementDays} of ${selectedItem.eligibleDays ?? "—"} eligible days have recorded use. Missing usage remains blank.`} />
                  {onOpenWork && <button className={styles.textButton} type="button" onClick={() => onOpenWork("inventory", selectedItem.name)}>Review stock in Inventory</button>}
                  {itemsWithoutEstimate > 0 && <p className={styles.description}>{itemsWithoutEstimate} {itemsWithoutEstimate === 1 ? "item needs" : "items need"} more usage history.</p>}
                </ForecastCard>
                <ForecastAccuracyPreview metric="inventory" inventory={selectedItem} snapshotAt={data.lastSnapshotAt} description={`${selectedItem.name} · 3-day forecasts compared with recorded use.`} onOpen={() => viewAccuracy("inventory", selectedItem.itemId)} />
              </div>
            </div>
            <ForecastCard title="Inventory forecast by item" description="Items with the greatest shortage risk appear first.">
              <p className={styles.tableHint}>Scroll the table to see all columns.</p>
              <div className={styles.table} tabIndex={0} role="region" aria-label="Inventory forecast by item">
                <table aria-label="Inventory shortage forecast">
                  <thead><tr><th>Item</th><th>In stock</th><th>Reorder at</th><th>Expected 3-day use</th><th>May be short by</th><th>Suggested order</th><th>Risk</th><th>Based on</th></tr></thead>
                  <tbody>{inventoryPage.rows.map(item => <tr key={item.itemId} data-selected={selectedItem.itemId === item.itemId}>
                    <th scope="row"><button className={styles.textButton} type="button" aria-pressed={selectedItem.itemId === item.itemId} onClick={() => setInventoryItem(item.itemId)}>{item.name}</button> <small>{item.unit}</small></th>
                    <td>{item.currentStock}</td><td>{item.reorderPoint}</td><td>{item.predictedConsumption ?? "—"}</td>
                    <td>{(item.projectedShortage ?? 0) > 0 ? item.projectedShortage : "—"}</td><td>{item.recommendedReorder ?? "—"}</td>
                    <td>{item.predictedConsumption === null && !item.belowReorderPoint ? "Forecast unavailable" : <span className={riskBadge(item.risk)}>{label(item.risk)}</span>}</td>
                    <td><small>{item.movementDays} recorded days{item.predictedConsumption === null && " · more history needed"}</small></td>
                  </tr>)}</tbody>
                </table>
              </div>
              <TablePagination {...inventoryPage} onPageChange={inventoryPage.setPage} noun="inventory items" />
            </ForecastCard>
          </> : <ForecastCard title="No inventory items"><p className={styles.description}>Add stock items and record usage to see forecasts here.</p></ForecastCard>}
          <details className={frame.details}><summary>How HAVEN estimates stock use</summary><p>{data.inventory.method} {data.inventory.notes.join(" ")}</p><p>Model version {INVENTORY_MODEL_VERSION}</p></details>
        </article>
      )}

      {activeForecastTab === "maintenance" && (
        <article className={styles.view} role="tabpanel" id="forecast-panel-maintenance" aria-labelledby="forecast-tab-maintenance" tabIndex={0}>
          <ForecastHeader view="maintenance" title="Recurring Maintenance Risk" description="Find rooms with repeat work orders and decide what to inspect first." period="Last 90 days of work orders">
            <ExplainButton type="maintenance" onExplain={type => explain(type, selectedIssue ? maintenanceRiskKey(selectedIssue) : undefined)} busy={explaining} />
          </ForecastHeader>
          {highIssue && <div className={styles.alert}>
            <TriangleAlert size={20} aria-hidden="true" /><div><strong>Room {highIssue.roomNumber} has a high-priority {label(highIssue.category)} pattern.</strong>
            <p>{highIssue.incidents90Days} work orders in the last 90 days. {highIssue.suggestedAction}</p></div>
          </div>}
          <ForecastMetrics metrics={[
            { label: "High-priority issues", value: maintenanceRows.filter(issue => issue.risk === "high").length, detail: "Room and issue pairs" },
            { label: "Flagged rooms", value: new Set(maintenanceRows.map(issue => issue.roomId)).size, detail: "With repeat issues" },
            { label: "Open work orders", value: maintenanceRows.reduce((total, issue) => total + issue.openIncidents, 0), detail: "Within flagged issues" },
            { label: "Work orders recorded", value: maintenanceRows.reduce((total, issue) => total + issue.incidents90Days, 0), detail: "Across flagged issues" }
          ]} />
          {selectedIssue ? <>
            <div className={styles.split}>
              <ForecastCard title="Weekly repeat work orders" description="Weekly work orders for flagged rooms and issues, through the current date.">
                <ForecastTimeline animated={chartAnimated} actualLabel="Recorded work orders" unit="orders" risk
                  data={(data.maintenance.history ?? []).map(day => ({ date: day.date, actual: day.count }))} />
                <details className={frame.details}><summary>Weekly work-order counts</summary>
                  <div className={styles.table} tabIndex={0} role="region" aria-label="Weekly work-order counts"><table>
                    <thead><tr><th scope="col">Week starting</th><th scope="col">Work orders</th></tr></thead><tbody>
                    {(data.maintenance.history ?? []).map(week => <tr key={week.date}><th scope="row">{fmtDay(week.date)}</th><td>{week.count}</td></tr>)}
                  </tbody></table></div>
                </details>
              </ForecastCard>
              <ForecastCard title="Recommended next step" emphasis>
                <h4>{selectedIssue.suggestedAction || "Monitor for new work orders."}</h4>
                <p>{selectedIssue.assetName && <strong>{selectedIssue.assetName} · </strong>}{selectedIssue.reason}</p>
                <dl className={styles.facts}>
                  <div><dt>Priority</dt><dd><span className={riskBadge(selectedIssue.risk)}>{label(selectedIssue.risk)}</span></dd></div>
                  <div><dt>Frequency</dt><dd>{label(selectedIssue.trend)}</dd></div>
                  <div><dt>Last reported</dt><dd>{lastReported(selectedIssue.daysSinceLast)}</dd></div>
                </dl>
                <ForecastQuality value={selectedIssue.dataQuality} basis="Priority reflects repeat work orders, open issues and changes in frequency." />
                {onOpenWork && <button className={styles.textButton} type="button" onClick={() => onOpenWork("maintenance_orders", selectedIssue.roomNumber)}>Review maintenance work orders</button>}
              </ForecastCard>
            </div>
            <ForecastCard title="Flagged rooms and issues">
              <p className={styles.tableHint}>Scroll the table to see all columns.</p>
              <div className={styles.table} tabIndex={0} role="region" aria-label="Flagged rooms and issues">
                <table>
                  <thead><tr><th>Room / issue</th><th>Priority</th><th>Past 90 days</th><th>Open now</th><th>Last reported</th><th>Suggested action</th></tr></thead>
                  <tbody>{maintenanceRows.map(issue => <tr key={maintenanceRiskKey(issue)} data-selected={maintenanceRiskKey(issue) === maintenanceRiskKey(selectedIssue)}>
                    <th scope="row"><button type="button" className={styles.textButton} aria-pressed={maintenanceRiskKey(issue) === maintenanceRiskKey(selectedIssue)} onClick={() => setMaintenanceIssue(maintenanceRiskKey(issue))}>Room {issue.roomNumber} · {issue.assetName ?? label(issue.category)}</button></th>
                    <td><span className={riskBadge(issue.risk)}>{label(issue.risk)}</span></td><td>{issue.incidents90Days}</td><td>{issue.openIncidents}</td>
                    <td>{lastReported(issue.daysSinceLast)}</td><td>{issue.suggestedAction || "Monitor for new work orders."}</td>
                  </tr>)}</tbody>
                </table>
              </div>
            </ForecastCard>
          </> : <ForecastCard title="No repeat issues"><p className={styles.description}>No rooms show recurring work-order patterns in the last 90 days.</p></ForecastCard>}
          <details className={frame.details}><summary>How HAVEN flags repeat issues</summary><p>{data.maintenance.method} {data.maintenance.notes.join(" ")}</p><p>Model version {MAINTENANCE_MODEL_VERSION}</p></details>
        </article>
      )}

      {explanation?.type === activeForecastTab && <ExplanationCard explanation={explanation.data} onClose={() => setExplanation(null)} />}
      {activeForecastTab === "evaluation" && <ForecastEvaluationPanel snapshotAt={data.lastSnapshotAt} initialMetric={accuracy.metric} initialItem={accuracy.inventoryItem} />}
      {activeForecastTab === "seasonal" && <SeasonalOccupancyPanel today={data.occupancy.today} snapshotAt={data.lastSnapshotAt} />}
    </div>
  );
}
