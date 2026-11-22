"use client";

import { useEffect, useId, useState } from "react";
import { Download, RotateCcw } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchPublic, readResponse } from "@/lib/client-errors";
import { BASELINE_VERSION, MIN_MATCHED_PAIRS, scoreForecasts, type EvaluationMetric, type EvaluationRow } from "@/lib/analytics/evaluation";
import { shiftDate } from "@/lib/analytics/types";
import styles from "./forecast-evaluation-panel.module.css";

type Evidence = { from: string; through: string; databaseMode: string; rows: EvaluationRow[] };

const METRICS = {
  occupancy: { label: "Occupancy", horizon: "1 day ahead", inputs: "historical nights", method: "Occupancy at the end of the hotel night, divided by the active room count captured on that hotel date." },
  housekeeping: { label: "Housekeeping hours", horizon: "1 day ahead", inputs: "timed tasks", method: "Elapsed time of completed checkout cleans, stayover cleans and guest-request tasks. Inspection time and payroll hours are outside this measure." },
  inventory: { label: "Inventory usage", horizon: "3 full days", inputs: "consumption days", method: "Recorded consumption for one item across the next three full hotel dates. Each item and unit has its own score." }
} satisfies Record<EvaluationMetric, { label: string; horizon: string; inputs: string; method: string }>;

const SERIES = [
  { key: "actual", label: "Actual", dash: undefined },
  { key: "predicted", label: "Predicted", dash: "7 4" },
  { key: "baseline", label: "Baseline", dash: "2 4" }
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
    metric, row.itemName, row.itemId, row.unit, row.issuedOn, row.generatedAt, row.runId, row.id, row.windowStart, row.targetDate,
    row.actualSnapshotAt, row.modelVersion, BASELINE_VERSION, row.actual, row.predicted, row.baseline,
    row.exclusion ? null : Math.abs(row.predicted! - row.actual!), row.exclusion ? null : Math.abs(row.baseline! - row.actual!),
    row.historicalObservations, row.dataQuality, row.exclusion
  ]);
  const columns = ["Metric", "Item", "Item ID", "Unit", "Issued hotel date", "Generated timestamp", "Run ID", "Prediction ID", "Target start", "Target end (inclusive)",
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

export default function ForecastEvaluationPanel({ snapshotAt, reportRange }: { snapshotAt: string | null; reportRange?: { from: string; through: string } }) {
  const filterId = useId();
  const [metric, setMetric] = useState<EvaluationMetric>("occupancy");
  const [period, setPeriod] = useState("30");
  const [item, setItem] = useState("");
  const [model, setModel] = useState("");
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ key: string; data: Evidence | null } | null>(null);
  const rangeQuery = reportRange ? `from=${reportRange.from}&through=${reportRange.through}` : `days=${period}`;
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
  const data = loading ? null : result.data;
  const currentMetric = METRICS[metric];
  const items = new Map(data?.rows.filter(row => row.itemId).map(row => [itemKey(row), `${row.itemName} (${row.unit})`]));
  const itemOptions = [...items].sort(([, a], [, b]) => a.localeCompare(b));
  const activeItem = items.has(item) ? item : itemOptions[0]?.[0] ?? "";
  const itemRows = data?.rows.filter(row => metric !== "inventory" || itemKey(row) === activeItem) ?? [];
  const models = [...new Set([...itemRows].reverse().map(row => row.modelVersion))];
  const activeModel = models.includes(model) ? model : models[0] ?? "";
  const rows = itemRows.filter(row => row.modelVersion === activeModel);
  const scores = scoreForecasts(rows);
  const unit = rows[0]?.unit ?? "";
  const errorUnit = metric === "occupancy" ? "pp" : unit;
  const errorDifference = scores.baselineError !== null && scores.meanError !== null ? scores.baselineError - scores.meanError : null;
  const chartRows: { targetDate: string; actual?: number | null; predicted?: number | null; baseline?: number | null }[] = [];
  if (rows.length) {
    const byDay = new Map(rows.map(row => [row.targetDate, row]));
    for (let day = rows[0].targetDate; day <= rows[rows.length - 1].targetDate; day = shiftDate(day, 1)) {
      chartRows.push(byDay.get(day) ?? { targetDate: day });
    }
  }

  return (
    <article className={`${styles.panel} insights-tabpanel`} role={reportRange ? "region" : "tabpanel"} id="forecast-panel-evaluation" aria-label={reportRange ? "Forecast Evaluation" : undefined} aria-labelledby={reportRange ? undefined : "forecast-tab-evaluation"} tabIndex={0}>
      <header className={styles.header}>
        <div>
          <h3>Forecast Evaluation</h3>
          <p>Compare recorded outcomes with HAVEN predictions and a simple seven-day baseline.</p>
        </div>
        <button type="button" className="btn btn-soft" disabled={!rows.length} onClick={() => data && exportEvidence(rows, metric, data)}><Download size={16} aria-hidden="true" /> Export CSV</button>
      </header>

      <div className={styles.filters}>
        <div className={styles.field}><label htmlFor={`${filterId}-metric`}>Forecast</label><select id={`${filterId}-metric`} value={metric} onChange={event => { setMetric(event.target.value as EvaluationMetric); setModel(""); }}>
          {Object.entries(METRICS).map(([key, entry]) => <option key={key} value={key}>{entry.label}</option>)}
        </select></div>
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
          <strong>{data.databaseMode === "demo" ? "Stored forecast history is unavailable in demo mode" : "No saved forecasts in this period"}</strong>
          <p>{data.databaseMode === "demo" ? "Evaluation uses forecasts and outcomes from a connected hotel database." : "Daily snapshots build the comparison as target dates close. Choose a wider period or check back after a forecast has elapsed."}</p>
        </div>
      ) : <>
        <p className={styles.scope}>{fmtDay(data.from)}–{fmtDay(data.through)} · {currentMetric.horizon} · Manila time · {activeModel}</p>
        <dl className={styles.scorecard} aria-label="Forecast accuracy summary">
          <div><dt>Model MAE</dt><dd>{fmt(scores.meanError, errorUnit)}</dd></div>
          <div><dt>Baseline MAE</dt><dd>{fmt(scores.baselineError, errorUnit)}</dd></div>
          <div><dt>Model MAPE</dt><dd>{fmt(scores.percentageError, "%")}</dd></div>
          <div><dt>Matched observations</dt><dd>{scores.observations}<small> / {rows.length}</small></dd></div>
        </dl>
        <p className={styles.note} role="status">{scores.observations < MIN_MATCHED_PAIRS
          ? `Limited evidence. Accuracy scores appear after ${MIN_MATCHED_PAIRS} matched observations.`
          : <>
            {errorDifference !== null && (Math.abs(errorDifference) < 0.005 ? "Model and baseline MAE are even at this precision. "
              : `${errorDifference > 0 ? "Model" : "Baseline"} MAE is ${fmt(Math.abs(errorDifference), errorUnit)} lower. `)}
            MAPE uses {scores.percentageObservations} nonzero {scores.percentageObservations === 1 ? "actual" : "actuals"}.
            {scores.zeroActuals > 0 && ` ${scores.zeroActuals} ${scores.zeroActuals === 1 ? "zero actual counts" : "zero actuals count"} toward MAE only.`}
          </>}</p>

        <figure className={styles.figure} aria-label={`${currentMetric.label}, actual vs predicted vs baseline`}>
          <figcaption><strong>Actual, predicted and baseline</strong><span>{metric === "inventory" ? `${unit} per three-day window` : unit === "%" ? "Occupancy (%)" : "Measured labor hours"}</span></figcaption>
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
              <thead><tr><th scope="col">Target date</th><th scope="col">Generated</th><th scope="col">Actual</th><th scope="col">Predicted</th><th scope="col">Baseline</th><th scope="col">History</th><th scope="col">Data quality</th><th scope="col">Scoring</th></tr></thead>
              <tbody>{[...rows].reverse().map(row => <tr key={row.id}>
                <th scope="row">{metric === "inventory" && `${fmtDay(row.windowStart)}–`}{fmtDay(row.targetDate)}</th>
                <td>{stamp.format(new Date(row.generatedAt))}</td><td>{fmt(row.actual, unit)}</td><td>{fmt(row.predicted, unit)}</td><td>{fmt(row.baseline, unit)}</td>
                <td>{row.historicalObservations} {currentMetric.inputs}</td><td className={styles.quality}>{row.dataQuality}</td><td>{row.exclusion ?? "Matched"}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </details>
      </>}

      <details className={styles.details}>
        <summary>How scores are calculated</summary>
        <p>{currentMetric.method} The baseline is the average of the seven recorded closed hotel days before generation, multiplied by three for inventory. The earliest saved run per issuance date, item and model version is used. MAE averages absolute differences on identical matched rows for the model and baseline. MAPE averages absolute percentage differences for nonzero actuals.</p>
      </details>
    </article>
  );
}
