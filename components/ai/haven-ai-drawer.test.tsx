// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import HavenAiDrawer from "./haven-ai-drawer";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("shows the right-edge drawer in a normal staff module and only reads on open", async () => {
  const fetch = vi.fn(async (url: string, options?: RequestInit) => {
    if (!url.startsWith("/api/ai/placement?") || options?.method === "POST") throw new Error("Unexpected request");
    return Response.json({ data: {
    module: "Bookings", purpose: "Booking process guide", description: "Review the booking workflow.",
    facts: [], state: "absent", recommendation: null,
    } });
  });
  vi.stubGlobal("fetch", fetch);
  render(<><main data-testid="module">Existing booking table</main><HavenAiDrawer role="front_desk" module="Bookings" /></>);
  const toggle = await screen.findByRole("button", { name: "Open HAVEN AI" });
  expect(screen.getByTestId("module")).toHaveTextContent("Existing booking table");
  fireEvent.click(toggle);
  expect(screen.getByRole("dialog", { name: "HAVEN AI" })).toHaveTextContent("Booking process guide");
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  expect(fetch.mock.calls[0][0]).toContain("/api/ai/placement?module=Bookings");
  expect(fetch.mock.calls.every(([, options]) => options?.method !== "POST")).toBe(true);
});

it("keeps manual Gemini Ask behind a deliberate click", async () => {
  const fetch = vi.fn(async (_url: string, options?: RequestInit) => options?.method === "POST"
    ? Response.json({ data: { answer: "Review the reservation and room readiness in HAVEN.", facts: [], model: "gemini-test" } })
    : Response.json({ data: { module: "Bookings", purpose: "Booking process guide", description: "Review the booking workflow.", facts: [], state: "absent", recommendation: null } }));
  vi.stubGlobal("fetch", fetch);
  render(<HavenAiDrawer role="front_desk" module="Bookings" />);
  fireEvent.click(await screen.findByRole("button", { name: "Open HAVEN AI" }));
  fireEvent.click(screen.getByRole("button", { name: "Ask HAVEN AI" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Question about this module" }), { target: { value: "How should I prepare this arrival?" } });
  fireEvent.click(screen.getByRole("button", { name: "Send question" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Review the reservation"));
  expect(fetch.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
});

it("does not nest a drawer in the dedicated Manager HAVEN AI page", () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  render(<HavenAiDrawer role="manager" module="HAVEN AI" />);
  expect(screen.queryByRole("button", { name: "Open HAVEN AI" })).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});
