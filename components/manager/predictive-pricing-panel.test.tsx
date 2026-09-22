// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PredictivePricingPanel from "./predictive-pricing-panel";

const recommendation = {
  roomTypeId: "garden", roomTypeName: "Garden Twin", targetDate: "2026-09-18",
  baseRate: 5800, projectedOccupancy: 85, recommendedRate: 6960,
  percentageChange: 20, demandTier: "high", reasoning: "+20% surge due to 85% projected Friday occupancy.",
  bookingPace: 2, confidence: "medium", occupancyBasis: "prediction", floorRate: 4640,
  ceilingRate: 7830, boundApplied: null,
};

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("PredictivePricingPanel", () => {
  it("separates prediction from facts and exposes transparent demand reasoning", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ data: { modelRunId: "11111111-1111-4111-8111-111111111111", modelVersion: "dynamic-pricing-v1", confidence: { level: "medium", basis: "Supported forecast." }, recommendations: [recommendation] } }) })));
    render(<PredictivePricingPanel />);
    expect(screen.getByRole("status")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Garden Twin")).toBeTruthy());
    expect(screen.getByText("PREDICTION")).toBeTruthy();
    expect(screen.getByText("FACT")).toBeTruthy();
    expect(screen.getByText("High Demand Surge")).toBeTruthy();
    expect(screen.getByText(/85% projected Friday occupancy/)).toBeTruthy();
  });

  it("lets a Manager fine-tune a recommendation before submitting it to Owner", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/propose")) return { ok: true, json: async () => ({ data: { submitted: 1 } }) };
      return { ok: true, json: async () => ({ data: { modelRunId: "11111111-1111-4111-8111-111111111111", modelVersion: "dynamic-pricing-v1", confidence: { level: "medium", basis: "Supported forecast." }, recommendations: [recommendation] } }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<PredictivePricingPanel />);
    await waitFor(() => expect(screen.getByText("Garden Twin")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Review & Propose Rate Overlay" }));
    const rate = screen.getByLabelText(/Nightly rate for Garden Twin/);
    fireEvent.change(rate, { target: { value: "7100.25" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit Proposal to Owner" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/analytics/pricing-recommendations/propose", expect.objectContaining({ method: "POST" })));
    const post = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/propose"));
    expect(JSON.parse(String(post?.[1]?.body)).recommendations[0].nightlyRate).toBe(7100.25);
    await waitFor(() => expect(screen.getByText(/proposal sent to Owner\/Admin review/i)).toBeTruthy());
  });
});
