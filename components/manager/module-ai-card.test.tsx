// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { vi, describe, beforeEach, it, expect, afterEach } from "vitest";
import ModuleAiCard from "./module-ai-card";
import { AI_MODULE_METADATA } from "@/lib/ai/module-metadata";

afterEach(() => cleanup());

const fetchMock = vi.fn();
global.fetch = fetchMock;

describe("ModuleAiCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    AI_MODULE_METADATA.front_desk.enabled = true;
  });

  it("renders nothing when module is disabled", () => {
    AI_MODULE_METADATA.front_desk.enabled = false;
    render(<ModuleAiCard moduleId="front_desk" />);
    expect(screen.queryByText("Front Desk Operations Summary")).not.toBeInTheDocument();
  });

  it("renders heading, description, read-only badge, and Generate button", () => {
    render(<ModuleAiCard moduleId="front_desk" />);
    expect(screen.getByText("Front Desk Operations Summary")).toBeInTheDocument();
    expect(screen.getByText("Explains today's Front Desk workload from HAVEN's own operational facts. Read-only; it cannot check guests in, assign rooms, or change records.")).toBeInTheDocument();
    expect(screen.getByText("Read-only")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate" })).toBeInTheDocument();
    expect(screen.getByText("No automatic calls. Usage metadata is audited; summaries are not saved.")).toBeInTheDocument();
  });

  it("does not fetch on mount", () => {
    render(<ModuleAiCard moduleId="front_desk" />);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls API with empty body when Generate clicked without a focus area", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { summary: "OK", findings: [], suggested_actions: [], limitations: [] }, model: "gemini-test", generatedAt: new Date().toISOString() })
    });
    render(<ModuleAiCard moduleId="front_desk" />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/ai/module/front_desk");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({});
  });

  it("calls API with a safe topic ID when a focus area is selected", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { summary: "OK", findings: [], suggested_actions: [], limitations: [] }, model: "gemini-test", generatedAt: new Date().toISOString() })
    });
    render(<ModuleAiCard moduleId="front_desk" />);
    const input = screen.getByRole("combobox", { name: "Focus area" });
    fireEvent.change(input, { target: { value: "arrivals" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, options] = fetchMock.mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({ topic: "arrivals" });
  });

  it("shows note on 429 and does not render result", async () => {
    const mockResponse = { ok: false, status: 429, json: async () => ({ error: "Rate limited." }) };
    fetchMock.mockResolvedValue(mockResponse);
    render(<ModuleAiCard moduleId="front_desk" />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    await waitFor(() => expect(screen.getByText("Rate limited.")).toBeInTheDocument());
    expect(screen.queryByText("OK")).not.toBeInTheDocument();
  });

  it("shows note on 503", async () => {
    const mockResponse = { ok: false, status: 503, json: async () => ({ error: "Storage down." }) };
    fetchMock.mockResolvedValue(mockResponse);
    render(<ModuleAiCard moduleId="front_desk" />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    await waitFor(() => expect(screen.getByText("Storage down.")).toBeInTheDocument());
  });

  it("renders grounded result with fact values from server", async () => {
    const mockData = {
      summary: "Arrivals are light.",
      findings: [{ fact_ids: ["front_desk.arrivals_today"], explanation: "One arrival expected." }],
      suggested_actions: [{ action: "Check rooms", rationale: "Dirty room" }],
      limitations: ["No deposit info"],
      facts: [{ id: "front_desk.arrivals_today", label: "Arrivals today", display: "1", basis: "FACT", source: "HAVEN reservations", asOf: "2026-11-18T00:00:00.000Z" }]
    };
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: mockData, model: "gemini-test", generatedAt: "2026-11-18T00:00:00.000Z" })
    });
    render(<ModuleAiCard moduleId="front_desk" />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    await waitFor(() => expect(screen.getByText("Arrivals are light.")).toBeInTheDocument());
    expect(screen.getByText("Arrivals today")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("FACT")).toBeInTheDocument();
    expect(screen.getByText("Check rooms")).toBeInTheDocument();
    expect(screen.getByText(/Dirty room/)).toBeInTheDocument();
    expect(screen.getByText("No deposit info")).toBeInTheDocument();
    expect(screen.getByText(/AI-generated operational guidance/)).toBeInTheDocument();
  });

  it("disables input and button while busy", async () => {
    let resolve: (value: Response) => void;
    fetchMock.mockImplementation(() => new Promise(r => { resolve = r; }));
    render(<ModuleAiCard moduleId="front_desk" />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Generating…" })).toBeDisabled());
    expect(screen.getByRole("combobox", { name: "Focus area" })).toBeDisabled();
    resolve!(new Response(JSON.stringify({ data: { summary: "OK", findings: [], suggested_actions: [], limitations: [] }, model: "gemini-test", generatedAt: new Date().toISOString() }), { status: 200, headers: { "Content-Type": "application/json" } }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Generate" })).not.toBeDisabled());
  });
});
