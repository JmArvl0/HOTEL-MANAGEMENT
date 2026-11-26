// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PredictivePricingPanel from "./predictive-pricing-panel";

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

const recommendation = {
  roomTypeId: "garden", roomTypeName: "Garden Twin", targetDate: "2026-09-18",
  baseRate: 5800, sellingRate: 5800, reviewKey: "a".repeat(64), observations: 12, projectedOccupancy: 85, recommendedRate: 6960,
  percentageChange: 20, demandTier: "high", reasoning: "+20% surge due to 85% projected Friday occupancy.",
  bookingPace: 2, confidence: "medium", occupancyBasis: "prediction", floorRate: 4640,
  ceilingRate: 7830, boundApplied: null,
};

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("PredictivePricingPanel", () => {
  it("separates prediction from facts and exposes transparent demand reasoning", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ data: { modelRunId: "11111111-1111-4111-8111-111111111111", modelVersion: "dynamic-pricing-v1", confidence: { level: "medium", basis: "Supported forecast." }, recommendations: [recommendation] } }) })));
    render(<PredictivePricingPanel />);
    expect(screen.getByLabelText("Loading predictive pricing")).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Suggested rates by stay date" })).toBeTruthy());
    expect(screen.getByText("85% expected")).toBeTruthy();
    expect(screen.getAllByText("Current selling rate").length).toBeTruthy();
    expect(screen.getByText("Raise +20%")).toBeTruthy();
    expect(screen.getByText(/85% projected Friday occupancy/)).toBeTruthy();
  });

  it("lets a Manager fine-tune a recommendation before submitting it to Owner", async () => {
    const nextDate = { ...recommendation, targetDate: "2026-09-19", percentageChange: 10 };
    const fetchMock = vi.fn(async (...[input]: [RequestInfo | URL, RequestInit?]) => {
      if (String(input).endsWith("/propose")) return { ok: true, json: async () => ({ data: { submitted: 1 } }) };
      return { ok: true, json: async () => ({ data: { modelRunId: "11111111-1111-4111-8111-111111111111", modelVersion: "dynamic-pricing-v1", confidence: { level: "medium", basis: "Supported forecast." }, recommendations: [recommendation, nextDate] } }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<PredictivePricingPanel />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Suggested rates by stay date" })).toBeTruthy());
    const filter = screen.getByRole<HTMLSelectElement>("combobox", { name: /Filter by stay date/ });
    fireEvent.click(screen.getByRole("button", { name: /See rates for Sep 18/ }));
    expect(filter.value).toBe(recommendation.targetDate);
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    fireEvent.click(screen.getByRole("checkbox", { name: /Select Garden Twin/ }));
    fireEvent.change(filter, { target: { value: nextDate.targetDate } });
    expect(screen.getByText("1 rate · 1 selected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Review rate proposals/ }));
    const rate = screen.getByLabelText(/Nightly rate for Garden Twin/);
    fireEvent.change(rate, { target: { value: "7100.25" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit Proposal to Owner" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/analytics/pricing-recommendations/propose", expect.objectContaining({ method: "POST" })));
    const post = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/propose"));
    expect(JSON.parse(String(post?.[1]?.body)).recommendations).toEqual([
      { roomTypeId: recommendation.roomTypeId, targetDate: recommendation.targetDate, nightlyRate: 7100.25, reviewKey: recommendation.reviewKey }
    ]);
    await waitFor(() => expect(screen.getByText(/proposal sent to Owner\/Admin review/i)).toBeTruthy());
  });
});
