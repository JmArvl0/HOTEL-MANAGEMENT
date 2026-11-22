"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { CalendarDays, CalendarRange } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchPublic, readResponse } from "@/lib/client-errors";
import { nextHotelMonth, seasonalRange, seasonalTargetLimit, type SeasonalOccupancy, type SeasonalSelection, type SeasonalView } from "@/lib/analytics/seasonal-occupancy";
import frame from "./forecast-evaluation-panel.module.css";
import styles from "./seasonal-occupancy-panel.module.css";

type Draft = Omit<SeasonalSelection, "referenceYear"> & { referenceYear: string };

const day = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "UTC" });
const month = new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric", timeZone: "UTC" });
const dayLabel = (date: string) => day.format(new Date(`${date}T00:00:00Z`));
const monthLabel = (date: string) => month.format(new Date(`${date}-01T00:00:00Z`));
const number = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 1 });
const fmtPercent = (value: number | null | undefined) => value != null ? `${number.format(value)}%` : "—";

const series = [
  { key: "bookedPercent", label: "Booked occupancy", color: "var(--fe-actual)" },
  { key: "baselinePercent", label: "Prior-year actual", color: "var(--fe-baseline)", dash: "2 4" },
  { key: "projectedPercent", label: "Seasonal estimate", color: "var(--fe-predicted)", dash: "7 4" },
  { key: "actualPercent", label: "Target-year actual", color: "var(--fe-ink)", dash: "10 3 2 3" }
] as const;

function SeasonalChart({ days }: { days: SeasonalOccupancy["days"] }) {
  const chart = days.map(row => ({ ...row, baselinePercent: row.reference?.percent ?? null, actualPercent: row.actual?.percent ?? null }));
  const visibleSeries = series.filter(line => chart.some(row => row[line.key] !== null));
  if (!visibleSeries.length) return null;
  return (
    <figure className={frame.figure} aria-label="Daily occupancy throughout the selected month">
      <figcaption><strong>Occupancy by date</strong><span>Percent of active rooms</span></figcaption>
      <ul className={frame.legend} aria-label="Chart series">
        {visibleSeries.map(line => <li key={line.key}><span className={styles.lineKey} data-series={line.key} aria-hidden="true" />{line.label}</li>)}
      </ul>
      <div className={frame.chart}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chart} margin={{ top: 12, right: 12, left: 0, bottom: 0 }} accessibilityLayer>
            <CartesianGrid vertical={false} stroke="var(--fe-line)" />
            <XAxis dataKey="date" tickFormatter={(value: string) => String(Number(value.slice(-2)))} minTickGap={28}
              tick={{ fill: "var(--fe-muted)", fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis width={38} domain={[0, 100]} tick={{ fill: "var(--fe-muted)", fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip labelFormatter={dayLabel} formatter={(value: number) => fmtPercent(value)}
              contentStyle={{ background: "var(--fe-surface)", borderColor: "var(--fe-line)", color: "var(--fe-ink)" }} />
            {visibleSeries.map(line => <Line key={line.key} dataKey={line.key} name={line.label} stroke={line.color}
              strokeDasharray={"dash" in line ? line.dash : undefined} strokeWidth={2} connectNulls={false} isAnimationActive={false}
              dot={line.key === "bookedPercent" ? false : { r: 2, fill: line.color }} />)}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export default function SeasonalOccupancyPanel({ today, snapshotAt }: { today: string; snapshotAt: string | null }) {
  const id = useId();
  const targetInput = useRef<HTMLInputElement>(null);
  const [selection, setSelection] = useState<SeasonalSelection>(() => {
    const target = nextHotelMonth(today);
    return { view: "month", target, referenceYear: Number(target.slice(0, 4)) - 1 };
  });
  const [draft, setDraft] = useState<Draft>(() => ({ ...selection, referenceYear: String(selection.referenceYear) }));
  const [formError, setFormError] = useState("");
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ key: string; data: SeasonalOccupancy | null } | null>(null);
  const search = new URLSearchParams({ view: selection.view, target: selection.target, referenceYear: String(selection.referenceYear) }).toString();
  const loadingKey = `${search}:${snapshotAt}:${retry}`;

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetchPublic(`/api/analytics/seasonal-occupancy?${search}`, { cache: "no-store", signal: controller.signal });
        const body = await readResponse(response);
        if (!controller.signal.aborted) setResult({ key: loadingKey, data: response.ok ? body?.data ?? null : null });
      } catch {
        if (!controller.signal.aborted) setResult({ key: loadingKey, data: null });
      }
    }
    void load();
    return () => controller.abort();
  }, [search, loadingKey]);

  function selectView(view: SeasonalView, date?: string) {
    const target = date ?? (view === "month" ? selection.target.slice(0, 7) : `${selection.target.slice(0, 7)}-01`);
    const next = { view, target, referenceYear: selection.referenceYear };
    setDraft({ ...next, referenceYear: String(next.referenceYear) });
    setSelection(next);
    setFormError("");
    if (date) requestAnimationFrame(() => targetInput.current?.focus());
  }

  function updateTarget(target: string) {
    const yearChanged = target.slice(0, 4) !== draft.target.slice(0, 4);
    const referenceYear = target && yearChanged ? String(Number(target.slice(0, 4)) - 1) : draft.referenceYear;
    setDraft({ ...draft, target, referenceYear });
    setFormError("");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = { ...draft, referenceYear: Number(draft.referenceYear) };
    if (!seasonalRange(next, today)) {
      setFormError("Choose a valid target within the planning window and a reference year before the target year.");
      return;
    }
    setFormError("");
    setSelection(next);
    setRetry(value => value + 1);
  }

  const loading = result?.key !== loadingKey;
  const data = !loading ? result.data : null;
  const daily = selection.view === "date";
  const first = data?.days[0];
  const through = seasonalTargetLimit(today);
  const targetName = daily ? dayLabel(selection.target) : monthLabel(selection.target);

  return (
    <article className={`${frame.panel} insights-tabpanel`} role="tabpanel" id="forecast-panel-seasonal" aria-labelledby="forecast-tab-seasonal" tabIndex={0}>
      <header className={frame.header}>
        <div>
          <h3>Seasonal Occupancy</h3>
          <p>Compare a month or a specific date with the same calendar dates in an earlier year.</p>
        </div>
        <div className={styles.views} role="group" aria-label="Outlook view">
          <button type="button" aria-pressed={!daily} onClick={() => { if (daily) selectView("month"); }}><CalendarRange size={16} aria-hidden="true" /> Month</button>
          <button type="button" aria-pressed={daily} onClick={() => { if (!daily) selectView("date"); }}><CalendarDays size={16} aria-hidden="true" /> Specific date</button>
        </div>
      </header>

      <form className={`${frame.filters} ${styles.filters}`} onSubmit={submit}>
        <div className={frame.field}>
          <label htmlFor={`${id}-target`}>{daily ? "Target date" : "Target month"}</label>
          <input ref={targetInput} id={`${id}-target`} type={daily ? "date" : "month"} required value={draft.target} max={daily ? through : through.slice(0, 7)}
            placeholder={daily ? "YYYY-MM-DD" : "YYYY-MM"}
            onChange={event => updateTarget(event.target.value)} />
        </div>
        <div className={frame.field}>
          <label htmlFor={`${id}-year`}>Reference year</label>
          <input id={`${id}-year`} type="number" inputMode="numeric" required min={1000} max={Number(draft.target.slice(0, 4)) - 1}
            value={draft.referenceYear} onChange={event => { setDraft({ ...draft, referenceYear: event.target.value }); setFormError(""); }} />
        </div>
        <button type="submit" className="btn btn-accent" disabled={loading}>Show outlook</button>
        {formError && <p className={styles.formError} role="alert">{formError}</p>}
      </form>

      {loading ? <div className={frame.empty} role="status">Loading occupancy records…</div> : !data || !first ? (
        <div className={frame.empty} role="alert"><strong>Seasonal occupancy couldn’t load</strong><button type="button" className="btn btn-soft" onClick={() => setRetry(retry + 1)}>Try again</button></div>
      ) : <>
        <p className={frame.scope}>{targetName} · Reference year {selection.referenceYear} · Manila time{data.databaseMode === "demo" && " · Demo bookings"}</p>
        <dl className={`${frame.scorecard} ${styles.summary}`} aria-label="Seasonal occupancy summary">
          <div><dt>{daily ? "Rooms booked" : "Booked room-nights"}</dt><dd>{data.summary.bookedRoomNights ?? "—"}</dd></div>
          <div><dt>{daily && first.referenceDate ? `${dayLabel(first.referenceDate)} baseline` : "Historical baseline"}</dt><dd>{fmtPercent(data.summary.baselinePercent)}</dd></div>
          <div><dt>{data.summary.hasOpenDates ? "Projected occupancy" : "Recorded occupancy"}</dt><dd>{fmtPercent(data.summary.periodOccupancy)}</dd></div>
        </dl>

        <div className={styles.coverage} role="status">
          {data.summary.comparisonDays === 0 ? <>
            <strong>{first.referenceDate === null ? "No matching date in the reference year" : "Building occupancy history"}</strong>
            <p>{first.referenceDate === null
              ? "Choose a leap year to compare February 29."
              : data.databaseMode === "demo"
                ? "Reference dates use saved hotel records from a connected database."
                : "No matching occupancy records are available yet. The daily analytics run records completed hotel nights. Current bookings are available for planning."}</p>
          </> : <>
            <strong>{data.summary.comparisonDays} of {data.summary.targetDays} reference {daily ? "date" : "dates"} recorded</strong>
            {!daily && data.summary.periodOccupancy === null && <p>Daily values are shown where available. The monthly figure needs coverage for every target date.</p>}
            {daily && first.actual && first.reference && <p>{first.actual.percent === first.reference.percent
              ? "Recorded occupancy matched the historical baseline."
              : `Recorded occupancy was ${number.format(Math.abs(first.actual.percent - first.reference.percent))} percentage points ${first.actual.percent > first.reference.percent ? "above" : "below"} the historical baseline.`}</p>}
            {daily && first.projectedRooms !== null && <p>The seasonal estimate is {first.projectedRooms} of {data.activeRooms} active rooms, including {first.bookedRooms} already booked.</p>}
            {daily && !data.summary.hasOpenDates && !first.actual && <p>The target date has no recorded occupancy snapshot.</p>}
          </>}
          {data.summary.hasOpenDates && data.activeRooms === 0 && <p>Occupancy estimates require an active room count.</p>}
          {data.days.some(row => row.overCapacity) && <p>Some open dates have bookings above current active capacity. Their seasonal estimates are unavailable.</p>}
        </div>

        {!daily && <SeasonalChart days={data.days} />}
        <details className={frame.details} open={daily}>
          <summary>{daily ? "Date comparison" : "Daily occupancy records"}</summary>
          <div className={frame.tableScroll} tabIndex={0} role="region" aria-label="Seasonal occupancy records">
            <table>
              <thead><tr><th scope="col">Target date</th><th scope="col">Reference date</th><th scope="col">Booked rooms</th>
                <th scope="col">Historical baseline</th><th scope="col">Seasonal estimate</th><th scope="col">Recorded actual</th></tr></thead>
              <tbody>{data.days.map(row => <tr key={row.date}>
                <th scope="row">{daily ? dayLabel(row.date) : <button type="button" className={styles.dateLink} onClick={() => selectView("date", row.date)}>{dayLabel(row.date)}</button>}</th>
                <td>{row.referenceDate ? dayLabel(row.referenceDate) : "No matching date"}</td>
                <td>{row.bookedRooms ?? "—"}</td><td>{fmtPercent(row.reference?.percent)}</td><td>{fmtPercent(row.projectedPercent)}</td><td>{fmtPercent(row.actual?.percent)}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </details>
      </>}

      <details className={frame.details}>
        <summary>How this outlook works</summary>
        <p>The seasonal baseline uses recorded occupancy for the same month and day in the reference year. HAVEN applies that rate to today’s active room count and uses the higher of the resulting room count and current bookings. The monthly figure averages daily estimates for open dates and recorded actuals for closed dates. These planning estimates refresh with bookings. Forecast Evaluation scores saved short-term forecasts.</p>
      </details>
    </article>
  );
}
