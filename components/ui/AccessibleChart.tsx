"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import {
  LineChart as RechartsLineChart,
  Line,
  AreaChart as RechartsAreaChart,
  Area,
  BarChart as RechartsBarChart,
  Bar,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";


export interface ChartDataPoint {
  [key: string]: string | number | Date;
}

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  type?: "line" | "area" | "bar";
}

export interface AccessibleChartProps {
  data: ChartDataPoint[];
  xKey: string;
  series: ChartSeries[];
  chartType?: "line" | "area" | "bar" | "pie";
  title: string;
  description?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  width?: number | string;
  height?: number | string;
  showGrid?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  animate?: boolean;
  className?: string;
  onDataPointClick?: (dataPoint: ChartDataPoint, seriesKey: string) => void;
  referenceLines?: { value: number; label: string; color: string }[];
}

export function AccessibleChart({
  data,
  xKey,
  series,
  chartType = "line",
  title,
  description,
  xAxisLabel,
  yAxisLabel,
  width = "100%",
  height = 300,
  showGrid = true,
  showLegend = true,
  showTooltip = true,
  animate = true,
  className = "",
  onDataPointClick,
  referenceLines = [],
}: AccessibleChartProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [focusedSeries, setFocusedSeries] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Generate accessible data table for screen readers
  const tableData = useMemo<Record<string, React.ReactNode>[]>(() => {
    if (chartType === "pie") {
      return data.map((point) => ({
        label: String(point[xKey]),
        value: Number(point[series[0].key]),
      }));
    }
    return data.map((point): Record<string, React.ReactNode> => ({
      xValue: String(point[xKey]),
      ...Object.fromEntries(
        series.map((s) => [s.label, point[s.key]])
      ),
    }));
  }, [data, xKey, series, chartType]);

  const tableHeaders = useMemo(() => {
    if (chartType === "pie") {
      return ["Category", "Value"];
    }
    return [xAxisLabel || xKey, ...series.map((s) => s.label)];
  }, [xAxisLabel, xKey, series, chartType]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!data.length) return;

    const maxIndex = data.length - 1;
    const maxSeriesIndex = series.length - 1;

    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        if (focusedSeries && series.length > 1) {
          const currentSeriesIndex = series.findIndex((s) => s.key === focusedSeries);
          if (currentSeriesIndex < maxSeriesIndex) {
            setFocusedSeries(series[currentSeriesIndex + 1].key);
          }
        } else if (focusedIndex < maxIndex) {
          setFocusedIndex(focusedIndex + 1);
        }
        break;
      case "ArrowLeft":
        event.preventDefault();
        if (focusedSeries && series.length > 1) {
          const currentSeriesIndex = series.findIndex((s) => s.key === focusedSeries);
          if (currentSeriesIndex > 0) {
            setFocusedSeries(series[currentSeriesIndex - 1].key);
          }
        } else if (focusedIndex > 0) {
          setFocusedIndex(focusedIndex - 1);
        }
        break;
      case "ArrowUp":
        event.preventDefault();
        if (series.length > 1 && !focusedSeries) {
          setFocusedSeries(series[0].key);
        }
        break;
      case "ArrowDown":
        event.preventDefault();
        if (series.length > 1 && focusedSeries) {
          setFocusedSeries(null);
        }
        break;
      case "Home":
        event.preventDefault();
        setFocusedIndex(0);
        setFocusedSeries(null);
        break;
      case "End":
        event.preventDefault();
        setFocusedIndex(maxIndex);
        setFocusedSeries(null);
        break;
      case "Escape":
        event.preventDefault();
        setFocusedIndex(-1);
        setFocusedSeries(null);
        break;
    }
  };

  const handleDataPointClick = (dataPoint: ChartDataPoint, seriesKey: string) => {
    onDataPointClick?.(dataPoint, seriesKey);
  };

  const getChartDescription = () => {
    if (description) return description;
    
    const dataPoints = data.length;
    const seriesCount = series.length;
    const typeLabel = chartType.charAt(0).toUpperCase() + chartType.slice(1);
    
    if (chartType === "pie") {
      const total = data.reduce((sum, point) => sum + Number(point[series[0].key]), 0);
      return `${typeLabel} chart showing ${dataPoints} categories. Total: ${total.toLocaleString()}.`;
    }
    
    return `${typeLabel} chart with ${seriesCount} series and ${dataPoints} data points.`;
  };

  // Render the appropriate chart type
  const renderChart = () => {
    const commonProps = {
      data,
      width: typeof width === "number" ? width : undefined,
      height: typeof height === "number" ? height : undefined,
      animate,
    };

    // recharts series onClick shapes differ per component; normalize to the target node.
    const seriesClick = (key: string) => (e: unknown) => {
      const target = (e as { target?: EventTarget & { __data__?: ChartDataPoint } }).target;
      handleDataPointClick(target?.__data__ as ChartDataPoint, key);
    };

    switch (chartType) {
      case "area":
        return (
          <RechartsAreaChart {...commonProps}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" vertical={false} />}
            <XAxis
              dataKey={xKey}
              tick={{ fontSize: 11 }}
              label={{ value: xAxisLabel || xKey, position: "insideBottom", offset: -10, fontSize: 11 }}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              label={{ value: yAxisLabel || "Value", angle: -90, position: "insideLeft", offset: 10, fontSize: 11 }}
            />
            {showTooltip && <Tooltip formatter={(value: number) => [value.toLocaleString(), ""]} />}
            {showLegend && <Legend />}
            {referenceLines.map((ref, index) => (
              <ReferenceLine key={index} y={ref.value} label={{ value: ref.label, position: "insideLeft" }} stroke={ref.color} strokeDasharray="5 5" />
            ))}
            {series.map((s, index) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                fill={s.color}
                fillOpacity={0.3}
                strokeWidth={2}
                onClick={seriesClick(s.key)}
              />
            ))}
          </RechartsAreaChart>
        );

      case "bar":
        return (
          <RechartsBarChart {...commonProps} layout="vertical">
            {showGrid && <CartesianGrid strokeDasharray="3 3" horizontal={false} />}
            <YAxis
              type="category"
              dataKey={xKey}
              tick={{ fontSize: 11 }}
              width={80}
            />
            <XAxis
              tick={{ fontSize: 11 }}
              label={{ value: yAxisLabel || "Value", position: "insideBottom", offset: -10, fontSize: 11 }}
            />
            {showTooltip && <Tooltip formatter={(value: number) => [value.toLocaleString(), ""]} />}
            {showLegend && <Legend />}
            {series.map((s, index) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                fill={s.color}
                radius={[4, 4, 0, 0]}
                onClick={seriesClick(s.key)}
              />
            ))}
          </RechartsBarChart>
        );

      case "pie":
        return (
          <RechartsPieChart {...commonProps}>
            {showTooltip && <Tooltip formatter={(value: number) => [value.toLocaleString(), ""]} />}
            {showLegend && <Legend />}
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              dataKey={series[0].key}
              nameKey={xKey}
              label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
              labelLine={false}
              onClick={seriesClick(series[0].key)}
            >
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={series[0].color} />
              ))}
            </Pie>
          </RechartsPieChart>
        );

      default: // line
        return (
          <RechartsLineChart {...commonProps}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" vertical={false} />}
            <XAxis
              dataKey={xKey}
              tick={{ fontSize: 11 }}
              label={{ value: xAxisLabel || xKey, position: "insideBottom", offset: -10, fontSize: 11 }}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              label={{ value: yAxisLabel || "Value", angle: -90, position: "insideLeft", offset: 10, fontSize: 11 }}
            />
            {showTooltip && <Tooltip formatter={(value: number) => [value.toLocaleString(), ""]} />}
            {showLegend && <Legend />}
            {referenceLines.map((ref, index) => (
              <ReferenceLine key={index} y={ref.value} label={{ value: ref.label, position: "insideLeft" }} stroke={ref.color} strokeDasharray="5 5" />
            ))}
            {series.map((s, index) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 6, fill: s.color }}
                onClick={seriesClick(s.key)}
              />
            ))}
          </RechartsLineChart>
        );
    }
  };

  return (
    <div
      ref={containerRef}
      className={`accessible-chart ${className}`}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      role="region"
      aria-label={title}
      aria-roledescription="chart"
    >
      <div className="chart-header">
        <h3 className="chart-title">{title}</h3>
        {description && <p className="chart-description">{description}</p>}
      </div>

      <div className="chart-container" style={{ width, height }}>
        <ResponsiveContainer width="100%" height="100%">
          {renderChart()}
        </ResponsiveContainer>
      </div>

      {/* Accessible Data Table - hidden visually but available to screen readers */}
      <VisuallyHidden>
        <table className="chart-data-table" aria-label={`${title} data table`}>
          <caption>{title} - Data Table</caption>
          <thead>
            <tr>
              {tableHeaders.map((header, index) => (
                <th key={index} scope="col">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableData.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {tableHeaders.map((header, colIndex) => (
                  <td key={colIndex}>
                    {chartType === "pie"
                      ? colIndex === 0
                        ? row.label
                        : row.value
                      : colIndex === 0
                        ? row.xValue
                        : row[header] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="chart-summary" aria-live="polite">
          {getChartDescription()}
        </p>
      </VisuallyHidden>

      {/* Keyboard navigation hint */}
      <div className="chart-keyboard-hint" aria-hidden="true">
        <kbd>Tab</kbd> to focus, <kbd>Arrow keys</kbd> to navigate data points, <kbd>Enter</kbd> to select
      </div>
    </div>
  );
}

// Specific chart components for convenience
export interface LineChartProps extends Omit<AccessibleChartProps, "chartType"> {
  chartType?: "line";
}

export function LineChart(props: LineChartProps) {
  return <AccessibleChart {...props} chartType="line" />;
}

export interface AreaChartProps extends Omit<AccessibleChartProps, "chartType"> {
  chartType?: "area";
}

export function AreaChart(props: AreaChartProps) {
  return <AccessibleChart {...props} chartType="area" />;
}

export interface BarChartProps extends Omit<AccessibleChartProps, "chartType"> {
  chartType?: "bar";
}

export function BarChart(props: BarChartProps) {
  return <AccessibleChart {...props} chartType="bar" />;
}

export interface PieChartProps extends Omit<AccessibleChartProps, "chartType"> {
  chartType?: "pie";
}

export function PieChart(props: PieChartProps) {
  return <AccessibleChart {...props} chartType="pie" />;
}

export interface VisuallyHiddenProps {
  children: React.ReactNode;
}

export function VisuallyHidden({ children }: VisuallyHiddenProps) {
  return (
    <div
      style={{
        position: "absolute",
        width: "1px",
        height: "1px",
        padding: 0,
        margin: "-1px",
        overflow: "hidden",
        clip: "rect(0, 0, 0, 0)",
        whiteSpace: "nowrap",
        border: 0,
      }}
      aria-hidden="false"
    >
      {children}
    </div>
  );
}