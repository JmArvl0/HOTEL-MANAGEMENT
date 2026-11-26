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
      { date: "2026-09-09", totalRooms: 20, knownOccupied: 15, knownOccupancyPct: 75, predictedOccupancyPct: 80, predictedOccupied: 16, roomsAvailableToSell: 5, riskLevel: "high", dataQuality: "medium", basisObservations: 14 }
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
      { itemId: "i2", name: "Shampoo 40ml", category: "amenities", unit: "bottles", currentStock: 50, reorderPoint: 60, predictedConsumption: null, projectedShortage: null, recommendedReorder: null, risk: "medium", riskBasis: "current-low-stock", belowReorderPoint: true, dataQuality: "limited", movementDays: 3 }
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
  }
};

const explanation = {
  explanation: "Occupancy is 75% booked for tomorrow and HAVEN predicts a final 82% based on 14 observations of late pickup.",
  key_factors: ["15 rooms already booked", "Late pickup pattern from the last two weeks"],
  data_quality_note: "Medium history — treat as indicative."
};

function mockFetch(responses: Record<string, unknown>) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    const body = responses[url] ?? (responses[url.split("?")[0]] ?? { data: null });
    return Promise.resolve({ ok: true, json: async () => body } as Response);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("PredictiveInsightsPanel", () => {
  it("opens the seasonal outlook and requests a specific date with an earlier reference year", async () => {
    const coldStart = {
      today: "2026-09-08", activeRooms: 20, databaseMode: "supabase",
      days: [{ date: "2026-10-01", referenceDate: "2025-10-01", reference: null, actual: null, bookedRooms: 0, bookedPercent: 0, projectedPercent: null, projectedRooms: null }],
      summary: { comparisonDays: 0, targetDays: 1, hasOpenDates: true, bookedRoomNights: 0, baselinePercent: null, periodOccupancy: null }
    };
    const requests = mockFetch({ "/api/analytics/insights": { data: insights }, "/api/analytics/seasonal-occupancy": { data: coldStart } });
    render(<PredictiveInsightsPanel />);
    fireEvent.click(await screen.findByRole("tab", { name: "Seasonal Outlook" }));
    expect(await screen.findByText("No occupancy records for the matching dates yet.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Specific date" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Show outlook" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.change(screen.getByLabelText("Target date"), { target: { value: "2027-01-21" } });
    fireEvent.click(screen.getByRole("button", { name: "Show outlook" }));
    await waitFor(() => expect(requests).toHaveBeenCalledWith("/api/analytics/seasonal-occupancy?view=date&target=2027-01-21&referenceYear=2026&match=calendar", expect.anything()));
  });

  it("leads with tomorrow’s booked rooms and expected occupancy", async () => {
    mockFetch({ "/api/analytics/insights": { data: insights } });
    render(<PredictiveInsightsPanel />);
    expect(await screen.findByText(/15 of 20 rooms are already booked/)).toBeTruthy();
    expect(screen.getByText(/expects 16 rooms to be occupied \(80%\)/)).toBeTruthy();
    expect(screen.queryByText(/housekeeping tasks tomorrow/)).toBeNull();
    expect(screen.getByText("Already booked")).toBeTruthy();
  });

  it("renders inventory risk and maintenance risk detail with honest data-quality notes", async () => {
    mockFetch({ "/api/analytics/insights": { data: insights } });
    render(<PredictiveInsightsPanel />);
    await waitFor(() => expect(screen.getByText("7-day occupancy outlook")).toBeTruthy());
    fireEvent.click(screen.getByRole("tab", { name: "Inventory Consumption" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Bath towels" })).toBeTruthy());
    expect(screen.getByText("26")).toBeTruthy(); // projected shortage
    // Items without movement history are labeled, never guessed.
    expect(screen.getByText(/3 recorded days · more history needed/)).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Recurring Maintenance Risk" }));
    await waitFor(() => expect(screen.getByText(/Room 305: 4 air conditioning work orders/)).toBeTruthy());
  });

  it("opens Forecast Accuracy and shows empty evidence without implying zero error", async () => {
    const requests = mockFetch({
      "/api/analytics/insights": { data: insights },
      "/api/analytics/evaluation": { data: { from: "2026-08-09", through: "2026-09-07", rows: [], databaseMode: "supabase" } }
    });
    render(<PredictiveInsightsPanel />);
    fireEvent.click(await screen.findByRole("tab", { name: "Forecast Accuracy" }));
    expect(await screen.findByText("No saved forecasts for this selection")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Forecast summary" })).toBeNull();
    expect((screen.getByRole("button", { name: "Export CSV" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Forecast"), { target: { value: "inventory" } });
    await waitFor(() => expect(requests).toHaveBeenCalledWith("/api/analytics/evaluation?metric=inventory&days=30", expect.anything()));
  });
  it("states which forecast was closer and keeps the technical metric in the accuracy details", async () => {
    const rows = Array.from({ length: 7 }, (_, i) => {
      const targetDate = `2026-09-0${i + 1}`;
      return { id: targetDate, targetDate, windowStart: targetDate, generatedAt: `${targetDate}T02:35:00+08:00`,
        actual: 80, predicted: 70, baseline: 75, modelVersion: "occupancy-v1", unit: "%",
        historicalObservations: 12, dataQuality: "medium", exclusion: null };
    });
    mockFetch({
      "/api/analytics/insights": { data: insights },
      "/api/analytics/evaluation": { data: { from: "2026-08-09", through: "2026-09-07", rows, databaseMode: "supabase" } }
    });
    render(<PredictiveInsightsPanel />);
    fireEvent.click(await screen.findByRole("tab", { name: "Forecast Accuracy" }));
    expect(await screen.findByText("The 7-day average was closer.")).toBeTruthy();
    const summary = within(screen.getByLabelText("Forecast accuracy summary"));
    expect(summary.getByText("10 pp")).toBeTruthy();
    expect(summary.getByText("5 pp")).toBeTruthy();
    expect(screen.getByText("Mean absolute percentage error (MAPE).").closest("details")?.open).toBe(false);
  });
  it("refreshes predictions through the generate endpoint", async () => {
    const fetchMock = mockFetch({
      "/api/analytics/insights": { data: insights },
      "/api/analytics/generate": { data: { generatedAt: "2026-09-08T03:00:00Z", persisted: true } }
    });
    render(<PredictiveInsightsPanel />);
    await waitFor(() => expect(screen.getByText("Predictive Analytics")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Refresh predictions/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/analytics/generate", expect.objectContaining({ method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })));
    await waitFor(() => expect(screen.getByText(/Predictions refreshed/)).toBeTruthy());
  });

  it("groups forecast freshness with Refresh predictions", async () => {
    mockFetch({ "/api/analytics/insights": { data: insights } });
    const { container } = render(<PredictiveInsightsPanel />);
    await waitFor(() => expect(screen.getByText("Predictive Analytics")).toBeTruthy());
    const hero = container.querySelector(".insights-title")!;
    expect(hero).toBeTruthy();
    expect(hero.querySelector("img")).toBeNull();
    const actions = hero.querySelector(".page-header-actions")!;
    expect(actions).toBeTruthy();
    expect(actions.textContent).toContain("Live forecast calculated");
    expect(actions.textContent).toContain("Refresh predictions");
  });

  it("keeps the outlook first and exposes Forecast Accuracy alongside it", async () => {
    mockFetch({ "/api/analytics/insights": { data: insights } });
    const { container } = render(<PredictiveInsightsPanel />);
    await waitFor(() => expect(screen.getByText("7-day occupancy outlook")).toBeTruthy());
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Occupancy Forecast",
      "Demand & Rate Forecast",
      "Housekeeping Workload",
      "Inventory Consumption",
      "Recurring Maintenance Risk",
      "Seasonal Outlook",
      "Forecast Accuracy"
    ]);
    expect(screen.getByRole("tab", { name: "Occupancy Forecast" }).getAttribute("aria-selected")).toBe("true");
    // Only the selected panel renders — sibling forecasts stay out of the DOM.
    expect(screen.queryByRole("heading", { name: "Housekeeping Workload Forecast" })).toBeNull();
    expect(container.querySelectorAll(".insights-row")).toHaveLength(0);
    expect(screen.queryByRole("tabpanel", { name: "Forecast Accuracy" })).toBeNull();
  });

  it("switches forecast panels without reloading the operational forecast", async () => {
    const fetchMock = mockFetch({ "/api/analytics/insights": { data: insights } });
    render(<PredictiveInsightsPanel />);
    await waitFor(() => expect(screen.getByText("7-day occupancy outlook")).toBeTruthy());
    fireEvent.click(screen.getByRole("tab", { name: "Housekeeping Workload" }));
    expect(screen.getByRole("heading", { name: "Housekeeping Workload Forecast" })).toBeTruthy();
    expect(screen.queryByText("7-day occupancy outlook")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Inventory Consumption" }));
    expect(screen.getByRole("button", { name: "Bath towels" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Recurring Maintenance Risk" }));
    expect(screen.getByRole("heading", { name: "Flagged rooms and issues" })).toBeTruthy();
    // Tab switches render already-loaded data — the insights endpoint is hit once.
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/analytics/insights")).toHaveLength(1);
  });

  it("moves tab selection with arrow keys", async () => {
    mockFetch({ "/api/analytics/insights": { data: insights } });
    render(<PredictiveInsightsPanel />);
    await waitFor(() => expect(screen.getByText("7-day occupancy outlook")).toBeTruthy());
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });
    expect(screen.getByRole("tabpanel", { name: "Demand & Rate Forecast" })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });
    expect(screen.getByRole("heading", { name: "Housekeeping Workload Forecast" })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "End" });
    expect(screen.getByRole("tabpanel", { name: "Forecast Accuracy" })).toBeTruthy();
  });

  it("keeps the active tab after Refresh predictions", async () => {
    const fetchMock = mockFetch({
      "/api/analytics/insights": { data: insights },
      "/api/analytics/generate": { data: { generatedAt: "2026-09-08T03:00:00Z", persisted: true } }
    });
    render(<PredictiveInsightsPanel />);
    await waitFor(() => expect(screen.getByText("7-day occupancy outlook")).toBeTruthy());
    fireEvent.click(screen.getByRole("tab", { name: "Inventory Consumption" }));
    expect(screen.getByRole("button", { name: "Bath towels" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Refresh predictions/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/analytics/generate", expect.objectContaining({ method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })));
    // Still on Inventory — refresh reloads data without resetting navigation.
    expect(screen.getByRole("button", { name: "Bath towels" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Inventory Consumption" }).getAttribute("aria-selected")).toBe("true");
  });

  it("keeps every housekeeping and inventory column in the full-width views", async () => {
    mockFetch({ "/api/analytics/insights": { data: insights } });
    render(<PredictiveInsightsPanel />);
    await waitFor(() => expect(screen.getByText("7-day occupancy outlook")).toBeTruthy());
    fireEvent.click(screen.getByRole("tab", { name: "Housekeeping Workload" }));
    const hkTable = screen.getByRole("table", { name: "Housekeeping workload forecast" });
    expect(within(hkTable).getAllByRole("columnheader")).toHaveLength(11);
    for (const header of ["Checkout cleans", "Stayover services", "Guest requests", "Inspections", "Open now", "Expected new", "Total tasks", "Workload", "Est. work hours", "Based on"]) {
      expect(within(hkTable).getByText(header)).toBeTruthy();
    }
    fireEvent.click(screen.getByRole("tab", { name: "Inventory Consumption" }));
    const invTable = screen.getByRole("table", { name: "Inventory shortage forecast" });
    expect(within(invTable).getAllByRole("columnheader")).toHaveLength(8);
  });

  it("renders the designed empty maintenance state with its disclaimer", async () => {
    mockFetch({ "/api/analytics/insights": { data: { ...insights, maintenance: { ...insights.maintenance, risks: [], elevatedCount: 0 } } } });
    render(<PredictiveInsightsPanel />);
    await waitFor(() => expect(screen.getByText("7-day occupancy outlook")).toBeTruthy());
    fireEvent.click(screen.getByRole("tab", { name: "Recurring Maintenance Risk" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "No repeat issues" })).toBeTruthy());
    expect(screen.getByText("No rooms show recurring work-order patterns in the last 90 days.")).toBeTruthy();
    expect(screen.getByText("How HAVEN flags repeat issues").closest("details")?.open).toBe(false);
  });

  it("surfaces the AI explanation with its disclosure line", async () => {
    mockFetch({
      "/api/analytics/insights": { data: insights },
      "/api/ai/explain": { data: explanation, model: "gemini-2.5-flash" }
    });
    render(<PredictiveInsightsPanel />);
    await waitFor(() => expect(screen.getByText("7-day occupancy outlook")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Explain with Gemini" }));
    // The read-only explanation opens in the shared accessible dialog.
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Gemini explanation" })).toBeTruthy());
    expect(screen.getByText(/Late pickup pattern/)).toBeTruthy();
    expect(screen.getByText(/AI-generated operational guidance/)).toBeTruthy();
  });
});
