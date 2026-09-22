// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import PredictiveInsightsPanel from "./predictive-insights-panel";

// jsdom has no ResizeObserver and no layout; recharts' ResponsiveContainer needs both.
// Direct globalThis assignments (not vi.stubGlobal) so afterEach's vi.unstubAllGlobals
// can't strip them between tests.
class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.getBoundingClientRect = function () {
  return { width: 800, height: 300, top: 0, left: 0, bottom: 300, right: 800, x: 0, y: 0 } as DOMRect;
};

// Render-layer tests for the Predictive Insights storefront: the analytics
// engine's figures arrive from /api/analytics/insights, [Refresh predictions]
// drives the snapshot endpoint, and [Explain with AI] surfaces the zod-validated
// Gemini interpretation. No Gemini call is made live — fetch is stubbed.

const insights = {
  generatedAt: "2026-09-08T02:00:00Z",
  lastSnapshotAt: "2026-09-08T02:35:00Z",
  snapshotCount: 3,
  databaseMode: "supabase",
  occupancy: {
    today: "2026-09-08",
    days: [
      { date: "2026-09-08", totalRooms: 20, knownOccupied: 12, knownOccupancyPct: 60, riskLevel: "medium", dataQuality: "high", basisObservations: 0 },
      { date: "2026-09-09", totalRooms: 20, knownOccupied: 15, knownOccupancyPct: 75, predictedOccupancyPct: 82, riskLevel: "high", dataQuality: "medium", basisObservations: 14 }
    ],
    method: "Known booked occupancy + average historical pickup",
    notes: []
  },
  housekeeping: {
    today: "2026-09-08",
    days: [
      { date: "2026-09-08", checkoutCleans: 4, stayoverServices: 6, guestRequestTasks: 1.2, inspections: 4, totalTasks: 15.2, workload: "medium", estimatedLaborHours: 7.6, dataQuality: "medium", basisNote: "12 days of history" },
      { date: "2026-09-09", checkoutCleans: 7, stayoverServices: 5, guestRequestTasks: 1.2, inspections: 7, totalTasks: 20.2, workload: "high", estimatedLaborHours: 10.1, dataQuality: "medium", basisNote: "12 days of history" }
    ],
    method: "Expected departures/stayovers + historical durations",
    notes: []
  },
  inventory: {
    today: "2026-09-08",
    items: [
      { itemId: "i1", name: "Bath towels", category: "linen", unit: "pcs", currentStock: 40, reorderPoint: 60, predictedConsumption: 66, projectedShortage: 26, recommendedReorder: 86, risk: "high", riskBasis: "predicted-shortage", dataQuality: "medium", movementDays: 12 },
      { itemId: "i2", name: "Shampoo 40ml", category: "amenities", unit: "bottles", currentStock: 50, reorderPoint: 60, predictedConsumption: null, projectedShortage: null, recommendedReorder: null, risk: "medium", riskBasis: "reorder-point", dataQuality: "limited", movementDays: 3 }
    ],
    shortageCount: 1,
    method: "Mean daily consumption from movements × 3-day horizon",
    notes: []
  },
  maintenance: {
    today: "2026-09-08",
    risks: [
      { roomId: "rm1", roomNumber: "305", category: "air_conditioning", incidents90Days: 4, openIncidents: 1, daysSinceLast: 6, trend: "increasing", risk: "high", reason: "Room 305: 4 air conditioning work orders in 90 days with increasing frequency", suggestedAction: "Schedule a full inspection", dataQuality: "medium" }
    ],
    elevatedCount: 1,
    method: "Repeat-incidence grouping per room and category, 90-day window",
    notes: []
  },
  metrics: {
    occupancy: { mae: 1.4, mape: 6.2, observations: 5, skippedKnownOnly: 2 },
    housekeeping: { mae: 2.1, observations: 4 },
    inventory: { mae: 3.0, observations: 2 },
    methodNote: "Elapsed target dates only; newest prediction per date."
  }
};

const explanation = {
  explanation: "Occupancy is 75% booked for tomorrow and HAVEN predicts a final 82% based on 14 observations of late pickup.",
  key_factors: ["15 rooms already booked", "Late pickup pattern from the last two weeks"],
  data_quality_note: "Medium history — treat as indicative."
};

function mockFetch(responses: Record<string, unknown>) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = responses[url] ?? (responses[url.split("?")[0]] ?? { data: null });
    return Promise.resolve({ ok: true, json: async () => body } as Response);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("PredictiveInsightsPanel", () => {
  it("renders the four overview cards with FACT vs PREDICTION separation", async () => {
    mockFetch({ "/api/analytics/insights": { data: insights } });
    render(<PredictiveInsightsPanel />);
    await waitFor(() => expect(screen.getByText("What is coming this week?")).toBeTruthy());
    expect(screen.getByText("75% booked")).toBeTruthy();
    expect(screen.getByText(/Predicted final 82%/)).toBeTruthy();
    expect(screen.getByText("20.2 tasks")).toBeTruthy();
    expect(screen.getByText("1 item")).toBeTruthy();
    expect(screen.getByText("1 elevated")).toBeTruthy();
    // Booked-fact vs predicted distinction is labeled in the chart legend.
    expect(screen.getByText("Booked (fact)")).toBeTruthy();
  });

  it("renders inventory risk and maintenance risk detail with honest data-quality notes", async () => {
    mockFetch({ "/api/analytics/insights": { data: insights } });
    render(<PredictiveInsightsPanel />);
    await waitFor(() => expect(screen.getByText("7-day occupancy outlook")).toBeTruthy());
    fireEvent.click(screen.getByRole("tab", { name: "Inventory Demand" }));
    await waitFor(() => expect(screen.getByText("Bath towels")).toBeTruthy());
    expect(screen.getByText("26")).toBeTruthy(); // projected shortage
    // Items without movement history are labeled, never guessed.
    expect(screen.getByText(/only 3 days of history — not yet predictable/)).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Maintenance Risk" }));
    await waitFor(() => expect(screen.getByText(/Room 305: 4 air conditioning work orders/)).toBeTruthy());
  });

  it("renders unavailable performance metrics without crashing", async () => {
    const sparseInsights = {
      ...insights,
      metrics: {
        ...insights.metrics,
        occupancy: { ...insights.metrics.occupancy, mae: null, mape: null, observations: 0 },
        housekeeping: { mae: null, observations: 0 },
        inventory: { mae: null, observations: 0 }
      }
    };
    mockFetch({ "/api/analytics/insights": { data: sparseInsights } });
    render(<PredictiveInsightsPanel />);
    await waitFor(() => expect(screen.getByText("Prediction performance")).toBeTruthy());
    for (const label of ["Occupancy — mean absolute error", "Occupancy — mean absolute % error", "Housekeeping — mean absolute error", "Inventory — mean absolute error"]) {
      expect(screen.getByText(label).closest("li")?.textContent).toContain("—");
    }
  });
  it("refreshes predictions through the generate endpoint", async () => {
    const fetchMock = mockFetch({
      "/api/analytics/insights": { data: insights },
      "/api/analytics/generate": { data: { generatedAt: "2026-09-08T03:00:00Z", persisted: true } }
    });
    render(<PredictiveInsightsPanel />);
    await waitFor(() => expect(screen.getByText("What is coming this week?")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Refresh predictions/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/analytics/generate", expect.objectContaining({ method: "POST" })));
    await waitFor(() => expect(screen.getByText(/Predictions refreshed/)).toBeTruthy());
  });

  it("keeps the hero plain teal with Live outlook and Refresh grouped on the right", async () => {
    mockFetch({ "/api/analytics/insights": { data: insights } });
    const { container } = render(<PredictiveInsightsPanel />);
    await waitFor(() => expect(screen.getByText("What is coming this week?")).toBeTruthy());
    const hero = container.querySelector(".insights-title")!;
    expect(hero).toBeTruthy();
    expect(hero.querySelector("img")).toBeNull();
    const actions = hero.querySelector(".insights-title-actions")!;
    expect(actions).toBeTruthy();
    expect(actions.textContent).toContain("Live outlook");
    expect(actions.textContent).toContain("Refresh predictions");
  });

  it("renders exactly four forecast tabs with Occupancy selected by default", async () => {
    mockFetch({ "/api/analytics/insights": { data: insights } });
    const { container } = render(<PredictiveInsightsPanel />);
    await waitFor(() => expect(screen.getByText("7-day occupancy outlook")).toBeTruthy());
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Occupancy Outlook",
      "Housekeeping Forecast",
      "Inventory Demand",
      "Maintenance Risk"
    ]);
    expect(screen.getByRole("tab", { name: "Occupancy Outlook" }).getAttribute("aria-selected")).toBe("true");
    // Only the selected panel renders — sibling forecasts stay out of the DOM.
    expect(screen.queryByText("Housekeeping workload forecast")).toBeNull();
    expect(container.querySelectorAll(".insights-row")).toHaveLength(0);
    // Prediction performance stays visible outside the tabs.
    expect(screen.getByText("Prediction performance")).toBeTruthy();
  });

  it("switches forecast panels locally with no refetch", async () => {
    const fetchMock = mockFetch({ "/api/analytics/insights": { data: insights } });
    render(<PredictiveInsightsPanel />);
    await waitFor(() => expect(screen.getByText("7-day occupancy outlook")).toBeTruthy());
    const callsAfterLoad = fetchMock.mock.calls.length;
    expect(callsAfterLoad).toBe(2);
    fireEvent.click(screen.getByRole("tab", { name: "Housekeeping Forecast" }));
    expect(screen.getByText("Housekeeping workload forecast")).toBeTruthy();
    expect(screen.queryByText("7-day occupancy outlook")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Inventory Demand" }));
    expect(screen.getByText("Bath towels")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Maintenance Risk" }));
    expect(screen.getByRole("heading", { name: "Recurring maintenance risk" })).toBeTruthy();
    // Tab switches render already-loaded data — the insights endpoint is hit once.
    expect(fetchMock).toHaveBeenCalledTimes(callsAfterLoad);
    // Performance remains visible regardless of the selected tab.
    expect(screen.getByText("Prediction performance")).toBeTruthy();
  });

  it("moves tab selection with arrow keys", async () => {
    mockFetch({ "/api/analytics/insights": { data: insights } });
    render(<PredictiveInsightsPanel />);
    await waitFor(() => expect(screen.getByText("7-day occupancy outlook")).toBeTruthy());
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });
    expect(screen.getByText("Housekeeping workload forecast")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "End" });
    expect(screen.getByRole("heading", { name: "Recurring maintenance risk" })).toBeTruthy();
  });

  it("keeps the active tab after Refresh predictions", async () => {
    const fetchMock = mockFetch({
      "/api/analytics/insights": { data: insights },
      "/api/analytics/generate": { data: { generatedAt: "2026-09-08T03:00:00Z", persisted: true } }
    });
    render(<PredictiveInsightsPanel />);
    await waitFor(() => expect(screen.getByText("7-day occupancy outlook")).toBeTruthy());
    fireEvent.click(screen.getByRole("tab", { name: "Inventory Demand" }));
    expect(screen.getByText("Bath towels")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Refresh predictions/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/analytics/generate", expect.objectContaining({ method: "POST" })));
    // Still on Inventory — refresh reloads data without resetting navigation.
    expect(screen.getByText("Bath towels")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Inventory Demand" }).getAttribute("aria-selected")).toBe("true");
  });

  it("keeps every housekeeping and inventory column in the full-width views", async () => {
    mockFetch({ "/api/analytics/insights": { data: insights } });
    render(<PredictiveInsightsPanel />);
    await waitFor(() => expect(screen.getByText("7-day occupancy outlook")).toBeTruthy());
    fireEvent.click(screen.getByRole("tab", { name: "Housekeeping Forecast" }));
    const hkTable = screen.getByRole("table", { name: "Housekeeping workload forecast" });
    expect(within(hkTable).getAllByRole("columnheader")).toHaveLength(9);
    for (const header of ["Checkout cleans", "Stayover services", "Guest requests", "Inspections", "Total", "Workload", "Est. labor", "Basis"]) {
      expect(within(hkTable).getByText(header)).toBeTruthy();
    }
    fireEvent.click(screen.getByRole("tab", { name: "Inventory Demand" }));
    const invTable = screen.getByRole("table", { name: "Inventory shortage forecast" });
    expect(within(invTable).getAllByRole("columnheader")).toHaveLength(8);
  });

  it("renders the designed empty maintenance state with its disclaimer", async () => {
    mockFetch({ "/api/analytics/insights": { data: { ...insights, maintenance: { ...insights.maintenance, risks: [], elevatedCount: 0 } } } });
    render(<PredictiveInsightsPanel />);
    await waitFor(() => expect(screen.getByText("7-day occupancy outlook")).toBeTruthy());
    fireEvent.click(screen.getByRole("tab", { name: "Maintenance Risk" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Recurring maintenance risk" })).toBeTruthy());
    expect(screen.getByText("No rooms show recurring work-order patterns in the last 90 days.")).toBeTruthy();
    expect(screen.getByText(/not a failure probability/)).toBeTruthy();
    expect(screen.getByText("0 elevated")).toBeTruthy();
  });

  it("surfaces the AI explanation with its disclosure line", async () => {
    mockFetch({
      "/api/analytics/insights": { data: insights },
      "/api/ai/explain": { data: explanation, model: "gemini-2.5-flash" }
    });
    render(<PredictiveInsightsPanel />);
    await waitFor(() => expect(screen.getByText("7-day occupancy outlook")).toBeTruthy());
    fireEvent.click(screen.getAllByRole("button", { name: "Explain with AI" })[0]);
    // Header <b> plus the close button's aria-label both read "AI interpretation".
    await waitFor(() => expect(screen.getAllByText("AI interpretation").length).toBeGreaterThan(0));
    expect(screen.getByText(/Late pickup pattern/)).toBeTruthy();
    expect(screen.getByText(/AI-generated operational guidance/)).toBeTruthy();
  });
});
