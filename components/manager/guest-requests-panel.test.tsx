// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import GuestRequestsPanel from "./guest-requests-panel";

// Render-layer smoke test for the two-column rework: the control area
// (filters/search) stays above, the submission queue renders in the main
// column, and the read-only inventory rail renders beside it from the same
// /api/resources/inventory source. The review workflow and role gating are
// exercised here only as far as the render layer shows them.
const submission = (overrides: Record<string, unknown> = {}) => ({
  id: "gr1", reservation_id: "r1", guest_id: "g1", request: "Extra towels", request_type: null,
  batch_id: "b1", approval_status: "pending", approval_note: null, approved_at: null,
  department: "housekeeping", priority: "normal", status: "open", created_at: "2026-09-07T02:00:00Z",
  reservation: { confirmation_number: "HVN-260907-ABCD", guest_name: "Mark Cruz", room_type: "Deluxe King", room_number: "412" },
  ...overrides,
});

const stock = (overrides: Record<string, unknown> = {}) => ({
  id: "i1", name: "Bath towels", category: "linen", quantity: 84, reorder_point: 60, unit: "pcs", status: "healthy",
  ...overrides,
});

function mockFetch(requests: unknown[], inventory: unknown[]) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    const data = url.includes("/api/resources/inventory") ? inventory : requests;
    return Promise.resolve({ ok: true, json: async () => ({ data }) } as Response);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("GuestRequestsPanel render layer", () => {
  it("renders submissions and the inventory rail side by side (manager, read-only)", async () => {
    mockFetch([submission()], [stock(), stock({ id: "i2", name: "Shampoo 40ml", quantity: 42, reorder_point: 80, unit: "bottles", status: "low" })]);
    render(<GuestRequestsPanel role="manager" />);
    await waitFor(() => expect(screen.getByText(/Mark Cruz/)).toBeTruthy());
    const rail = screen.getByRole("complementary", { name: "Inventory summary" });
    expect(rail.textContent).toContain("Bath towels");
    expect(rail.textContent).toContain("Shampoo 40ml");
    expect(screen.getByText("1 to reorder")).toBeTruthy();
    // Manager sees the queue read-only — no review actions.
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeTruthy();
    expect(screen.queryByRole("button", { name: "Decline" })).not.toBeTruthy();
  });

  it("shows Approve/Decline on pending submissions for Front Desk only", async () => {
    mockFetch([submission()], [stock()]);
    render(<GuestRequestsPanel role="front_desk" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Approve" })).toBeTruthy());
    expect(screen.getByRole("button", { name: "Decline" })).toBeTruthy();
  });

  it("groups the Housekeeping queue by submission, shows its destination room, and preserves escalation", async () => {
    const onEscalate = vi.fn();
    mockFetch([
      submission({ approval_status: "approved" }),
      submission({ id: "gr2", request: "Extra pillows", request_type: "extra_pillows", approval_status: "approved" }),
    ], [stock()]);

    render(<GuestRequestsPanel role="housekeeping" onEscalate={onEscalate} />);

    await waitFor(() => expect(screen.getByText("Room 412")).toBeTruthy());
    expect(screen.getByText("Extra towels")).toBeTruthy();
    expect(screen.getByText("Extra pillows")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeTruthy();
    expect(screen.queryByRole("button", { name: "Decline" })).not.toBeTruthy();

    const escalationButtons = screen.getAllByRole("button", { name: "Escalate" });
    fireEvent.click(escalationButtons[0]);
    expect(onEscalate).toHaveBeenCalledWith(expect.objectContaining({ id: "gr1", reservation_id: "r1" }));
  });

  it("keeps the inventory rail present beside the empty state", async () => {
    mockFetch([], [stock()]);
    render(<GuestRequestsPanel role="manager" />);
    await waitFor(() => expect(screen.getByText("No submissions")).toBeTruthy());
    expect(screen.getByRole("complementary", { name: "Inventory summary" })).toBeTruthy();
  });

  it("renders summary cards that match the queue counts and drive the queue filter", async () => {
    mockFetch([
      submission(),
      submission({ id: "gr2", batch_id: "b2", approval_status: "approved", status: "in_progress" }),
      submission({ id: "gr3", batch_id: "b3", approval_status: "rejected" }),
    ], [stock()]);
    render(<GuestRequestsPanel role="front_desk" />);
    await waitFor(() => expect(screen.getAllByText(/Mark Cruz/).length).toBeGreaterThan(0));
    const summary = screen.getByRole("group", { name: "Guest requests summary" });
    expect(summary.textContent).toContain("Awaiting approval");
    expect(summary.textContent).toContain("Open work");
    // Card counts equal the chip counts (1 pending, 1 open, 1 approved, 1 declined);
    // query inside the card group — the filter chip shares the label.
    const awaitingCard = within(summary).getByRole("button", { name: /Awaiting approval/ });
    expect(awaitingCard.querySelector("b")?.textContent).toBe("1");
    // Default view is All: every batch is listed (each guest name renders in the batch).
    expect(screen.getAllByText(/Mark Cruz/).length).toBeGreaterThanOrEqual(3);
    // Clicking the card switches to the pending-only queue and shows its selected state.
    fireEvent.click(awaitingCard);
    expect(awaitingCard.getAttribute("aria-pressed")).toBe("true");
  });
});
