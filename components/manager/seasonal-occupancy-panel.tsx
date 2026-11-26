"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { CalendarDays, CalendarRange } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchPublic, readResponse } from "@/lib/client-errors";
import { nextHotelMonth, seasonalRange, seasonalTargetLimit, type SeasonalMatch, type SeasonalOccupancy, type SeasonalSelection, type SeasonalView } from "@/lib/analytics/seasonal-occupancy";
import frame from "./forecast-evaluation-panel.module.css";
import styles from "./seasonal-occupancy-panel.module.css";

type Draft = Omit<SeasonalSelection, "referenceYear"> & { referenceYear: string };

const day = new Intl.DateTimeFormat("en-PH", { weekday: "short", year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
const month = new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric", timeZone: "UTC" });
const dayLabel = (date: string) => day.format(new Date(`${date}T00:00:00Z`));
const monthLabel = (date: string) => month.format(new Date(`${date}-01T00:00:00Z`));
const number = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 1 });
const fmtPercent = (value: number | null | undefined) => value != null ? `${number.format(value)}%` : "—";

const series = [
  { key: "bookedPercent", label: "Already booked", color: "var(--fe-actual)" },
  { key: "baselinePercent", label: "Recorded in the reference year", color: "var(--fe-baseline)", dash: "2 4" },
  { key: "projectedPercent", label: "Expected occupancy", color: "var(--fe-predicted)", dash: "7 4" },
  { key: "actualPercent", label: "Recorded for the selected dates", color: "var(--fe-ink)", dash: "10 3 2 3" }
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
  const search = new URLSearchParams({ view: selection.view, target: selection.target, referenceYear: String(selection.referenceYear), match: selection.match ?? "calendar" }).toString();
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
    const next = { ...selection, view, target };
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
  const referenceName = first?.referenceDate
    ? daily ? dayLabel(first.referenceDate) : String(selection.referenceYear)
    : "Reference date";

  return (
    <article className={`${frame.panel} insights-tabpanel`} role="tabpanel" id="forecast-panel-seasonal" aria-labelledby="forecast-tab-seasonal" tabIndex={0}>
      <header className={frame.header}>
        <div>
          <h3>Seasonal Occupancy</h3>
          <p>Compare a date or month with verified occupancy from an earlier year.</p>
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
        <div className={frame.field}>
          <label htmlFor={`${id}-match`}>Match by</label>
          <select id={`${id}-match`} value={draft.match ?? "calendar"} onChange={event => setDraft({ ...draft, match: event.target.value as SeasonalMatch })}>
            <option value="calendar">Same calendar date</option><option value="weekday">Matching weekday</option>
          </select>
        </div>
        <button type="submit" className="btn btn-accent" disabled={loading}>Show outlook</button>
        {formError && <p className={styles.formError} role="alert">{formError}</p>}
      </form>

      {loading ? <div className={frame.empty} role="status">Loading occupancy records…</div> : !data || !first ? (
        <div className={frame.empty} role="alert"><strong>Seasonal occupancy couldn’t load</strong><button type="button" className="btn btn-soft" onClick={() => setRetry(retry + 1)}>Try again</button></div>
      ) : <>
        <p className={frame.scope}>{targetName} · Reference year {selection.referenceYear} · {selection.match === "weekday" ? "Matching weekday" : "Same calendar date"} · Manila time{data.databaseMode === "demo" && " · Demo bookings"}</p>
        <div className={frame.answer} role="status">
          {daily && first.projectedRooms !== null ? <>
            <strong>About {first.projectedRooms} of {data.activeRooms} rooms expected on {targetName}.</strong>
            <p>HAVEN used the occupancy recorded on {referenceName} and today’s active room count.</p>
          </> : data.summary.periodOccupancy !== null ? <>
            <strong>{fmtPercent(data.summary.periodOccupancy)} {data.summary.hasOpenDates ? "expected occupancy" : "recorded occupancy"} for {targetName}.</strong>
            {daily && first.reference && <p>{fmtPercent(first.reference.percent)} was recorded on {referenceName}.</p>}
            {!daily && <p>{data.summary.comparisonDays} of {data.summary.targetDays} reference dates have saved occupancy records.</p>}
          </> : first.referenceDate === null ? <>
            <strong>February 29 has no match in {selection.referenceYear}.</strong>
            <p>Choose a leap year to compare that date.</p>
          </> : data.summary.comparisonDays === 0 ? <>
            <strong>No occupancy records for the matching dates yet.</strong>
            <p>{data.databaseMode === "demo" ? "Earlier occupancy comes from saved hotel records in a connected database." : "You can still see current bookings. HAVEN adds occupancy records as hotel nights close."}</p>
          </> : <>
            <strong>{daily ? `No occupancy figure for ${targetName} yet.` : "More dates are needed for a full-month figure."}</strong>
            <p>{daily ? "Check the date comparison below for the figures HAVEN has." : `${data.summary.comparisonDays} of ${data.summary.targetDays} reference dates have saved occupancy records. Open the daily figures for the dates HAVEN can show.`}</p>
          </>}
          {data.summary.auditDays > 0 && <p>{data.summary.auditDays} reference dates also have a closed night-audit booking figure in the date records.</p>}
          {data.summary.hasOpenDates && data.activeRooms === 0 && <p>Occupancy estimates require an active room count.</p>}
          {data.days.some(row => row.overCapacity) && <p>HAVEN leaves the estimate blank where bookings exceed the active room count.</p>}
        </div>
        <dl className={`${frame.scorecard} ${styles.summary}`} aria-label="Seasonal occupancy summary">
          <div><dt>{daily ? "Rooms already booked" : "Room-nights already booked"}</dt><dd>{data.summary.bookedRoomNights ?? "—"}</dd>
            {!daily && <small>One room for one night</small>}</div>
          <div><dt>Occupancy in {referenceName}</dt><dd>{fmtPercent(data.summary.baselinePercent)}</dd></div>
          <div><dt>{data.summary.hasOpenDates ? "Expected occupancy" : "Recorded occupancy"}</dt><dd>{fmtPercent(data.summary.periodOccupancy)}</dd></div>
        </dl>

        {!daily && <SeasonalChart days={data.days} />}
        <details className={frame.details} open={daily}>
          <summary>{daily ? "Date comparison" : "Daily occupancy records"}</summary>
          <div className={frame.tableScroll} tabIndex={0} role="region" aria-label="Seasonal occupancy records">
            <table>
              <thead><tr><th scope="col">Target date</th><th scope="col">Reference date</th><th scope="col">Booked rooms</th>
                <th scope="col">Occupied in earlier year</th>{data.summary.auditDays > 0 && <th scope="col">Booked in earlier year · night audit</th>}<th scope="col">Expected occupancy</th><th scope="col">Recorded occupancy</th></tr></thead>
              <tbody>{data.days.map(row => <tr key={row.date}>
                <th scope="row">{daily ? dayLabel(row.date) : <button type="button" className={styles.dateLink} onClick={() => selectView("date", row.date)}>{dayLabel(row.date)}</button>}</th>
                <td>{row.referenceDate ? dayLabel(row.referenceDate) : "No matching date"}</td>
                <td>{row.bookedRooms ?? "—"}</td><td>{fmtPercent(row.reference?.percent)}{row.reference && <small> · Closed-night snapshot</small>}</td>
                {data.summary.auditDays > 0 && <td>{fmtPercent(row.referenceBooked?.percent)}</td>}<td>{fmtPercent(row.projectedPercent)}</td><td>{fmtPercent(row.actual?.percent)}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </details>
      </>}

      <details className={frame.details}>
        <summary>How this outlook works</summary>
        <p>HAVEN applies the earlier year’s occupancy rate to today’s active rooms and uses current bookings as the minimum. The monthly figure averages estimates for upcoming dates and recorded occupancy for completed dates. Weekday matching pairs each target with the nearest matching weekday in the chosen year. The night audit reports booked rooms over serviceable capacity. Forecast estimates use verified occupied-room snapshots.</p>
      </details>
    </article>
  );
}
