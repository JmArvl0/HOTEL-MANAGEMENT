"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DownloadMenu, printDownload } from "@/components/ui/download-menu";
import { fetchPublic, readResponse } from "@/lib/client-errors";
import { shiftDate } from "@/lib/analytics/types";
import type { AnalyticalReport } from "@/lib/analytics/analytical-report";
import type { Role } from "@/lib/types";
import FrontDeskReportsPanel from "./front-desk-reports-panel";
import ForecastEvaluationPanel from "./forecast-evaluation-panel";
import frame from "./forecast-evaluation-panel.module.css";
import styles from "./phase-two.module.css";

const dateLabel = (date: string) => new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
const currency = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const number = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 1 });
const fmt = (value: number | null | undefined, suffix = "") => value == null ? "—" : `${number.format(value)}${suffix}`;
const money = (value: number | null) => value == null ? "—" : currency.format(value);
const percent = (part: number, total: number) => total ? fmt(part / total * 100, "%") : "—";

function download(data: AnalyticalReport, filters: { roomType: string; source: string }) {
  const lines: (number | string | null)[][] = [["Section", "Measure", "Date or group", "Value", "Context"],
    ["Scope", "Start", null, data.range.from, data.zone], ["Scope", "End", null, data.range.through, data.zone],
    ["Scope", "Room type", null, filters.roomType || "All", "Booking and room-type sections"],
    ["Scope", "Booking source", null, filters.source || "All", "Booking and room-type sections"]];
  for (const [period, values] of [["Current period", data.current], ["Previous period", data.prior]] as const) {
    for (const [key, value] of Object.entries(values)) lines.push([period, key, null, value, "Property-wide"]);
  }
  for (const { date, ...row } of data.trend) for (const [key, value] of Object.entries(row)) lines.push(["Daily trend", key, date, value, "Property-wide"]);
  for (const [key, value] of Object.entries(data.booking)) if (!Array.isArray(value)) lines.push(["Bookings", key, null, value, "Selected filters"]);
  for (const [source, count] of data.booking.sources) lines.push(["Booking sources", "Reservations created", source, count, null]);
  for (const { type, ...row } of data.byRoomType) for (const [key, value] of Object.entries(row)) lines.push(["Room types", key, type, value, "Selected filters"]);
  for (const [key, value] of Object.entries(data.service)) lines.push(["Service", key, null, value, "Property-wide"]);
  for (const row of data.recurring) lines.push(["Repeat maintenance", row.category, row.location, row.count, null]);
  for (const [key, value] of Object.entries(data.forecast)) lines.push(["Occupancy forecast", key, data.forecast.model, value, "Property-wide"]);
  const csv = lines.map(row => row.map(value => {
    const text = value == null ? "" : String(value);
    const escaped = typeof value === "string" && /^[\s\uFEFF]*[=+@-]/.test(text) ? `'${text}` : text;
    return `"${escaped.replaceAll('"', '""')}"`;
  }).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `haven-analytical-${data.range.from}-${data.range.through}.csv`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function HotelReports({ role, initialView = "analytical" }: { role: Role; initialView?: "analytical" | "operational" }) {
  const [view, setView] = useState(initialView);
  const [evaluation, setEvaluation] = useState<AnalyticalReport["range"]>();
  return <div className={styles.layout}>
    {!evaluation && <div className={styles.switcher} role="group" aria-label="Report type"><button type="button" aria-pressed={view === "analytical"} onClick={() => setView("analytical")}>Analytical Report</button><button type="button" aria-pressed={view === "operational"} onClick={() => setView("operational")}>Operational Report</button></div>}
    {view === "analytical" ? <div hidden={Boolean(evaluation)}><AnalyticalReportPanel onEvaluation={setEvaluation} /></div> : <FrontDeskReportsPanel role={role} />}
    {evaluation && <><button type="button" className={styles.link} onClick={() => setEvaluation(undefined)}>Back to Analytical Report</button><ForecastEvaluationPanel snapshotAt={null} reportRange={evaluation} /></>}
  </div>;
}

function AnalyticalReportPanel({ onEvaluation }: { onEvaluation: (range: AnalyticalReport["range"]) => void }) {
  const [today] = useState(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date()));
  const defaultFilters = { from: "", through: "", roomType: "", source: "" };
  const [draft, setDraft] = useState(defaultFilters);
  const [selection, setSelection] = useState(defaultFilters);
  const [requestVersion, setRequestVersion] = useState(0);
  const [metric, setMetric] = useState<"actualOccupancy" | "collections" | "roomAccrual" | "refunds">("actualOccupancy");
  const [result, setResult] = useState<{ key: string; data: (AnalyticalReport & { calendarToday: string }) | null; error?: string }>();
  const query = new URLSearchParams(Object.entries(selection).filter(([, value]) => value)).toString();
  const key = `${query}:${requestVersion}`;
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetchPublic(`/api/staff/analytical-report?${query}`, { cache: "no-store", signal: controller.signal });
        const body = await readResponse(response);
        if (!controller.signal.aborted) setResult({ key, data: response.ok ? body.data : null, error: response.ok ? undefined : body.error });
      } catch { if (!controller.signal.aborted) setResult({ key, data: null }); }
    }
    void load();
    return () => controller.abort();
  }, [query, key]);
  const loading = result?.key !== key;
  const data = result?.data ?? null;
  const update = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSelection({ ...draft, from: draft.from || data?.range.from || "", through: draft.through || data?.range.through || "" });
    setRequestVersion(value => value + 1);
  };
  const preset = (days: number) => {
    const end = data?.calendarToday ?? today;
    const next = { ...draft, from: shiftDate(end, -days), through: shiftDate(end, -1) };
    setDraft(next);
    setSelection(next);
    setRequestVersion(value => value + 1);
  };
  const previous = data?.prior;
  return <section className={`${frame.panel} ${styles.printable}`} aria-label="Analytical Report">
    <header className={frame.header}><div><h3>Analytical Report</h3><p>Review hotel performance, booking patterns, and service outcomes over a completed period.</p></div>
      <div className={styles.actions}><DownloadMenu label="Download analytical report" disabled={!data || loading} actions={[{ value: "csv", label: "Export CSV", run: () => { if (data) download(data, selection); } }, printDownload]} /></div>
    </header>
    <form className={`${frame.filters} ${styles.control}`} onSubmit={update}>
      <label className={frame.field}>From<input type="date" max={shiftDate(data?.calendarToday ?? today, -1)} value={draft.from || data?.range.from || ""} onChange={event => setDraft({ ...draft, from: event.target.value })} /></label>
      <label className={frame.field}>Through<input type="date" min={draft.from || data?.range.from} max={shiftDate(data?.calendarToday ?? today, -1)} value={draft.through || data?.range.through || ""} onChange={event => setDraft({ ...draft, through: event.target.value })} /></label>
      <div className={frame.field}><label htmlFor="analytical-room-type">Room type</label><select id="analytical-room-type" value={draft.roomType} onChange={event => setDraft({ ...draft, roomType: event.target.value })}><option value="">All room types</option>{[...new Set([...(data?.choices.types ?? []), ...(draft.roomType ? [draft.roomType] : [])])].map(type => <option key={type}>{type}</option>)}</select></div>
      <div className={frame.field}><label htmlFor="analytical-source">Booking source</label><select id="analytical-source" value={draft.source} onChange={event => setDraft({ ...draft, source: event.target.value })}><option value="">All booking sources</option>{[...new Set([...(data?.choices.sources ?? []), ...(draft.source ? [draft.source] : [])])].map(source => <option key={source}>{source}</option>)}</select></div>
      <button type="submit" className="btn btn-accent" disabled={loading}>Apply filters</button>
      <button type="button" className="btn btn-soft" onClick={() => preset(7)}>Last 7 days</button><button type="button" className="btn btn-soft" onClick={() => preset(30)}>Last 30 days</button>
    </form>
    {loading ? <p className={frame.empty} role="status">Loading report records…</p> : !data ? <div className={frame.empty} role="alert"><strong>{result?.error ?? "The analytical report could not be loaded."}</strong><button type="button" className="btn btn-soft" onClick={() => setRequestVersion(value => value + 1)}>Try again</button></div> : <>
      <p className={frame.scope}>{dateLabel(data.range.from)} – {dateLabel(data.range.through)} · {data.zone}. Room and source filters apply to bookings and room types.</p>
      <dl className={frame.scorecard} aria-label="Hotel performance">
        <div><dt>Booked occupancy</dt><dd>{fmt(data.current.bookedOccupancy, "%")}</dd><small>Prior {fmt(previous?.bookedOccupancy, "%")}</small></div>
        <div><dt>ADR <small>· Room accrual</small></dt><dd>{money(data.current.adr)}</dd><small>Prior {money(data.prior.adr)}</small></div>
        <div><dt>RevPAR <small>· Room accrual</small></dt><dd>{money(data.current.revpar)}</dd><small>Prior {money(data.prior.revpar)}</small></div>
        <div><dt>Settled collections</dt><dd>{money(data.current.collections)}</dd><small>Prior {money(data.prior.collections)}</small></div>
      </dl>
      <p className={frame.note}>Night audits {data.current.closedDays}/{data.current.expected} · Recorded occupancy {data.current.actualDays}/{data.current.expected} days · Refunds {money(data.current.refunds)}. Property totals use the dates shown. Prior period is {dateLabel(data.previous.from)} – {dateLabel(data.previous.through)}.</p>

      <figure className={frame.figure} aria-label="Daily performance trend">
        <figcaption><strong>Daily performance</strong><label htmlFor="analytical-series">Measure</label><select id="analytical-series" value={metric} onChange={event => setMetric(event.target.value as typeof metric)}><option value="actualOccupancy">Recorded occupancy</option><option value="roomAccrual">Booked room accrual</option><option value="collections">Collections</option><option value="refunds">Refunds</option></select></figcaption>
        {data.trend.some(row => row[metric] !== null) ? <div className={frame.chart}><ResponsiveContainer width="100%" height="100%"><LineChart data={data.trend} accessibilityLayer margin={{ top: 12, right: 14, left: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--fe-line)" /><XAxis dataKey="date" minTickGap={40} tickFormatter={value => value.slice(5)} tick={{ fill: "var(--fe-muted)", fontSize: 11 }} />
          <YAxis width={49} domain={metric === "actualOccupancy" ? [0, 100] : [0, "auto"]} tick={{ fill: "var(--fe-muted)", fontSize: 11 }} /><Tooltip labelFormatter={dateLabel} />
          <Line dataKey={metric} name={metric === "actualOccupancy" ? "Occupancy (%)" : "Amount (PHP)"} stroke="var(--fe-actual)" strokeWidth={2} dot={{ r: 2 }} connectNulls={false} isAnimationActive={false} />
        </LineChart></ResponsiveContainer></div> : <p className={frame.note}>No recorded values for this measure in the selected period.</p>}
      </figure>
      <details className={frame.details}><summary>Daily figures</summary><div className={`${frame.tableScroll} ${styles.printTable}`} role="region" aria-label="Daily analytical report figures" tabIndex={0}><table><thead><tr><th>Date</th><th>Recorded occupancy</th><th>Booked room-nights</th><th>Room supply</th><th>Booked room accrual</th><th>Collections</th><th>Refunds</th></tr></thead><tbody>{data.trend.map(row => <tr key={row.date}><th scope="row">{dateLabel(row.date)}</th><td>{fmt(row.actualOccupancy, "%")}</td><td>{fmt(row.booked)}</td><td>{fmt(row.supply)}</td><td>{money(row.roomAccrual)}</td><td>{money(row.collections)}</td><td>{money(row.refunds)}</td></tr>)}</tbody></table></div></details>
      <details className={frame.details}><summary>How these measures are calculated</summary><p>Booked occupancy divides booked room-nights by serviceable room-nights recorded at close. ADR uses booked room accrual per booked room-night. RevPAR uses booked room accrual per serviceable room-night. Those rates use frozen contracted room prices and require complete night-audit coverage. Collections and refunds are settled payments by posting day, or local settlement day for older entries. Finance recognition and folio corrections follow Accounting’s ledger.</p></details>

      <div className={styles.split}>
        <section className={styles.block}><h4>Booking patterns</h4><ul className={styles.rows}>
          <li className={styles.row}>Created reservations<strong>{data.booking.count}</strong></li>
          <li className={styles.row}><span>Cancellation rate<small>Of reservations created in this period</small></span><strong>{percent(data.booking.cancelled, data.booking.count)}</strong></li>
          <li className={styles.row}><span>No-show rate<small>Of scheduled arrivals with an observed outcome</small></span><strong>{percent(data.booking.noShows, data.booking.arrivalCount)}</strong></li>
          <li className={styles.row}>Median booking lead time<strong>{fmt(data.booking.leadDays, " days")}</strong></li>
          <li className={styles.row}><span>Average actual stay<small>{data.booking.stayCount} completed stays with recorded arrival</small></span><strong>{fmt(data.booking.stayNights, " nights")}</strong></li>
          {data.booking.sources.map(([source, count]) => <li className={styles.row} key={source}>{source}<strong>{count} · {percent(count, data.booking.count)}</strong></li>)}
        </ul></section>
        <section className={styles.block}><h4>Service performance</h4><ul className={styles.rows}>
          <li className={styles.row}><span>Checkout to housekeeping ready<small>{data.service.readyCount} linked checkout tasks, including required inspection</small></span><strong>{fmt(data.service.turnaround, " min")}</strong></li>
          <li className={styles.row}><span>First recorded department start<small>{data.service.responseCount} of {data.service.requestsOpened} requests opened</small></span><strong>{fmt(data.service.firstResponse, " min")}</strong></li>
          <li className={styles.row}><span>Guest request completion<small>{data.service.completionCount} recorded completions in the cohort</small></span><strong>{fmt(data.service.completion, " min")}</strong></li>
        </ul></section>
      </div>
      <section className={styles.block}><h4>Room type performance</h4><p>Room-type totals use current reservation type and frozen nightly prices for dates with a saved close. Dated room-type capacity is unavailable.</p>
        <div className={frame.tableScroll} role="region" aria-label="Room type performance" tabIndex={0}><table><thead><tr><th>Room type</th><th>Booked nights</th><th>Priced nights</th><th>Room accrual</th><th>ADR</th></tr></thead><tbody>{data.byRoomType.map(row => <tr key={row.type}><th scope="row">{row.type}</th><td>{row.bookedNights}</td><td>{row.pricedNights}</td><td>{money(row.roomAccrual)}</td><td>{money(row.adr)}</td></tr>)}</tbody></table></div>{!data.byRoomType.length && <p>No booked room-nights on saved audit dates in the selection.</p>}
      </section>
      <div className={styles.split}>
        <section className={styles.block}><h4>Repeat maintenance</h4>{data.recurring.length ? <ul className={styles.rows}>{data.recurring.map(row => <li key={`${row.category}-${row.location}`} className={styles.row}><span>{row.category.replaceAll("_", " ")}<small>{row.location}</small></span><strong>{row.count}</strong></li>)}</ul> : <p>No repeated room or asset issues in this period.</p>}</section>
        <section className={styles.block}><h4>How close was the occupancy forecast?</h4><p>{data.forecast.observations} matched forecasts · Average error in percentage points</p><ul className={styles.rows}><li className={styles.row}>HAVEN was off by<strong>{fmt(data.forecast.meanError, " pp")}</strong></li><li className={styles.row}>7-day average was off by<strong>{fmt(data.forecast.baselineError, " pp")}</strong></li></ul><button type="button" className={styles.link} onClick={() => onEvaluation(data.range)}>View forecast accuracy</button></section>
      </div>
    </>}
  </section>;
}
