"use client";

import { useCallback, useEffect, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, BedDouble, Boxes, RefreshCw, Sparkles, Wrench } from "lucide-react";
import { usePrefersReducedMotion } from "@/lib/motion/reduced-motion";
import { TablePagination, sortTableRows, useTablePagination } from "@/components/ui/table-pagination";
import type { RiskLevel } from "@/lib/analytics/types";
import type { PredictionMetrics } from "@/lib/analytics/runner";

/**
 * Predictive Insights — the analytics engine's storefront. Every number on
 * this page is computed by HAVEN's own forecast models (lib/analytics); the
 * [Explain with AI] buttons send that same server-rebuilt output to Gemini
 * for interpretation. Gemini never produces figures, and the panel labels
 * what is booked fact versus predicted.
 */

type OccupancyDay = {
  date: string; totalRooms: number; knownOccupied: number; knownOccupancyPct: number;
  predictedOccupancyPct?: number; riskLevel: RiskLevel; dataQuality: string; basisObservations: number;
};
type HousekeepingDay = {
  date: string; checkoutCleans: number; stayoverServices: number; guestRequestTasks: number;
  inspections: number; totalTasks: number; workload: string; estimatedLaborHours?: number;
  meanTaskMinutes?: number; dataQuality: string; basisNote: string;
};
type InventoryRisk = {
  itemId: string; name: string; category: string; unit: string; currentStock: number; reorderPoint: number;
  predictedConsumption: number | null; projectedShortage: number | null; recommendedReorder: number | null;
  risk: RiskLevel; riskBasis: string; dataQuality: string; movementDays: number;
};
type MaintenanceRisk = {
  roomId: string; roomNumber: string; category: string; incidents90Days: number; openIncidents: number;
  daysSinceLast: number | null; trend: string; risk: RiskLevel; reason: string; suggestedAction: string; dataQuality: string;
};
type Metrics = PredictionMetrics | null;

type InsightsData = {
  generatedAt: string; lastSnapshotAt: string | null; snapshotCount: number; databaseMode: string;
  occupancy: { today: string; days: OccupancyDay[]; method: string; notes: string[] };
  housekeeping: { today: string; days: HousekeepingDay[]; method: string; notes: string[] };
  inventory: { today: string; items: InventoryRisk[]; shortageCount: number; method: string; notes: string[] };
  maintenance: { today: string; risks: MaintenanceRisk[]; elevatedCount: number; method: string; notes: string[] };
  metrics: Metrics;
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
  ? new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value))
  : "—";
const riskBadge = (risk: string) => `badge ${risk === "high" ? "cancelled" : risk === "medium" ? "pending" : "confirmed"}`;
const fmtMetric = (value: number | null | undefined, suffix: string) => typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(1)}${suffix}` : "—";

function ExplainButton({ type, onExplain, busy }: { type: string; onExplain: (type: string) => void; busy: boolean }) {
  return (
    <button type="button" className="btn btn-soft btn-sm" onClick={() => onExplain(type)} disabled={busy}>
      <Sparkles size={14} /> Explain with AI
    </button>
  );
}

function ExplanationCard({ explanation, onClose }: { explanation: Explanation; onClose: () => void }) {
  return (
    <div className="ai-explanation" role="article">
      <header>
        <Sparkles size={15} aria-hidden />
        <b>AI interpretation</b>
        <button type="button" onClick={onClose} aria-label="Close AI interpretation">×</button>
      </header>
      <p>{explanation.explanation}</p>
      <ul>{explanation.key_factors.map((factor) => <li key={factor}>{factor}</li>)}</ul>
      <small>{explanation.data_quality_note}</small>
      <footer>{AI_DISCLOSURE}</footer>
    </div>
  );
}

export default function PredictiveInsightsPanel() {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [explanation, setExplanation] = useState<{ type: string; data: Explanation } | null>(null);
  const [explaining, setExplaining] = useState(false);
  // Motion policy: chart draw-in off under prefers-reduced-motion (docs/ui-motion-guidelines.md).
  const chartAnimated = !usePrefersReducedMotion();

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch("/api/analytics/insights", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Unable to load predictions.");
      setData(body.data);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load predictions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    setToast("");
    try {
      const response = await fetch("/api/analytics/generate", { method: "POST" });
      const body = await response.json();
      setToast(response.ok ? "Predictions refreshed and snapshot recorded." : body?.error ?? "Unable to refresh predictions.");
      if (response.ok) await load(true);
    } catch {
      setToast("Unable to reach HAVEN.");
    } finally {
      setRefreshing(false);
    }
  };

  const explain = async (type: string) => {
    if (explaining) return;
    setExplaining(true);
    setExplanation(null);
    try {
      const response = await fetch("/api/ai/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type })
      });
      const body = await response.json();
      if (response.ok && body.data) setExplanation({ type, data: body.data });
      else setToast(body?.message ?? body?.error ?? "AI interpretation is unavailable right now.");
    } catch {
      setToast("AI interpretation is unavailable right now.");
    } finally {
      setExplaining(false);
    }
  };

  const housekeepingRows = data?.housekeeping.days ?? [];
  const inventoryRows = sortTableRows(data?.inventory.items.filter((item) => item.risk !== "low") ?? [], (item) => item.name);
  const housekeepingPage = useTablePagination(housekeepingRows);
  const inventoryPage = useTablePagination(inventoryRows);

  if (loading) return <div className="empty"><h3>Loading predictions…</h3></div>;
  if (error) return <div className="empty"><h3>Predictions unavailable</h3><p>{error}</p></div>;
  if (!data) return null;

  const tomorrow = (days: { date: string }[]) => days[1] ?? days[0];
  const occupancyTomorrow = tomorrow(data.occupancy.days) as OccupancyDay;
  const housekeepingTomorrow = tomorrow(data.housekeeping.days) as HousekeepingDay;
  const chartData = data.occupancy.days.map((day) => ({
    day: fmtDay(day.date),
    "Booked (fact)": Math.round(day.knownOccupancyPct),
    ...(day.predictedOccupancyPct !== undefined ? { "Predicted": Math.round(day.predictedOccupancyPct) } : {})
  }));
  const riskyItems = inventoryRows;

  return (
    <>
      <div className="page-title">
        <div>
          <p className="eyebrow">Predictive analytics</p>
          <h1>What is coming this week?</h1>
          <p>HAVEN&apos;s own forecast models — occupancy, housekeeping workload, inventory demand and maintenance risk — computed from live operational data.</p>
        </div>
        <button type="button" className="btn btn-accent" onClick={refresh} disabled={refreshing}>
          <RefreshCw size={16} /> {refreshing ? "Refreshing…" : "Refresh predictions"}
        </button>
      </div>

      {toast && <p className="insights-toast" role="status">{toast}</p>}

      <div className="metric-grid">
        <article className="metric-card">
          <div>
            <span>Occupancy tomorrow</span>
            <b>{occupancyTomorrow.knownOccupancyPct}% booked</b>
            <small>
              {occupancyTomorrow.predictedOccupancyPct !== undefined
                ? `Predicted final ${occupancyTomorrow.predictedOccupancyPct}% · ${occupancyTomorrow.basisObservations} observations`
                : "No pickup prediction yet — booked rooms only"}
            </small>
          </div>
          <i><BedDouble size={21} /></i>
        </article>
        <article className="metric-card">
          <div>
            <span>Housekeeping tomorrow</span>
            <b>{housekeepingTomorrow.totalTasks} tasks</b>
            <small>
              {label(housekeepingTomorrow.workload)} workload · {housekeepingTomorrow.checkoutCleans} checkout cleans · {housekeepingTomorrow.stayoverServices} stayovers
              {housekeepingTomorrow.estimatedLaborHours !== undefined ? ` · ~${housekeepingTomorrow.estimatedLaborHours}h labor` : ""}
            </small>
          </div>
          <i><Activity size={21} /></i>
        </article>
        <article className="metric-card">
          <div>
            <span>Inventory shortage risk</span>
            <b>{data.inventory.shortageCount} item{data.inventory.shortageCount !== 1 ? "s" : ""}</b>
            <small>{data.inventory.items.filter((item) => item.predictedConsumption === null).length} items without consumption history — not yet predictable</small>
          </div>
          <i><Boxes size={21} /></i>
        </article>
        <article className="metric-card">
          <div>
            <span>Recurring maintenance risk</span>
            <b>{data.maintenance.elevatedCount} elevated</b>
            <small>Rooms with repeated work orders in the last 90 days</small>
          </div>
          <i><Wrench size={21} /></i>
        </article>
      </div>

      <article className="panel">
        <div className="panel-heading">
          <div>
            <h3>7-day occupancy outlook</h3>
            <p>{data.occupancy.method}</p>
          </div>
          <ExplainButton type="occupancy" onExplain={explain} busy={explaining} />
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line, #e8e7e2)" />
            <XAxis dataKey="day" axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} axisLine={false} tickLine={false} unit="%" width={44} />
            <Tooltip />
            <Legend />
            <Bar dataKey="Booked (fact)" fill="#176773" radius={[3, 3, 0, 0]} maxBarSize={38} isAnimationActive={chartAnimated} />
            <Line type="monotone" dataKey="Predicted" stroke="#b8860b" strokeWidth={2.5} strokeDasharray="6 4" dot={{ r: 3 }} connectNulls isAnimationActive={chartAnimated} />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="snapshot-hint">
          Solid bars are booked rooms — fact. The dashed line is the predicted final occupancy, shown only where enough
          pickup history exists. {data.occupancy.notes.join(" ")}
        </p>
        {explanation?.type === "occupancy" && <ExplanationCard explanation={explanation.data} onClose={() => setExplanation(null)} />}
      </article>

      <article className="panel">
        <div className="panel-heading">
          <div>
            <h3>Housekeeping workload forecast</h3>
            <p>{data.housekeeping.method}</p>
          </div>
          <ExplainButton type="housekeeping" onExplain={explain} busy={explaining} />
        </div>
        <div className="table-scroll">
          <table aria-label="Housekeeping workload forecast">
            <thead>
              <tr><th>Day</th><th>Checkout cleans</th><th>Stayover services</th><th>Guest requests</th><th>Inspections</th><th>Total</th><th>Workload</th><th>Est. labor</th><th>Basis</th></tr>
            </thead>
            <tbody>
              {housekeepingPage.rows.map((day) => (
                <tr key={day.date}>
                  <td>{fmtDay(day.date)}</td>
                  <td>{day.checkoutCleans}</td>
                  <td>{day.stayoverServices}</td>
                  <td>{day.guestRequestTasks}</td>
                  <td>{day.inspections}</td>
                  <td><b>{day.totalTasks}</b></td>
                  <td><span className={`badge ${day.workload === "high" ? "cancelled" : day.workload === "medium" ? "pending" : "confirmed"}`}>{label(day.workload)}</span></td>
                  <td>{day.estimatedLaborHours !== undefined ? `${day.estimatedLaborHours}h` : "—"}</td>
                  <td><small>{day.basisNote}</small></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TablePagination {...housekeepingPage} onPageChange={housekeepingPage.setPage} noun="forecast days" note="Calendar order retained for forecast interpretation." />
        {explanation?.type === "housekeeping" && <ExplanationCard explanation={explanation.data} onClose={() => setExplanation(null)} />}
      </article>

      <article className="panel">
        <div className="panel-heading">
          <div>
            <h3>Inventory demand forecast</h3>
            <p>{data.inventory.method}</p>
          </div>
          <ExplainButton type="inventory" onExplain={explain} busy={explaining} />
        </div>
        {riskyItems.length === 0 ? (
          <p className="snapshot-hint">No items are predicted to run short in the next three days.</p>
        ) : (
          <div className="table-scroll">
            <table aria-label="Inventory shortage forecast">
              <thead>
                <tr><th>Item</th><th>In stock</th><th>Reorder at</th><th>Predicted 3-day use</th><th>Projected shortage</th><th>Reorder now</th><th>Risk</th><th>Basis</th></tr>
              </thead>
              <tbody>
                {inventoryPage.rows.map((item) => (
                  <tr key={item.itemId}>
                    <td><b>{item.name}</b><small> {item.unit}</small></td>
                    <td>{item.currentStock}</td>
                    <td>{item.reorderPoint}</td>
                    <td>{item.predictedConsumption ?? "—"}</td>
                    <td>{item.projectedShortage !== null && item.projectedShortage > 0 ? <b>{item.projectedShortage}</b> : "—"}</td>
                    <td>{item.recommendedReorder ?? "—"}</td>
                    <td><span className={riskBadge(item.risk)}>{label(item.risk)}</span></td>
                    <td><small>{item.movementDays >= 7 ? `${item.movementDays} days of movement history` : `only ${item.movementDays} days of history — not yet predictable`}</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {riskyItems.length > 0 && <TablePagination {...inventoryPage} onPageChange={inventoryPage.setPage} noun="at-risk items" note="Alphabetical by inventory item." />}
        <p className="snapshot-hint">Forecasts use recorded consumption history; items without history are flagged rather than guessed. {data.inventory.notes.join(" ")}</p>
        {explanation?.type === "inventory" && <ExplanationCard explanation={explanation.data} onClose={() => setExplanation(null)} />}
      </article>

      <article className="panel">
        <div className="panel-heading">
          <div>
            <h3>Recurring maintenance risk</h3>
            <p>{data.maintenance.method}</p>
          </div>
          <ExplainButton type="maintenance" onExplain={explain} busy={explaining} />
        </div>
        {data.maintenance.risks.length === 0 ? (
          <p className="snapshot-hint">No rooms show recurring work-order patterns in the last 90 days.</p>
        ) : (
          <div className="maintenance-risk-grid">
            {data.maintenance.risks.map((risk) => (
              <div className="maintenance-risk-card" key={`${risk.roomId}:${risk.category}`}>
                <header>
                  <b>Room {risk.roomNumber}</b>
                  <span className={riskBadge(risk.risk)}>{label(risk.risk)} risk</span>
                </header>
                <p className="maintenance-risk-category">{label(risk.category)}</p>
                <p>{risk.reason}</p>
                <small>{risk.suggestedAction}{risk.openIncidents > 0 ? ` · ${risk.openIncidents} open now` : ""}</small>
              </div>
            ))}
          </div>
        )}
        <p className="snapshot-hint">Risk reflects repeat-incidence patterns — it is not a failure probability. {data.maintenance.notes.join(" ")}</p>
        {explanation?.type === "maintenance" && <ExplanationCard explanation={explanation.data} onClose={() => setExplanation(null)} />}
      </article>

      <article className="panel">
        <div className="panel-heading">
          <div>
            <h3>Prediction performance</h3>
            <p>How yesterday&apos;s predictions compared with what actually happened.</p>
          </div>
        </div>
        {data.metrics ? (
          <>
            <ul className="snapshot-list">
              <li><span>Occupancy — mean absolute error</span><b>{fmtMetric(data.metrics.occupancy.mae, " rooms")}</b></li>
              <li><span>Occupancy — mean absolute % error</span><b>{fmtMetric(data.metrics.occupancy.mape, "%")}</b></li>
              <li><span>Occupancy predictions evaluated</span><b>{data.metrics.occupancy.observations}</b></li>
              <li><span>Housekeeping — mean absolute error</span><b>{fmtMetric(data.metrics.housekeeping.mae, " tasks")}</b></li>
              <li><span>Housekeeping predictions evaluated</span><b>{data.metrics.housekeeping.observations}</b></li>
              <li><span>Inventory — mean absolute error</span><b>{fmtMetric(data.metrics.inventory.mae, " units")}</b></li>
              <li><span>Inventory predictions evaluated</span><b>{data.metrics.inventory.observations}</b></li>
            </ul>
            <p className="snapshot-hint">{data.metrics.methodNote}</p>
          </>
        ) : (
          <p className="snapshot-hint">Prediction accuracy is computed from stored snapshots. The daily 02:35 AM snapshot run builds this history — metrics appear after the first snapshots have target dates in the past.</p>
        )}
        <p className="snapshot-hint">
          Last snapshot {fmtStamp(data.lastSnapshotAt)} · {data.snapshotCount} run{data.snapshotCount !== 1 ? "s" : ""} recorded ·
          live forecasts computed {fmtStamp(data.generatedAt)} · {data.databaseMode === "demo" ? "demo data" : "live data"}
        </p>
      </article>
    </>
  );
}
