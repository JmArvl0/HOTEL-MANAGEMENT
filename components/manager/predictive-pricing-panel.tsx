"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, CircleDollarSign, RefreshCw, SlidersHorizontal, TrendingDown, TrendingUp } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import type { DynamicRateRecommendation } from "@/lib/analytics/dynamic-pricing";

type PricingResponse = {
  modelRunId: string | null;
  modelVersion: string;
  recommendations: DynamicRateRecommendation[];
  confidence: { level: "medium" | "limited"; basis: string };
};

const peso = (value: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);
const dateLabel = (value: string) => new Intl.DateTimeFormat("en-PH", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
const tierLabel = (tier: DynamicRateRecommendation["demandTier"]) => tier === "high" ? "High Demand Surge" : tier === "low" ? "Low Demand Discount" : "Standard Rate";
const recommendationKey = (entry: Pick<DynamicRateRecommendation, "roomTypeId" | "targetDate">) => `${entry.roomTypeId}:${entry.targetDate}`;

export default function PredictivePricingPanel() {
  const [data, setData] = useState<PricingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rates, setRates] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/analytics/pricing-recommendations", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Unable to load pricing recommendations.");
      const raw = body.data as Partial<PricingResponse>;
      if (!Array.isArray(raw.recommendations)) throw new Error("Pricing recommendations are unavailable in this response.");
      const next: PricingResponse = {
        modelRunId: raw.modelRunId ?? null,
        modelVersion: raw.modelVersion ?? "dynamic-pricing-v1",
        recommendations: raw.recommendations,
        confidence: raw.confidence ?? { level: "limited", basis: "Forecast confidence is unavailable." },
      };
      setData(next);
      setRates(Object.fromEntries(next.recommendations.map((entry) => [recommendationKey(entry), entry.recommendedRate.toFixed(2)])));
      setSelected(new Set(next.recommendations.map(recommendationKey)));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load pricing recommendations.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const featured = useMemo(() => [...(data?.recommendations ?? [])]
    .sort((a, b) => Math.abs(b.percentageChange) - Math.abs(a.percentageChange) || a.roomTypeName.localeCompare(b.roomTypeName) || a.targetDate.localeCompare(b.targetDate))
    .slice(0, 3), [data]);

  const toggle = (key: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const submit = async () => {
    if (!data?.modelRunId || selected.size === 0 || submitting) return;
    const recommendations = data.recommendations.filter((entry) => selected.has(recommendationKey(entry))).map((entry) => ({
      roomTypeId: entry.roomTypeId,
      targetDate: entry.targetDate,
      nightlyRate: Number(rates[recommendationKey(entry)]),
    }));
    if (recommendations.some((entry) => !Number.isFinite(entry.nightlyRate))) {
      setFeedback("Enter a valid nightly rate for every selected recommendation.");
      return;
    }
    setSubmitting(true);
    setFeedback("");
    try {
      const response = await fetch("/api/analytics/pricing-recommendations/propose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelRunId: data.modelRunId, recommendations }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Unable to submit the rate proposal.");
      setOpen(false);
      setFeedback(`${body.data?.submitted ?? recommendations.length} rate proposal${recommendations.length === 1 ? "" : "s"} sent to Owner/Admin review. Live rates are unchanged.`);
    } catch (caught) {
      setFeedback(caught instanceof Error ? caught.message : "Unable to submit the rate proposal.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <aside className="pricing-workspace pricing-workspace-loading" role="status" aria-label="Loading predictive pricing"><span className="pricing-skeleton" /><span className="pricing-skeleton short" /><span className="pricing-skeleton card" /></aside>;
  if (error) return <aside className="pricing-workspace pricing-workspace-error" role="alert"><CircleDollarSign size={20} /><h4>Pricing outlook unavailable</h4><p>{error}</p><button type="button" className="btn btn-soft btn-sm" onClick={() => void load()}><RefreshCw size={14} /> Try again</button></aside>;
  if (!data) return null;

  return <>
    <aside className="pricing-workspace" aria-labelledby="predictive-pricing-title">
      <header>
        <div><span className="insight-kind prediction">PREDICTION</span><h4 id="predictive-pricing-title">Rate opportunities</h4></div>
        <span className={`badge ${data.confidence.level === "limited" ? "pending" : "confirmed"}`}>{data.confidence.level} confidence</span>
      </header>
      <p className="pricing-intro">Advisory overlays based on occupancy, 48-hour booking pace, and day-of-week demand.</p>
      <div className="pricing-preview-list">
        {featured.map((entry) => <article className={`pricing-preview ${entry.demandTier}`} key={recommendationKey(entry)}>
          <div className="pricing-preview-heading">
            <div><b>{entry.roomTypeName}</b><small>{dateLabel(entry.targetDate)}</small></div>
            <span className={`demand-badge ${entry.demandTier}`}>{tierLabel(entry.demandTier)}</span>
          </div>
          <div className="pricing-values">
            <span><small><span className="insight-kind fact">FACT</span> Base rate</small><b>{peso(entry.baseRate)}</b></span>
            <ArrowRight size={15} aria-hidden="true" />
            <span><small>Recommended</small><b>{peso(entry.recommendedRate)}</b></span>
            <span className={`pricing-change ${entry.percentageChange < 0 ? "down" : "up"}`}>{entry.percentageChange < 0 ? <TrendingDown size={13} /> : <TrendingUp size={13} />}{entry.percentageChange > 0 ? "+" : ""}{entry.percentageChange}%</span>
          </div>
          <p>{entry.reasoning}</p>
        </article>)}
      </div>
      <p className="pricing-confidence-note">{data.confidence.basis}</p>
      {!data.modelRunId && <p className="pricing-run-warning">Refresh predictions to record a model snapshot before proposing rates.</p>}
      <button type="button" className="btn btn-accent pricing-review-button" onClick={() => setOpen(true)} disabled={!data.modelRunId || data.recommendations.length === 0}><SlidersHorizontal size={15} /> Review &amp; Propose Rate Overlay</button>
    </aside>

    {feedback && <p className="pricing-feedback" role="status">{feedback}</p>}

    <Modal isOpen={open} onClose={() => setOpen(false)} title="Review predictive rate overlays" description="Fine-tune selected nightly rates. Submission creates pending proposals for Owner/Admin review; it does not change live pricing." size="xl" headerVariant="branded" className="pricing-overlay" portal footer={<>
      <span className="pricing-selection-count">{selected.size} of {data.recommendations.length} selected</span>
      <button type="button" className="btn btn-soft" onClick={() => setOpen(false)} disabled={submitting}>Cancel</button>
      <button type="button" className="btn btn-accent" onClick={() => void submit()} disabled={submitting || selected.size === 0}>{submitting ? "Submitting…" : "Submit Proposal to Owner"}</button>
    </>}>
      <div className="pricing-modal-summary"><span className="insight-kind fact">FACT</span><span>Base rates and configured bounds</span><span className="insight-kind prediction">PREDICTION</span><span>Occupancy and recommended adjustment</span></div>
      <div className="pricing-editor-list">
        {data.recommendations.map((entry) => {
          const key = recommendationKey(entry);
          const checked = selected.has(key);
          return <article className={`pricing-editor-row ${checked ? "selected" : ""}`} key={key}>
            <label className="pricing-select"><input type="checkbox" checked={checked} onChange={() => toggle(key)} /><span><Check size={13} /></span><b>{entry.roomTypeName}</b><small>{dateLabel(entry.targetDate)}</small></label>
            <div className="pricing-editor-context"><span className={`demand-badge ${entry.demandTier}`}>{tierLabel(entry.demandTier)}</span><small>{entry.projectedOccupancy}% occupancy · {entry.bookingPace >= 0 ? "+" : ""}{entry.bookingPace} net pickup</small></div>
            <div className="pricing-rate-field"><label htmlFor={`rate-${key}`}>Nightly rate for {entry.roomTypeName} on {dateLabel(entry.targetDate)}</label><div><span>₱</span><input id={`rate-${key}`} type="number" min={entry.floorRate} max={entry.ceilingRate} step="0.01" value={rates[key] ?? ""} onChange={(event) => setRates((current) => ({ ...current, [key]: event.target.value }))} disabled={!checked} /></div><small>Allowed {peso(entry.floorRate)}–{peso(entry.ceilingRate)}</small></div>
          </article>;
        })}
      </div>
      {feedback && <p className="pricing-modal-feedback" role="alert">{feedback}</p>}
    </Modal>
  </>;
}
