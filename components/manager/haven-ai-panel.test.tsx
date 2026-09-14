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

const indicators = {
  occupiedNow: 18,
  arrivalsTomorrow: 7,
  openGuestRequests: 4,
  highRiskSupplies: 2,
  openMaintenanceItems: 3
};

const briefPayload = {
  data: brief,
  indicators,
  model: "gemini-2.5-flash",
  generatedAt: "2026-09-08T02:10:00Z"
};

function mockFetch(responses: Record<string, unknown>) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
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
    mockFetch({ "/api/ai/brief": briefPayload });
    render(<HavenAiPanel userName="Maya Reyes" />);
    await waitFor(() => expect(screen.getByText(/Tomorrow runs at 75%/)).toBeTruthy());
    expect(screen.getByText("Schedule an extra room attendant for tomorrow morning")).toBeTruthy();
    expect(screen.getByText(/Room 305 air conditioning/)).toBeTruthy();
    // The disclosure line appears in the brief footer and the Ask panel hint.
    expect(screen.getAllByText(/AI-generated operational guidance/).length).toBeGreaterThan(0);
    expect(screen.getByText(/gemini-2\.5-flash/)).toBeTruthy();
  });

  it("presents the approved advisory hierarchy with authoritative indicators", async () => {
    mockFetch({ "/api/ai/brief": briefPayload });
    const { container } = render(<HavenAiPanel userName="Maya Reyes" />);
    await waitFor(() => expect(screen.getByText("18 rooms")).toBeTruthy());

    expect(screen.getByRole("heading", { name: "HAVEN AI" })).toBeTruthy();
    expect(screen.getByText("Read-only advisory")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Key operational indicators from today's data" })).toBeTruthy();
    expect(screen.queryByText(/At a glance/i)).toBeNull();
    expect(screen.getByText("7 reservations")).toBeTruthy();
    expect(screen.getByText("4 requests")).toBeTruthy();
    expect(screen.getByText("2 items")).toBeTruthy();
    expect(screen.getByText("3 items")).toBeTruthy();
    expect(screen.getByText(/Hi Maya!/)).toBeTruthy();
    expect(screen.getByText("Answers are based on your HAVEN data. I can't make changes in the system.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "How HAVEN AI works" })).toBeTruthy();
    expect(screen.getByText("Predictive analytics")).toBeTruthy();
    expect(screen.getByText("Your decision")).toBeTruthy();
    expect(container.textContent).not.toMatch(/vs yesterday|% from/i);
    expect(screen.queryByRole("button", { name: /apply|execute|approve/i })).toBeNull();
  });

  it("degrades to an availability message when Gemini is not configured", async () => {
    mockFetch({ "/api/ai/brief": { data: null, message: "HAVEN AI is temporarily unavailable. Hotel operations are not affected." } });
    render(<HavenAiPanel />);
    await waitFor(() => expect(screen.getByText(/temporarily unavailable/)).toBeTruthy());
    expect(screen.getAllByText("Unavailable")).toHaveLength(5);
    // Ask HAVEN still renders — the workspace is present either way.
    expect(screen.getByText("Ask HAVEN")).toBeTruthy();
  });

  it("omits the warnings block when the validated brief has no warnings", async () => {
    mockFetch({ "/api/ai/brief": { ...briefPayload, data: { ...brief, warnings: [] } } });
    render(<HavenAiPanel />);
    await waitFor(() => expect(screen.getByText(/Tomorrow runs at 75%/)).toBeTruthy());
    expect(screen.queryByRole("heading", { name: "Warnings" })).toBeNull();
  });

  it("asks a question and renders the answer with tool provenance", async () => {
    const fetchMock = mockFetch({
      "/api/ai/brief": briefPayload,
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
    mockFetch({ "/api/ai/brief": briefPayload });
    render(<HavenAiPanel />);
    await waitFor(() => expect(screen.getByText(/Tomorrow runs at 75%/)).toBeTruthy());
    expect(screen.getByText("Which rooms need maintenance attention?")).toBeTruthy();
    expect(screen.getByText("Are we at risk of running out of any supplies?")).toBeTruthy();
  });

  it("renders assistant Markdown as formatted output while user text stays literal", async () => {
    mockFetch({
      "/api/ai/brief": briefPayload,
      "/api/ai/ask": { data: { answer: "### Supply Risk Summary\n\n- **FACT:** 1 of 4 items low.", data_basis: "getInventoryRiskSummary" }, model: "gemini-2.5-flash" }
    });
    const { container } = render(<HavenAiPanel />);
    await waitFor(() => expect(screen.getByText(/Tomorrow runs at 75%/)).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Ask HAVEN a question"), { target: { value: "Is **anything** low?" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    await waitFor(() => expect(container.querySelector(".ai-turn.assistant h4")).toBeTruthy());
    expect(container.querySelector(".ai-turn.assistant strong")?.textContent).toBe("FACT:");
    // The user's own Markdown-looking text is never interpreted.
    expect(screen.getByText("Is **anything** low?")).toBeTruthy();
    expect(container.textContent).not.toContain("###");
  });

  it("keeps the Ask button accessible with a decorative icon and hidden label", async () => {
    mockFetch({ "/api/ai/brief": briefPayload });
    const { container } = render(<HavenAiPanel />);
    await waitFor(() => expect(screen.getByText(/Tomorrow runs at 75%/)).toBeTruthy());
    const button = screen.getByRole("button", { name: "Ask" });
    expect(button.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    // No icon fallback text leaks into the visible or accessible name.
    expect(button.textContent).not.toMatch(/svg/i);
    const label = container.querySelector('label[for="ai-question"]');
    expect(label?.textContent).toBe("Ask HAVEN a question");
    expect(label?.className).toContain("sr-only");
  });

  it("refreshes the brief explicitly without changing the Ask workflow", async () => {
    const fetchMock = mockFetch({ "/api/ai/brief": briefPayload });
    render(<HavenAiPanel />);
    await waitFor(() => expect(screen.getByText(/Tomorrow runs at 75%/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Refresh brief" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/ai/brief?refresh=1", { cache: "no-store" }));
  });
});
