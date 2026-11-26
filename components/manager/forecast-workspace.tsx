import { useId, type ReactNode } from "react";
import { Area, Bar, CartesianGrid, ComposedChart, ReferenceArea, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, BedDouble, Boxes, CalendarDays, CalendarRange, ChartNoAxesCombined, CircleHelp, Target, TrendingUp, Wrench, type LucideIcon } from "lucide-react";
import styles from "./forecast-workspace.module.css";

export const FORECAST_TABS = [
  { key: "occupancy", label: "Occupancy Forecast", icon: BedDouble },
  { key: "rates", label: "Demand & Rate Forecast", icon: TrendingUp },
  { key: "housekeeping", label: "Housekeeping Workload", icon: Activity },
  { key: "inventory", label: "Inventory Consumption", icon: Boxes },
  { key: "maintenance", label: "Recurring Maintenance Risk", icon: Wrench },
  { key: "seasonal", label: "Seasonal Outlook", icon: CalendarRange },
  { key: "evaluation", label: "Forecast Accuracy", icon: ChartNoAxesCombined }
] as const;
export type ForecastTab = (typeof FORECAST_TABS)[number]["key"];

export const forecastDay = (value: string) => new Intl.DateTimeFormat("en-PH", {
  month: "short", day: "numeric", timeZone: "UTC"
}).format(new Date(`${value}T00:00:00Z`));

export const forecastPeriod = (from?: string, through?: string) => {
  if (!from || !through) return "No forecast dates";
  return from === through ? forecastDay(from) : `${forecastDay(from)} – ${forecastDay(through)}`;
};

export function ForecastHeader({ title, description, period, children, view = "rates" }: {
  title: string; description: string; period: string; children?: ReactNode; view?: ForecastTab;
}) {
  const Icon = FORECAST_TABS.find(tab => tab.key === view)?.icon ?? Activity;
  return <header className={styles.header} data-view={view}>
    <span className={styles.headingIcon}><Icon size={27} aria-hidden="true" /></span>
    <div><h2>{title}</h2><p>{description}</p></div>
    <div className={styles.controls}>
      <span className={styles.period}><CalendarDays size={16} aria-hidden="true" />{period}</span>
      {children}
    </div>
  </header>;
}

export function ForecastMetrics({ metrics }: {
  metrics: { label: string; value: ReactNode; detail: string; icon?: LucideIcon }[];
}) {
  return <dl className={styles.metrics}>{metrics.map(({ label, value, detail, icon: Icon = Activity }) => <div key={label}>
    <dt><span><Icon size={19} aria-hidden="true" /></span>{label}</dt><dd>{value}</dd><dd>{detail}</dd>
  </div>)}</dl>;
}

export function ForecastCard({ title, description, children, emphasis = false }: {
  title: string; description?: string; children?: ReactNode; emphasis?: boolean;
}) {
  return <section className={emphasis ? `${styles.card} ${styles.emphasis}` : styles.card}>
    <h3>{title}</h3>{description && <p className={styles.description}>{description}</p>}
    {children}
  </section>;
}

export function ForecastQuality({ label = "Data quality", value, basis }: { label?: string; value: string; basis: string }) {
  return <details className={styles.quality}>
    <summary><Target size={15} aria-hidden="true" />{label} <strong>{value}</strong><CircleHelp size={14} aria-hidden="true" /></summary>
    <p>{basis}</p>
  </details>;
}

type TimelinePoint = { date: string; actual?: number | null; expected?: number | null; booked?: number | null };

export function ForecastTooltip({ active, label, payload = [], units, risk = false }: {
  active?: boolean;
  label?: unknown;
  payload?: readonly { name?: unknown; value?: unknown; dataKey?: unknown }[];
  units: string | ((name: string, value: number) => string);
  risk?: boolean;
}) {
  if (!active || typeof label !== "string") return null;
  const date = new Date(`${label}T00:00:00Z`);
  const heading = Number.isNaN(date.getTime()) ? label : new Intl.DateTimeFormat("en-PH", {
    weekday: "short", month: "short", day: "numeric", timeZone: "UTC"
  }).format(date);
  return <div className={styles.tooltip}>
    <strong>{heading}</strong>
    <dl>{payload.filter(row => typeof row.value === "number").map(row => {
      const name = String(row.name ?? row.dataKey);
      const value = Number(row.value);
      const key = String(row.dataKey);
      const series = risk ? "risk"
        : ["booked", "suggested"].includes(key) ? "rate"
          : ["expected", "baseline"].includes(key) ? "expected"
            : key === "estimatedLaborHours" ? "hours" : "actual";
      return <div key={key}>
        <dt><i data-series={series} aria-hidden="true" />{name}</dt>
        <dd>{typeof units === "function" ? units(name, value) : `${value}${units === "%" ? units : ` ${units}`}`}</dd>
      </div>;
    })}</dl>
  </div>;
}

export function ForecastTimeline({ data, actualLabel, expectedLabel, unit, today, maximum, focusDate, risk = false, animated = false }: {
  data: TimelinePoint[]; actualLabel: string; expectedLabel?: string; unit: string; today?: string; maximum?: number;
  focusDate?: string; risk?: boolean; animated?: boolean;
}) {
  const fillId = useId();
  const hasActual = data.some(point => point.actual != null);
  const hasExpected = data.some(point => point.expected != null);
  const hasBooked = data.some(point => point.booked != null);
  const focus = focusDate ? data.find(point => point.date === focusDate) : undefined;
  const actualColor = risk ? "var(--danger-fg)" : "var(--forecast-actual)";
  if (!hasActual && !hasExpected && !hasBooked) return <p className={styles.unavailable}>There are no recorded values for this chart yet.</p>;
  return <div className={styles.chart}>
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} accessibilityLayer margin={{ top: 22, right: 16 }}>
        <defs>
          <linearGradient id={`${fillId}-actual`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={actualColor} stopOpacity={0.28} />
            <stop offset="100%" stopColor={actualColor} stopOpacity={0.025} />
          </linearGradient>
          <linearGradient id={`${fillId}-expected`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--forecast-projection)" stopOpacity={0.26} />
            <stop offset="100%" stopColor="var(--forecast-projection)" stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--forecast-grid)" strokeDasharray="3 4" vertical={false} />
        <XAxis dataKey="date" tickFormatter={forecastDay} axisLine={false} tickLine={false} minTickGap={20} />
        <YAxis domain={[0, maximum ?? "auto"]} unit={unit === "%" ? "%" : undefined} allowDecimals={unit !== "orders"} axisLine={false} tickLine={false} width={44} tickCount={5} />
        <Tooltip cursor={{ stroke: "var(--forecast-cursor)", strokeDasharray: "4 4" }}
          content={props => <ForecastTooltip {...props} units={unit} risk={risk} />} />
        {today && hasExpected && <ReferenceArea x1={today} x2={data.at(-1)?.date} fill="var(--forecast-projection)" fillOpacity={0.06} />}
        {hasBooked && <Bar dataKey="booked" name="Already booked" fill="var(--forecast-booked)" maxBarSize={16} isAnimationActive={animated} />}
        {hasActual && <Area type={risk ? "linear" : "monotone"} dataKey="actual" name={actualLabel} stroke={actualColor} fill={`url(#${fillId}-actual)`} strokeWidth={2.35}
          dot={{ r: 2.2, fill: actualColor, stroke: actualColor }}
          activeDot={{ r: 5, fill: actualColor, stroke: "var(--st-bg-surface)", strokeWidth: 2 }} isAnimationActive={animated} />}
        {hasExpected && <Area type="monotone" dataKey="expected" name={expectedLabel ?? "Forecast"} stroke="var(--forecast-projection)" strokeDasharray="5 4" fill={`url(#${fillId}-expected)`} strokeWidth={2.4}
          dot={{ r: 2.4, fill: "var(--st-bg-surface)", stroke: "var(--forecast-projection)" }}
          activeDot={{ r: 5, fill: "var(--forecast-projection)", stroke: "var(--st-bg-surface)", strokeWidth: 2 }} isAnimationActive={animated} />}
        {today && <ReferenceLine x={today} stroke="var(--st-text-secondary)" strokeDasharray="4 4" label={{ value: "Today", position: "insideTopLeft", fill: "var(--st-text-primary)", fontSize: 11 }} />}
        {focus?.expected != null && <ReferenceDot x={focus.date} y={focus.expected} r={5} fill="var(--forecast-projection)" stroke="var(--st-bg-surface)" strokeWidth={2} />}
      </ComposedChart>
    </ResponsiveContainer>
  </div>;
}

export function ForecastLegend({ items }: { items: { label: string; series: "actual" | "expected" | "booked" | "rate" | "hours" | "focus" }[] }) {
  return <div className={styles.legend}>{items.map(item => <span key={item.label}><i aria-hidden="true" data-series={item.series} />{item.label}</span>)}</div>;
}
