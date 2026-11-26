"use client";

import { useEffect, useId, useState } from "react";
import { ArrowRight, ChartNoAxesCombined, Download, RotateCcw } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchPublic, readResponse } from "@/lib/client-errors";
import { BASELINE_VERSION, MIN_MATCHED_PAIRS, scoreForecasts, type EvaluationMetric, type EvaluationRow } from "@/lib/analytics/evaluation";
import { FORECAST_LEADS } from "@/lib/analytics/occupancy";
import { shiftDate } from "@/lib/analytics/types";
import { ForecastCard, ForecastLegend, ForecastTooltip } from "./forecast-workspace";
import styles from "./forecast-evaluation-panel.module.css";
import workspace from "./forecast-workspace.module.css";

type Evidence = { from: string; through: string; databaseMode: string; rows: EvaluationRow[] };

const METRICS = {
  occupancy: { label: "Occupancy", horizon: "1 day ahead", inputs: "historical nights", method: "Occupancy at the end of the hotel night, divided by the active room count captured on that hotel date." },
  housekeeping: { label: "Housekeeping hours", horizon: "1 day ahead", inputs: "timed tasks", method: "Elapsed time of completed checkout cleans, stayover cleans and guest-request tasks. Inspection time and payroll hours are outside this measure." },
  inventory: { label: "Inventory usage", horizon: "3 full days", inputs: "consumption days", method: "Recorded consumption for one item across the next three full hotel dates. Each item and unit has its own score." }
} satisfies Record<EvaluationMetric, { label: string; horizon: string; inputs: string; method: string }>;

const SERIES = [
  { key: "actual", label: "Actual", dash: undefined },
  { key: "predicted", label: "HAVEN forecast", dash: "7 4" },
  { key: "baseline", label: "7-day average", dash: "2 4" }
] as const;
const number = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 2 });
const dayLabel = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", timeZone: "UTC" });
const stamp = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });
const fmtDay = (value: string) => dayLabel.format(new Date(`${value}T00:00:00Z`));
const fmt = (value: number | null, unit = "") => value === null ? "—" : `${number.format(value)}${unit === "%" || !unit ? unit : ` ${unit}`}`;
const itemKey = (row: EvaluationRow) => JSON.stringify([row.itemId, row.unit]);

function exportEvidence(rows: EvaluationRow[], metric: EvaluationMetric, range: Evidence) {
  const quote = (cell: string | number | null) => {
    const value = String(cell ?? "");
    const safe = typeof cell === "string" && /^[\s\uFEFF]*[=+\-@\t\r\n]/.test(value) ? `'${value}` : value;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const records = rows.map(row => [
    metric, row.itemName, row.itemId, row.unit, row.issuedOn, row.generatedAt, row.runId, row.id, row.windowStart, row.targetDate, row.leadDays,
    row.actualSnapshotAt, row.modelVersion, BASELINE_VERSION, row.actual, row.predicted, row.baseline,
    row.actual == null || row.predicted == null ? null : Math.abs(row.predicted - row.actual), row.exclusion ? null : Math.abs(row.baseline! - row.actual!),
    row.historicalObservations, row.dataQuality, row.exclusion
  ]);
  const columns = ["Metric", "Item", "Item ID", "Unit", "Issued hotel date", "Generated timestamp", "Run ID", "Prediction ID", "Target start", "Target end (inclusive)", "Days ahead",
    "Latest actual snapshot timestamp", "Model version", "Baseline version", "Actual", "Predicted", "Baseline", "Model absolute error", "Baseline absolute error",
    "Historical observations", "Data quality", "Excluded because"];
  const csv = [columns, ...records].map(record => record.map(quote).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `haven-forecast-${metric}-${range.from}-${range.through}.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function useForecastEvidence(metric: EvaluationMetric, rangeQuery: string, snapshotAt: string | null, retry = 0) {
  const [result, setResult] = useState<{ key: string; data: Evidence | null } | null>(null);
  const requestKey = `${metric}:${rangeQuery}:${snapshotAt}:${retry}`;
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetchPublic(`/api/analytics/evaluation?metric=${metric}&${rangeQuery}`, { cache: "no-store", signal: controller.signal });
        const body = await readResponse(response);
        if (!controller.signal.aborted) setResult({ key: requestKey, data: response.ok ? body?.data ?? null : null });
      } catch {
        if (!controller.signal.aborted) setResult({ key: requestKey, data: null });
      }
    }
    void load();
    return () => controller.abort();
  }, [metric, rangeQuery, requestKey]);

  const loading = result?.key !== requestKey;
  return { data: loading ? null : result.data, loading };
}

export function ForecastAccuracyPreview({ metric, description, snapshotAt, inventory, onOpen, chart = false, title = "Forecast Accuracy" }: {
  metric: EvaluationMetric; description: string; snapshotAt: string | null; inventory?: { itemId: string; unit: string }; onOpen: () => void; chart?: boolean; title?: string;
}) {
  const { data, loading } = useForecastEvidence(metric, "days=30", snapshotAt);
  const selectedRows = data?.rows.filter(row => (row.leadDays ?? 1) === (metric === "inventory" ? 3 : 1) && (!inventory || (row.itemId === inventory.itemId && row.unit === inventory.unit))) ?? [];
  const modelVersion = selectedRows.at(-1)?.modelVersion;
  const rows = selectedRows.filter(row => row.modelVersion === modelVersion);
  const scores = scoreForecasts(rows);
  const errorUnit = metric === "occupancy" ? "pp" : rows[0]?.unit ?? "";
  const summary = <div>
    {loading ? <p className={workspace.description}>Loading saved comparisons…</p> : !data
      ? <p className={workspace.description}>Saved comparisons are unavailable.</p>
      : <><p className={workspace.description}>{modelVersion ? `Saved model ${modelVersion} · ${metric === "inventory" ? "3-day window" : "1 day ahead"}` : "No saved model results in this period."}</p><dl className={workspace.facts}>
          <div><dt>Matched in the last 30 days</dt><dd>{scores.observations}</dd></div>
          {scores.observations >= MIN_MATCHED_PAIRS ? <>
            <div><dt>HAVEN average error</dt><dd>{fmt(scores.meanError, errorUnit)}</dd></div>
            <div><dt>7-day average error</dt><dd>{fmt(scores.baselineError, errorUnit)}</dd></div>
          </> : <><div><dt>Matches needed for scoring</dt><dd>{MIN_MATCHED_PAIRS}</dd></div>
            {scores.modelMeanError !== null && <div><dt>HAVEN error · {scores.modelObservations} results</dt><dd>{fmt(scores.modelMeanError, errorUnit)}</dd></div>}</>}
        </dl></>}
    <button className={workspace.textButton} type="button" onClick={onOpen}>
      <ChartNoAxesCombined size={15} aria-hidden="true" /> View saved comparisons <ArrowRight size={15} aria-hidden="true" />
    </button>
  </div>;
  return <ForecastCard title={title} description={description}>
    {chart && rows.some(row => row.actual != null) ? <div className={workspace.split}>
      <div>
        <div className={workspace.evidenceChart}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows.slice(-14)} accessibilityLayer>
              <CartesianGrid stroke="var(--forecast-grid)" strokeDasharray="3 4" vertical={false} />
              <XAxis dataKey="targetDate" tickFormatter={fmtDay} minTickGap={18} axisLine={false} tickLine={false} />
              <YAxis width={46} unit={errorUnit ? ` ${errorUnit}` : ""} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ stroke: "var(--forecast-cursor)", strokeDasharray: "4 4" }}
                content={props => <ForecastTooltip {...props} units={errorUnit} />} />
              <Line dataKey="actual" name="Actual" stroke="var(--forecast-hours)" strokeWidth={2} isAnimationActive={false} />
              <Line dataKey="predicted" name="HAVEN forecast" stroke="var(--forecast-actual)" strokeWidth={2} isAnimationActive={false} />
              <Line dataKey="baseline" name="7-day average" stroke="var(--forecast-projection)" strokeDasharray="4 4" dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <ForecastLegend items={[{ label: "Actual", series: "hours" }, { label: "HAVEN forecast", series: "actual" }, { label: "7-day average", series: "expected" }]} />
      </div>
      {summary}
    </div> : summary}
  </ForecastCard>;
}

export default function ForecastEvaluationPanel({ snapshotAt, reportRange, initialMetric = "occupancy", initialItem }: {
  snapshotAt: string | null; reportRange?: { from: string; through: string }; initialMetric?: EvaluationMetric; initialItem?: string;
}) {
  const filterId = useId();
  const [metric, setMetric] = useState<EvaluationMetric>(initialMetric);
  const [lead, setLead] = useState<number>(1);
  const [period, setPeriod] = useState("30");
  const [item, setItem] = useState("");
  const [model, setModel] = useState("");
  const [retry, setRetry] = useState(0);
  const rangeQuery = reportRange ? `from=${reportRange.from}&through=${reportRange.through}` : `days=${period}`;
  const { data, loading } = useForecastEvidence(metric, rangeQuery, snapshotAt, retry);
  const currentMetric = METRICS[metric];
  const items = new Map(data?.rows.filter(row => row.itemId).map(row => [itemKey(row), `${row.itemName} (${row.unit})`]));
  const itemOptions = [...items].sort(([, a], [, b]) => a.localeCompare(b));
  const preferredItem = initialItem && data?.rows.find(row => row.itemId === initialItem);
  const activeItem = items.has(item) ? item : preferredItem ? itemKey(preferredItem) : itemOptions[0]?.[0] ?? "";
  const leadRows = data?.rows.filter(row => (row.leadDays ?? (metric === "inventory" ? 3 : 1)) === (metric === "inventory" ? 3 : lead)) ?? [];
  const itemRows = leadRows.filter(row => metric !== "inventory" || itemKey(row) === activeItem);
  const models = [...new Set([...itemRows].reverse().map(row => row.modelVersion))];
  const activeModel = models.includes(model) ? model : models[0] ?? "";
  const rows = itemRows.filter(row => row.modelVersion === activeModel);
  const scores = scoreForecasts(rows);
  const unit = rows[0]?.unit ?? "";
  const latestActual = rows.reduce<string | null>((latest, row) =>
    row.actualSnapshotAt && (!latest || row.actualSnapshotAt > latest) ? row.actualSnapshotAt : latest, null);
  const excluded = rows.filter(row => row.exclusion !== null);
  const errorUnit = metric === "occupancy" ? "pp" : unit;
  const errorDifference = scores.baselineError !== null && scores.meanError !== null ? scores.baselineError - scores.meanError : null;
  const enoughEvidence = scores.observations >= MIN_MATCHED_PAIRS;
  const closer = errorDifference !== null && Math.abs(errorDifference) >= 0.005
    ? errorDifference > 0 ? "HAVEN’s forecast was closer." : "The 7-day average was closer."
    : "Both forecasts had about the same error.";
  const chartRows: { targetDate: string; actual?: number | null; predicted?: number | null; baseline?: number | null }[] = [];
  if (rows.length) {
    const byDay = new Map(rows.map(row => [row.targetDate, row]));
    for (let day = rows[0].targetDate; day <= rows[rows.length - 1].targetDate; day = shiftDate(day, 1)) {
      chartRows.push(byDay.get(day) ?? { targetDate: day });
    }
  }

  return (
    <article className={`${styles.panel} insights-tabpanel`} role={reportRange ? "region" : "tabpanel"} id="forecast-panel-evaluation" aria-label={reportRange ? "Forecast Accuracy" : undefined} aria-labelledby={reportRange ? undefined : "forecast-tab-evaluation"} tabIndex={0}>
      <header className={styles.header}>
        <div>
          <h3>Forecast Accuracy</h3>
          <p>See how close past forecasts were to what actually happened.</p>
        </div>
        <button type="button" className="btn btn-soft" disabled={!rows.length} onClick={() => data && exportEvidence(rows, metric, data)}><Download size={16} aria-hidden="true" /> Export CSV</button>
      </header>

      <div className={styles.filters}>
        <div className={styles.field}><label htmlFor={`${filterId}-metric`}>Forecast</label><select id={`${filterId}-metric`} value={metric} onChange={event => { setMetric(event.target.value as EvaluationMetric); setModel(""); setLead(1); }}>
          {Object.entries(METRICS).map(([key, entry]) => <option key={key} value={key}>{entry.label}</option>)}
        </select></div>
        {metric !== "inventory" && <div className={styles.field}><label htmlFor={`${filterId}-lead`}>Forecast lead time</label>
          <select id={`${filterId}-lead`} value={lead} onChange={event => { setLead(Number(event.target.value)); setModel(""); }}>
            {FORECAST_LEADS.map(days => <option key={days} value={days}>{days} {days === 1 ? "day" : "days"} ahead</option>)}
          </select></div>}
        {!reportRange && <div className={styles.field}><label htmlFor={`${filterId}-dates`}>Target dates</label><select id={`${filterId}-dates`} value={period} onChange={event => setPeriod(event.target.value)}>
          <option value="14">Last 14 closed days</option><option value="30">Last 30 closed days</option><option value="90">Last 90 closed days</option>
        </select></div>}
        {metric === "inventory" && <div className={styles.field}><label htmlFor={`${filterId}-item`}>Inventory item</label><select id={`${filterId}-item`} value={activeItem} disabled={!items.size} onChange={event => { setItem(event.target.value); setModel(""); }}>
          {!items.size && <option value="">No items in this period</option>}
          {itemOptions.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
        </select></div>}
        {models.length > 1 && <div className={styles.field}><label htmlFor={`${filterId}-model`}>Model version</label><select id={`${filterId}-model`} value={activeModel} onChange={event => setModel(event.target.value)}>
          {models.map(version => <option key={version} value={version}>{version}</option>)}
        </select></div>}
      </div>

      {loading ? <div className={styles.empty} role="status">Loading forecast evidence…</div> : !data ? (
        <div className={styles.empty} role="alert"><strong>Forecast evidence couldn’t load</strong><button type="button" className="btn btn-soft" onClick={() => setRetry(retry + 1)}><RotateCcw size={16} aria-hidden="true" /> Try again</button></div>
      ) : !rows.length ? (
        <div className={styles.empty} role="status">
          <strong>{data.databaseMode === "demo" ? "Stored forecast history is unavailable in demo mode" : "No saved forecasts for this selection"}</strong>
          <p>{data.databaseMode === "demo" ? "Evaluation uses forecasts and outcomes from a connected hotel database." : "Daily snapshots build the comparison as target dates close. Choose a wider period or check back after a forecast has elapsed."}</p>
        </div>
      ) : <>
        <p className={styles.scope}>{fmtDay(data.from)}–{fmtDay(data.through)} · {metric === "inventory" ? currentMetric.horizon : `${lead} ${lead === 1 ? "day" : "days"} ahead`} · Manila time · {activeModel}</p>
        <div className={styles.answer} role="status">
          <strong>{enoughEvidence ? closer : "Still collecting comparable results"}</strong>
          <p>{scores.modelObservations} of {rows.length} saved forecasts have an actual and an estimate. {scores.observations} also have the baseline.</p>
          <p>{enoughEvidence
            ? "A smaller average error means a closer forecast."
            : `A head-to-head score requires at least ${MIN_MATCHED_PAIRS} matched forecasts.`}</p>
        </div>
        <p className={styles.note}>Last saved forecast batch {snapshotAt ? stamp.format(new Date(snapshotAt)) : "unavailable"} · Latest matched actual {latestActual ? stamp.format(new Date(latestActual)) : "unavailable"} · Manila time</p>
        {excluded.length > 0 && <p className={styles.note}>{["Forecast unavailable", "Actual unavailable", "Baseline unavailable"].map(reason =>
          [reason, excluded.filter(row => row.exclusion === reason).length] as const).filter(([, count]) => count > 0)
          .map(([reason, count]) => `${count} ${reason.toLowerCase()}`).join(" · ")}</p>}
        {!enoughEvidence && scores.modelMeanError !== null && <p className={styles.note}>HAVEN’s average error was {fmt(scores.modelMeanError, errorUnit)} across {scores.modelObservations} results with a recorded actual.</p>}
        {enoughEvidence && <>
          <dl className={`${styles.scorecard} ${styles.errorScores}`} aria-label="Forecast accuracy summary">
            <div><dt>HAVEN was off by</dt><dd>{fmt(scores.meanError, errorUnit)}</dd></div>
            <div><dt>7-day average was off by</dt><dd>{fmt(scores.baselineError, errorUnit)}</dd></div>
          </dl>
          <p className={styles.note}>Average difference from what happened{metric === "occupancy" ? " · pp means percentage points" : ""}.</p>
        </>}

        <figure className={styles.figure} aria-label={`${currentMetric.label}, actual vs predicted vs baseline`}>
          <figcaption><strong>What happened compared with the forecasts</strong><span>{metric === "inventory" ? `${unit} per three-day window` : unit === "%" ? "Occupancy (%)" : "Measured labor hours"}</span></figcaption>
          <ul className={styles.legend} aria-label="Chart series">
            {SERIES.map(series => <li key={series.key}><i data-series={series.key} aria-hidden="true" />{series.label}</li>)}
          </ul>
          <div className={styles.chart}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartRows} margin={{ top: 10, right: 12, left: 0, bottom: 0 }} accessibilityLayer>
                <CartesianGrid vertical={false} stroke="var(--fe-line)" />
                <XAxis dataKey="targetDate" tickFormatter={fmtDay} minTickGap={35} tick={{ fill: "var(--fe-muted)", fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "var(--fe-muted)", fontSize: 11 }} tickLine={false} axisLine={false} width={38} domain={metric === "occupancy" ? [0, 100] : [0, "auto"]} />
                <Tooltip labelFormatter={fmtDay} formatter={(value: number) => fmt(value, unit)} contentStyle={{ background: "var(--fe-surface)", borderColor: "var(--fe-line)", color: "var(--fe-ink)" }} />
                {SERIES.map(series => <Line key={series.key} dataKey={series.key} name={series.label} stroke={`var(--fe-${series.key})`} strokeDasharray={series.dash}
                  strokeWidth={2} dot={rows.filter(row => row[series.key] !== null).length <= 2 ? { r: 4 } : false} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />)}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </figure>

        <details className={styles.details}>
          <summary>Forecast records <span>{rows.length}</span></summary>
          <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Forecast comparison records">
            <table>
              <thead><tr><th scope="col">Forecast for</th><th scope="col">Generated</th><th scope="col">Actual</th><th scope="col">HAVEN forecast</th><th scope="col">7-day average</th><th scope="col">History</th><th scope="col">Data quality</th><th scope="col">Included in accuracy</th></tr></thead>
              <tbody>{[...rows].reverse().map(row => <tr key={row.id}>
                <th scope="row">{metric === "inventory" && `${fmtDay(row.windowStart)}–`}{fmtDay(row.targetDate)}</th>
                <td>{stamp.format(new Date(row.generatedAt))}</td><td>{fmt(row.actual, unit)}</td><td>{fmt(row.predicted, unit)}</td><td>{fmt(row.baseline, unit)}</td>
                <td>{row.historicalObservations} {currentMetric.inputs}</td><td className={styles.quality}>{row.dataQuality}</td><td>{row.exclusion ?? "Yes"}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </details>
      </>}

      <details className={styles.details}>
        <summary>How we measure accuracy</summary>
        <p>{currentMetric.method}</p>
        <p><strong>7-day average (baseline).</strong> HAVEN averages the seven recorded hotel days available before each forecast was made. For inventory, it multiplies that daily average by three.</p>
        {enoughEvidence && <p><strong>Mean absolute percentage error (MAPE).</strong> {fmt(scores.percentageError, "%")} for the HAVEN forecast across {scores.percentageObservations} nonzero actuals. {scores.zeroActuals > 0 ? `${scores.zeroActuals} actual results of zero still count toward the average error above.` : ""}</p>}
        <p><strong>Mean absolute error (MAE).</strong> The average amount each forecast was off by. The head-to-head result uses the same dates or windows for both methods. {activeModel && `Model version ${activeModel}. `}HAVEN uses the earliest saved forecast per issuance date, item and model version.</p>
      </details>
    </article>
  );
}
