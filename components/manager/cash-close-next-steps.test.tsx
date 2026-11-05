// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import CashCloseNextSteps from "./cash-close-next-steps";
const shift = { id: "closed-drawer", status: "closed", closed_at: "2026-11-03T15:00:00Z", variance: 0 };
const callbacks = () => ({ onCreateHandover: vi.fn(), onOpenHandovers: vi.fn(), onOpenReport: vi.fn() });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("uses persisted scoped follow-up/report status and prefilled actions without writes", async () => {
  const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({ data: { handovers: [], reportDate: "2026-11-03", report: null, includesClose: null } })));
  vi.stubGlobal("fetch", fetch); const actions = callbacks();
  render(<CashCloseNextSteps shift={shift} role="front_desk" {...actions} />);
  await screen.findByText("No unresolved handover for this drawer in your department.");
  fireEvent.click(screen.getByRole("button", { name: "Add a concern" }));
  expect(actions.onCreateHandover).toHaveBeenCalledWith(shift);
  fireEvent.click(screen.getByRole("button", { name: "Open daily report" }));
  expect(actions.onOpenReport).toHaveBeenCalledWith("2026-11-03");
  expect(fetch.mock.calls.every(call => !call[1]?.method)).toBe(true);
});
it("does not show a complete state when the source read fails", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Unavailable" }), { status: 503 })));
  render(<CashCloseNextSteps shift={shift} role="front_desk" {...callbacks()} />);
  await screen.findByText(/Next-step status unavailable/);
  expect(screen.queryByText(/No unresolved handover/)).toBeNull();
  expect(screen.queryByText("Not submitted")).toBeNull();
});
it("keeps Accounting outside report submission and preserves pending follow-up", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: { handovers: [{ id: "concern", summary: "Review cash", resolved_at: null }], reportDate: "2026-11-03", report: null, includesClose: null } }))));
  render(<CashCloseNextSteps shift={shift} role="accounting" {...callbacks()} />);
  await screen.findByText(/1 unresolved handover/);
  expect(screen.getByText(/Front Desk submits the daily report/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Open daily report" })).toBeNull();
});
