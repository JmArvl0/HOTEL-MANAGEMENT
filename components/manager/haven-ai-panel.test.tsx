// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import HavenAiPanel from "./haven-ai-panel";

// Render-layer tests for the HAVEN AI workspace: the daily brief renders
// Gemini's structured, zod-validated output with its disclosure; Ask HAVEN
// posts to the tool-backed route and renders the answer; rate limits and
// outages degrade to a message without breaking the panel. Fetch is stubbed —
// no live Gemini call.

const brief = {
  summary: "Tomorrow runs at 75% booked with a predicted final 82%. Housekeeping faces a high workload day with 7 checkout cleans.",
  priority_actions: [
    { action: "Schedule an extra room attendant for tomorrow morning", rationale: "7 checkout cleans concentrate before the 3:00 PM check-in window." },
    { action: "Restock bath towels", rationale: "Predicted 3-day consumption exceeds current stock." }
  ],
  warnings: ["Room 305 air conditioning shows an increasing repeat pattern."],
  prediction_explanations: [{ label: "Occupancy forecast", text: "Based on 14 pickup observations — medium data quality." }]
};

function mockFetch(responses: Record<string, unknown>) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input).split("?")[0];
    const body = responses[url] ?? { data: null };
    return Promise.resolve({ ok: true, json: async () => body } as Response);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("HavenAiPanel", () => {
  it("renders the daily brief with priority actions, warnings and the disclosure", async () => {
    mockFetch({ "/api/ai/brief": { data: brief, model: "gemini-2.5-flash", generatedAt: "2026-09-08T02:10:00Z" } });
    render(<HavenAiPanel />);
    await waitFor(() => expect(screen.getByText(/Tomorrow runs at 75%/)).toBeTruthy());
    expect(screen.getByText("Schedule an extra room attendant for tomorrow morning")).toBeTruthy();
    expect(screen.getByText(/Room 305 air conditioning/)).toBeTruthy();
    // The disclosure line appears in the brief footer and the Ask panel hint.
    expect(screen.getAllByText(/AI-generated operational guidance/).length).toBeGreaterThan(0);
    expect(screen.getByText(/gemini-2\.5-flash/)).toBeTruthy();
  });

  it("degrades to an availability message when Gemini is not configured", async () => {
    mockFetch({ "/api/ai/brief": { data: null, message: "AI assistance is temporarily unavailable. All HAVEN operations continue to work normally." } });
    render(<HavenAiPanel />);
    await waitFor(() => expect(screen.getByText(/temporarily unavailable/)).toBeTruthy());
    // Ask HAVEN still renders — the workspace is present either way.
    expect(screen.getByText("Ask HAVEN")).toBeTruthy();
  });

  it("asks a question and renders the answer with tool provenance", async () => {
    const fetchMock = mockFetch({
      "/api/ai/brief": { data: brief, model: "gemini-2.5-flash", generatedAt: "2026-09-08T02:10:00Z" },
      "/api/ai/ask": { data: { answer: "Tomorrow has 7 checkout cleans and a predicted 82% occupancy. Consider adding an attendant.", data_basis: "getHousekeepingForecast, getOccupancyForecast" }, model: "gemini-2.5-flash" }
    });
    render(<HavenAiPanel />);
    await waitFor(() => expect(screen.getByText(/Tomorrow runs at 75%/)).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Ask HAVEN a question"), { target: { value: "What should we prepare for tomorrow?" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    await waitFor(() => expect(screen.getByText(/Consider adding an attendant/)).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith("/api/ai/ask", expect.objectContaining({ method: "POST" }));
  });

  it("offers suggested questions before the first ask", async () => {
    mockFetch({ "/api/ai/brief": { data: brief, model: "gemini-2.5-flash", generatedAt: "2026-09-08T02:10:00Z" } });
    render(<HavenAiPanel />);
    await waitFor(() => expect(screen.getByText(/Tomorrow runs at 75%/)).toBeTruthy());
    expect(screen.getByText("Which rooms need maintenance attention?")).toBeTruthy();
    expect(screen.getByText("Are we at risk of running out of any supplies?")).toBeTruthy();
  });
});
