"use client";


import { fetchPublic, readResponse } from "@/lib/client-errors";

import { userMessage } from "@/lib/errors";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowDownRight, BedDouble, CalendarDays, Coins, RefreshCw, SlidersHorizontal, TrendingDown, TrendingUp } from "lucide-react";
import { Area, Bar, CartesianGrid, ComposedChart, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TablePagination, useTablePagination } from "@/components/ui/table-pagination";
import { Modal } from "@/components/ui/Modal";
import { HavenSkeletonCard, HavenErrorAlert } from "@/components/ui/haven-data-controls";
import { DYNAMIC_PRICING_MODEL_VERSION, MAX_RATE_PROPOSALS, type DynamicRateRecommendation } from "@/lib/analytics/dynamic-pricing";
import type { PricingRecommendationResult, ReviewedRate } from "@/lib/analytics/pricing-service";
import { usePrefersReducedMotion } from "@/lib/motion/reduced-motion";
import { ForecastAccuracyPreview } from "./forecast-evaluation-panel";
import { ForecastCard, ForecastHeader, ForecastMetrics, ForecastQuality, ForecastTooltip, forecastDay, forecastPeriod } from "./forecast-workspace";
import styles from "./forecast-workspace.module.css";

type PricingResponse = Omit<PricingRecommendationResult, "generatedAt">;

const peso = (value: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);
const dateLabel = (value: string) => new Intl.DateTimeFormat("en-PH", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
const recommendationKey = (entry: Pick<DynamicRateRecommendation, "roomTypeId" | "targetDate">) => `${entry.roomTypeId}:${entry.targetDate}`;
const rateAction = (change: number) => change > 0 ? `Raise +${change}%` : change < 0 ? `Lower ${Math.abs(change)}%` : "Keep current rate";
const occupancyCaption = (entry: DynamicRateRecommendation) => entry.occupancyBasis === "fact" ? "Hotel already booked" : "Hotel expected occupancy";

export default function PredictivePricingPanel({ onAccuracy, snapshotAt = null }: { onAccuracy?: () => void; snapshotAt?: string | null }) {
  const fillId = useId();
  const stayDateSelect = useRef<HTMLSelectElement>(null);
  const [data, setData] = useState<PricingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [reviewRows, setReviewRows] = useState<ReviewedRate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rates, setRates] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [roomType, setRoomType] = useState("");
  const [stayDate, setStayDate] = useState("");
  const chartAnimated = !usePrefersReducedMotion();

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetchPublic("/api/analytics/pricing-recommendations", { cache: "no-store", signal });
      const body = await readResponse(response);
      if (signal?.aborted) return;
      if (!response.ok) throw new Error(body?.error ?? "Unable to load pricing recommendations.");
      const raw = body.data as Partial<PricingResponse>;
      if (!Array.isArray(raw.recommendations)) throw new Error("Pricing recommendations are unavailable in this response.");
      const next: PricingResponse = {
        modelRunId: raw.modelRunId ?? null,
        modelVersion: raw.modelVersion ?? DYNAMIC_PRICING_MODEL_VERSION,
        recommendations: raw.recommendations,
        outcomes: raw.outcomes ?? [],
        confidence: raw.confidence ?? { level: "limited", basis: "Forecast confidence is unavailable." },
      };
      setData(next);
      setRates(Object.fromEntries(next.recommendations.map((entry) => [recommendationKey(entry), entry.recommendedRate.toFixed(2)])));
      setSelected(new Set());
      setError("");
    } catch (caught) {
      if (!signal?.aborted) setError(userMessage(caught, "Unable to load pricing recommendations."));
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

  const ordered = useMemo(() => [...(data?.recommendations ?? [])]
    .sort((a, b) => a.targetDate.localeCompare(b.targetDate) || a.roomTypeName.localeCompare(b.roomTypeName)), [data]);

  const toggle = (key: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else if (next.size < MAX_RATE_PROPOSALS) next.add(key);
    return next;
  });

  const submit = async () => {
    if (!data?.modelRunId || selected.size === 0 || submitting) return;
    const recommendations = data.recommendations.filter((entry) => selected.has(recommendationKey(entry))).map((entry) => ({
      roomTypeId: entry.roomTypeId,
      targetDate: entry.targetDate,
      reviewKey: entry.reviewKey,
      nightlyRate: Number(rates[recommendationKey(entry)]),
    }));
    if (data.recommendations.some(entry => {
      const key = recommendationKey(entry);
      if (!selected.has(key)) return false;
      const value = Number(rates[key]);
      return !rates[key]?.trim() || !Number.isFinite(value) || value < entry.floorRate || value > entry.ceilingRate;
    })) {
      setFeedback("Enter a nightly rate within the allowed range for every selected stay date.");
      return;
    }
    setSubmitting(true);
    setFeedback("");
    try {
      const response = await fetchPublic("/api/analytics/pricing-recommendations/propose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelRunId: data.modelRunId, recommendations }),
      });
      const body = await readResponse(response);
      if (response.status === 409) {
        setOpen(false);
        await load();
        setFeedback(body?.error ?? "Suggestions changed. Review the refreshed rates before submitting.");
        return;
      }
      if (!response.ok) throw new Error(body?.error ?? "Unable to submit the rate proposal.");
      setOpen(false);
      setSelected(new Set());
      setFeedback(`${body.data?.submitted ?? recommendations.length} rate proposal${recommendations.length === 1 ? "" : "s"} sent to Owner/Admin review. Live rates are unchanged.`);
    } catch (caught) {
      setFeedback(userMessage(caught, "Unable to submit the rate proposal."));
    } finally {
      setSubmitting(false);
    }
  };

  const roomTypes = new Map(ordered.map(entry => [entry.roomTypeId, entry.roomTypeName]));
  const room = roomTypes.has(roomType) ? roomType : "";
  const visible = ordered.filter(entry => !room || entry.roomTypeId === room);
  const stayDates = [...new Set(visible.map(entry => entry.targetDate))];
  const activeDate = stayDates.includes(stayDate) ? stayDate : "";
  const rateRows = activeDate ? visible.filter(entry => entry.targetDate === activeDate) : visible;
  const ratePage = useTablePagination(rateRows, 8);

  if (loading) return <div role="status" aria-label="Loading predictive pricing"><HavenSkeletonCard hasHeader /></div>;
  if (error) return <HavenErrorAlert title="Pricing outlook unavailable" body={error} action={<button type="button" className="btn btn-soft btn-sm" onClick={() => { setLoading(true); void load(); }}><RefreshCw size={14} /> Try again</button>} variant="internal" />;
  if (!data) return null;

  const featured = [...visible].sort((a, b) => Math.abs(b.percentageChange) - Math.abs(a.percentageChange))[0];
  const ChangeIcon = featured && featured.percentageChange < 0 ? TrendingDown : TrendingUp;
  const chartRoom = featured?.roomTypeId;
  const days = visible.filter(entry => entry.roomTypeId === chartRoom);
  const expectedDays = days.filter(entry => entry.occupancyBasis === "prediction");
  const highest = expectedDays.reduce<DynamicRateRecommendation | undefined>((best, entry) => !best || entry.projectedOccupancy > best.projectedOccupancy ? entry : best, undefined);
  const lowest = expectedDays.reduce<DynamicRateRecommendation | undefined>((best, entry) => !best || entry.projectedOccupancy < best.projectedOccupancy ? entry : best, undefined);
  const chartRows = days.map(entry => ({
    day: entry.targetDate,
    forecast: entry.occupancyBasis === "prediction" ? entry.projectedOccupancy : null,
    booked: entry.occupancyBasis === "fact" ? entry.projectedOccupancy : null,
    suggested: entry.recommendedRate,
    selling: entry.sellingRate ?? entry.baseRate,
    highDemand: entry.demandTier === "high"
  }));

  return <>
    <ForecastHeader title="Demand & Rate Forecast" description="Review suggested nightly rates using occupancy, recent bookings and day of week."
      period={forecastPeriod(ordered[0]?.targetDate, ordered.at(-1)?.targetDate)}>
      {roomTypes.size > 0 && <label className={styles.control}>Room type
        <select value={room} onChange={event => { setRoomType(event.target.value); ratePage.setPage(1); }}>
          <option value="">All room types</option>
          {[...roomTypes].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </label>}
    </ForecastHeader>
    {featured ? <>
      {featured.percentageChange !== 0 && <div className={`${styles.alert} ${styles.rateAlert}`}>
        <ChangeIcon size={20} aria-hidden="true" />
        <div><strong>Consider {peso(featured.recommendedRate)} for {featured.roomTypeName} on {dateLabel(featured.targetDate)}.</strong>
          <p>{rateAction(featured.percentageChange)} compared with its {peso(featured.sellingRate ?? featured.baseRate)} selling rate.</p></div>
        <button type="button" className={`${styles.textButton} ${styles.rateJump}`} onClick={() => {
          setStayDate(featured.targetDate);
          ratePage.setPage(1);
          stayDateSelect.current?.focus();
        }}>See rates for {forecastDay(featured.targetDate)} <ArrowDownRight size={15} aria-hidden="true" /></button>
      </div>}
      <ForecastMetrics metrics={[
        { label: "Current selling rate", value: peso(featured.sellingRate ?? featured.baseRate), detail: featured.roomTypeName, icon: Coins },
        { label: "Suggested nightly rate", value: peso(featured.recommendedRate), detail: dateLabel(featured.targetDate), icon: TrendingUp },
        { label: occupancyCaption(featured), value: `${featured.projectedOccupancy}%`, detail: dateLabel(featured.targetDate), icon: BedDouble },
        { label: "Net bookings", value: featured.bookingPace > 0 ? `+${featured.bookingPace}` : featured.bookingPace, detail: "Past 48 hours · for this room type and date", icon: CalendarDays }
      ]} />
      <div className={styles.split}>
        <div className={styles.splitTable}>
        <ForecastCard title="Demand & rate outlook" description={`Hotel-wide occupancy and suggested nightly rates for ${featured.roomTypeName}.`}>
          <div className={styles.legend}>
            {chartRows.some(row => row.booked !== null) && <span><i data-series="booked" />Already booked</span>}
            {chartRows.some(row => row.forecast !== null) && <span><i data-series="actual" />Expected occupancy</span>}
            <span><i data-series="rate" />Suggested nightly rate</span>
            <span><i data-series="expected" />Current selling rate</span>
          </div>
          <div className={styles.chart}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartRows} accessibilityLayer>
                <defs>
                  <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--forecast-actual)" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="var(--forecast-actual)" stopOpacity={0.035} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--forecast-grid)" strokeDasharray="3 4" vertical={false} />
                <XAxis dataKey="day" tickFormatter={forecastDay} axisLine={false} tickLine={false} minTickGap={12} padding={{ left: 9, right: 9 }} />
                <YAxis yAxisId="occupancy" domain={[0, 100]} unit="%" width={44} axisLine={false} tickLine={false} />
                <YAxis yAxisId="rate" orientation="right" tickFormatter={peso} width={67} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ stroke: "var(--forecast-cursor)", strokeDasharray: "4 4" }}
                  content={props => <ForecastTooltip {...props} units={(name, value) => name.includes("rate") ? peso(value) : `${value}%`} />} />
                {chartRows.filter(row => row.highDemand).map(row => <ReferenceArea key={row.day} yAxisId="occupancy" x1={row.day} x2={row.day} fill="var(--forecast-actual)" fillOpacity={0.11}
                  label={row.day === featured.targetDate ? { value: "High demand", position: "insideBottom", fill: "var(--st-text-primary)", fontSize: 10 } : undefined} />)}
                <Bar yAxisId="occupancy" dataKey="booked" name="Already booked" fill="var(--forecast-booked)" maxBarSize={19} radius={[4, 4, 0, 0]} isAnimationActive={chartAnimated} />
                <Area yAxisId="occupancy" type="monotone" dataKey="forecast" name="Expected occupancy" stroke="var(--forecast-actual)" fill={`url(#${fillId})`} strokeWidth={2.5}
                  dot={{ r: 2.4, fill: "var(--forecast-actual)", stroke: "var(--forecast-actual)" }} isAnimationActive={chartAnimated} />
                <Line yAxisId="rate" dataKey="selling" name="Current selling rate" stroke="var(--forecast-projection)" strokeDasharray="3 4" dot={false} isAnimationActive={false} />
                <Line yAxisId="rate" type="monotone" dataKey="suggested" name="Suggested nightly rate" stroke="var(--forecast-rate)" strokeWidth={2.2}
                  dot={{ r: 2.4, fill: "var(--st-bg-surface)", stroke: "var(--forecast-rate)" }} isAnimationActive={chartAnimated} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ForecastCard>
      <ForecastCard title="Suggested rates by stay date" description="Select the rates you want to send to Owner or Admin for approval.">
        <div className={styles.rateToolbar}>
          <label className={styles.control}>Filter by stay date
            <select ref={stayDateSelect} value={activeDate} onChange={event => { setStayDate(event.target.value); ratePage.setPage(1); }}>
              <option value="">All dates</option>
              {stayDates.map(date => <option key={date} value={date}>{dateLabel(date)}</option>)}
            </select>
          </label>
          <span className={styles.rateCount} aria-live="polite">
            {rateRows.length} {rateRows.length === 1 ? "rate" : "rates"}{selected.size > 0 && ` · ${selected.size} selected`}
          </span>
          <button type="button" className="btn btn-accent" onClick={() => {
            setReviewRows(selected.size ? ordered.filter(entry => selected.has(recommendationKey(entry))) : rateRows);
            setFeedback("");
            setOpen(true);
          }} disabled={!data.modelRunId}>
            <SlidersHorizontal size={15} aria-hidden="true" /> Review rate proposals{selected.size > 0 && ` (${selected.size})`}
          </button>
          {!data.modelRunId && <small>Refresh predictions to record a snapshot before proposing rates.</small>}
        </div>
        <p className={styles.tableHint}>Scroll the table to see all columns.</p>
        <div className={`${styles.table} ${styles.tableRates}`} tabIndex={0} role="region" aria-label="Suggested rates by stay date">
          <table>
            <thead><tr><th>Select</th><th>Stay date</th><th>Room type</th><th>Current rate</th><th>Suggested rate</th><th>Hotel occupancy</th><th>Demand</th><th>Action</th></tr></thead>
            <tbody>{ratePage.rows.map(entry => {
              const key = recommendationKey(entry);
              return <tr key={key} data-selected={selected.has(key)}>
                <td><input type="checkbox" aria-label={`Select ${entry.roomTypeName}, ${dateLabel(entry.targetDate)}`} checked={selected.has(key)} disabled={!selected.has(key) && selected.size >= MAX_RATE_PROPOSALS} onChange={() => toggle(key)} /></td>
                <th scope="row">{dateLabel(entry.targetDate)}</th><td>{entry.roomTypeName}</td>
                <td className={styles.numeric}>{peso(entry.sellingRate ?? entry.baseRate)}</td><td className={styles.numeric}><b>{peso(entry.recommendedRate)}</b></td>
                <td>{entry.projectedOccupancy}% {entry.occupancyBasis === "fact" ? "booked" : "expected"}</td>
                <td><span className={`badge ${entry.demandTier === "high" ? "pending" : "confirmed"}`}>{entry.demandTier}</span></td>
                <td>{rateAction(entry.percentageChange)}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        {ratePage.pageCount > 1 && <TablePagination {...ratePage} onPageChange={ratePage.setPage} noun="suggested rates" />}
      </ForecastCard>
        </div>
        <div className={styles.rail}>
          <ForecastCard title="Forecast summary" emphasis>
            <dl className={styles.facts}>
              <div><dt>High-demand dates</dt><dd>{days.filter(entry => entry.demandTier === "high").length} of {days.length}</dd></div>
              {highest && <div><dt>Peak expected occupancy</dt><dd>{highest.projectedOccupancy}% · {forecastDay(highest.targetDate)}</dd></div>}
              {lowest && <div><dt>Lowest expected occupancy</dt><dd>{lowest.projectedOccupancy}% · {forecastDay(lowest.targetDate)}</dd></div>}
            </dl>
          </ForecastCard>
          <ForecastCard title="Why this rate?">
            <h4>{featured.roomTypeName} · {dateLabel(featured.targetDate)}</h4>
            <p>{featured.occupancyBasis === "fact"
              ? `HAVEN used ${featured.projectedOccupancy}% already booked because pickup history is limited for this date. The rate also considers room-type booking activity in the past 48 hours and day of week.`
              : featured.reasoning}</p>
            <p className={styles.description}>{featured.observations ?? 0} matched nights for this date’s occupancy estimate.</p>
            <ForecastQuality label="Data confidence" value={featured.confidence} basis={featured.occupancyBasis === "fact" ? "Booked occupancy is the basis for this stay date." : data.confidence.basis} />
          </ForecastCard>
          {onAccuracy && <ForecastAccuracyPreview metric="occupancy" snapshotAt={snapshotAt} title="Occupancy Forecast Accuracy" description="How close the occupancy model was on completed nights." onOpen={onAccuracy} />}
        </div>
      </div>
    </> : <ForecastCard title="No rate suggestions yet" description="Set an active room type with a base nightly rate to get suggestions." />}

    {data.outcomes.length > 0 && <ForecastCard title="Reviewed rate outcomes" description="Recent analytics proposals and the average frozen nightly rate on matching stays booked after approval.">
      <div className={styles.table} tabIndex={0} role="region" aria-label="Reviewed rate outcomes">
        <table><thead><tr><th>Stay date</th><th>Room type</th><th>Proposed rate</th><th>Status</th><th>Average booked rate</th><th>Room-nights</th></tr></thead>
          <tbody>{data.outcomes.map(row => <tr key={row.id}><th scope="row">{dateLabel(row.date)}</th><td>{row.roomType}</td>
            <td>{peso(row.proposedRate)}</td><td>{row.status}</td><td>{row.recordedAverage === null ? "—" : peso(row.recordedAverage)}</td><td>{row.recordedNights}</td></tr>)}</tbody>
        </table>
      </div>
    </ForecastCard>}
    {feedback && !open && <p className="pricing-feedback" role="status">{feedback}</p>}

    <Modal isOpen={open} onClose={() => setOpen(false)} title="Review predictive rate overlays" description="Fine-tune selected nightly rates. Submission creates pending proposals for Owner or Admin review." size="lg" className={styles.rateReview} showCloseButton={!submitting} closeOnEscape={!submitting} closeOnOverlayClick={!submitting} footer={<>
      <span className={styles.reviewCount}>{selected.size} of {reviewRows.length} selected</span>
      <button type="button" className="btn btn-soft" onClick={() => setOpen(false)} disabled={submitting}>Cancel</button>
      <button type="button" className="btn btn-accent" onClick={() => void submit()} disabled={submitting || selected.size === 0}>{submitting ? "Submitting…" : "Submit Proposal to Owner"}</button>
    </>}>
      <p className={styles.reviewScope}>Model {data.modelVersion}</p>
      <div className={styles.reviewRows}>
        {reviewRows.map((entry) => {
          const key = recommendationKey(entry);
          const checked = selected.has(key);
          return <article className={styles.reviewRow} key={key}>
            <label className={styles.reviewSelect}><input type="checkbox" checked={checked} disabled={submitting} onChange={() => toggle(key)} /><span><b>{entry.roomTypeName}</b><small>{dateLabel(entry.targetDate)}</small></span></label>
            <div>{peso(entry.baseRate)} base rate<small>Hotel {entry.projectedOccupancy}% {entry.occupancyBasis === "fact" ? "booked" : "expected"}</small></div>
            <div className={styles.reviewRate}><label htmlFor={`rate-${key}`}>Nightly rate for {entry.roomTypeName} on {dateLabel(entry.targetDate)} (₱)</label><input id={`rate-${key}`} type="number" min={entry.floorRate} max={entry.ceilingRate} step="0.01" value={rates[key] ?? ""} onChange={(event) => setRates((current) => ({ ...current, [key]: event.target.value }))} disabled={!checked || submitting} /><small>Allowed {peso(entry.floorRate)}–{peso(entry.ceilingRate)}</small></div>
          </article>;
        })}
      </div>
      {feedback && <p className={styles.reviewError} role="alert">{feedback}</p>}
    </Modal>
  </>;
}
