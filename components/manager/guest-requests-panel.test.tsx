// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import GuestRequestsPanel from "./guest-requests-panel";

// Exercise the production component with responses at its HTTP boundary.
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
  it("lists the oldest pending submission first and opens just one submission in the detail pane", async () => {
    mockFetch([
      submission({ id: "new", batch_id: "new", request: "Extra pillows", created_at: "2026-09-07T04:00:00Z",
        reservation: { confirmation_number: "HVN-NEW", guest_name: "Mara Lim", room_number: "208" } }),
      submission({ request_type: "extra_towels", request: "Extra towels: Two bath towels, please." }),
    ], []);
    render(<GuestRequestsPanel role="front_desk" />);
    const queue = await screen.findByRole("region", { name: "Submission queue" });
    const detail = screen.getByRole("complementary", { name: "Submission details" });
    const oldest = await within(queue).findByRole("button", { name: /Mark Cruz/ });
    expect(oldest.getAttribute("aria-current")).toBe("true");
    expect(within(detail).getByText("Two bath towels, please.")).toBeTruthy();
    fireEvent.click(within(queue).getByRole("button", { name: /Mara Lim/ }));
    expect(within(detail).getByRole("heading", { name: "Mara Lim" })).toBeTruthy();
    expect(within(detail).queryByText("Two bath towels, please.")).toBeNull();
  });

  it("keeps the selected submission and live stock visible to Manager without decision actions", async () => {
    mockFetch([submission()], [stock(), stock({ id: "i2", name: "Shampoo 40ml", quantity: 42, reorder_point: 80, unit: "bottles", status: "low" })]);
    render(<GuestRequestsPanel role="manager" />);
    const rail = screen.getByRole("complementary", { name: "Submission details" });
    await within(rail).findByRole("heading", { name: "Mark Cruz" });
    fireEvent.click(within(rail).getByText("Supply snapshot"));
    await within(rail).findByText("Bath towels");
    expect(rail.textContent).toContain("Bath towels");
    expect(rail.textContent).toContain("Shampoo 40ml");
    expect(screen.getByText("1 to reorder")).toBeTruthy();
    // Manager sees the queue read-only — no review actions.
    expect(screen.queryByRole("button", { name: "Approve submission" })).not.toBeTruthy();
    expect(screen.queryByRole("button", { name: "Decline submission" })).not.toBeTruthy();
  });

  it("shows Approve/Decline on pending submissions for Front Desk only", async () => {
    mockFetch([submission()], [stock()]);
    render(<GuestRequestsPanel role="front_desk" />);
    expect(await screen.findByRole("button", { name: "Approve submission" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Decline submission" })).toBeTruthy();
  });

  it("counts only active lines in a batch decision and follows the approved batch to Open work", async () => {
    let requests = [
      submission(),
      submission({ id: "withdrawn", request: "Baby crib", approval_status: "withdrawn", status: "cancelled" }),
    ];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/review") && init?.method === "POST") {
        requests = requests.map(item => item.id === "gr1" ? { ...item, approval_status: "approved" } : item);
        return Response.json({ data: { reviewedCount: 1 } });
      }
      return Response.json({ data: url.endsWith("/inventory") ? [] : requests });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<GuestRequestsPanel role="front_desk" />);
    const filters = screen.getByRole("group", { name: "Submission filters" });
    await screen.findByRole("heading", { name: "Mark Cruz" });
    fireEvent.click(within(filters).getByRole("button", { name: /Awaiting approval/ }));
    fireEvent.click(screen.getByRole("button", { name: "Approve submission" }));
    const dialog = await screen.findByRole("dialog", { name: "Approve submission" });
    expect(within(dialog).getByText(/Approve 1 active request from Mark Cruz/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve and route" }));
    const detail = screen.getByRole("complementary", { name: "Submission details" });
    expect(await within(detail).findByText("0 of 1 done")).toBeTruthy();
    expect(within(detail).getByText("Withdrawn")).toBeTruthy();
    expect(within(filters).getByRole("button", { name: /Open work/ }).getAttribute("aria-pressed")).toBe("true");
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/review")).map(([, init]) => JSON.parse(String(init?.body))))
      .toEqual([{ batchId: "b1", decision: "approve" }]);
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
    expect(screen.queryByRole("button", { name: "Approve submission" })).not.toBeTruthy();
    expect(screen.queryByRole("button", { name: "Decline submission" })).not.toBeTruthy();

    const escalationButtons = screen.getAllByRole("button", { name: "Escalate" });
    fireEvent.click(escalationButtons[0]);
    expect(onEscalate).toHaveBeenCalledWith(expect.objectContaining({ id: "gr1", reservation_id: "r1" }));
  });

  it("keeps the stock disclosure available on desktop when the queue is empty", async () => {
    mockFetch([], [stock()]);
    render(<GuestRequestsPanel role="manager" />);
    await waitFor(() => expect(screen.getByText("No submissions")).toBeTruthy());
    expect(within(screen.getByRole("complementary", { name: "Submission details" })).getByText("Supply snapshot")).toBeTruthy();
  });

  it("keeps approval and fulfillment separate: approved items stay Open until worked", async () => {
    mockFetch([
      submission({ approval_status: "approved" }),
      submission({ id: "gr2", request: "Extra pillows", approval_status: "approved", status: "completed" }),
    ], [stock()]);
    render(<GuestRequestsPanel role="housekeeping" onEscalate={() => {}} />);
    await waitFor(() => expect(screen.getByText("Extra towels")).toBeTruthy());
    // Approval badge present, yet the open item still reads Open with a Start action.
    const detail = screen.getByRole("complementary", { name: "Submission details" });
    expect(within(detail).getByText("Approved")).toBeTruthy();
    expect(screen.getByText("1 of 2 done")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start" })).toBeTruthy();
    expect(screen.queryByText("Fulfilled")).toBeNull();
  });

  it("labels completion within the Housekeeping scope", async () => {
    mockFetch([
      submission({ approval_status: "approved", status: "completed" }),
      submission({ id: "gr2", request: "Extra pillows", approval_status: "approved", status: "completed" }),
    ], [stock()]);
    render(<GuestRequestsPanel role="housekeeping" onEscalate={() => {}} />);
    expect(await within(screen.getByRole("complementary", { name: "Submission details" })).findByText("Housekeeping done")).toBeTruthy();
    // Nothing left to start or complete.
    expect(screen.queryByRole("button", { name: "Start" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Complete" })).toBeNull();
  });

  it("starts and completes the owning department's items through the progress route", async () => {
    const fetchMock = mockFetch([submission({ approval_status: "approved" })], [stock()]);
    render(<GuestRequestsPanel role="housekeeping" onEscalate={() => {}} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Start" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    await waitFor(() => expect(screen.getByText("Request started.")).toBeTruthy());
    const startCall = fetchMock.mock.calls
      .map((call) => call as unknown as [string, RequestInit?])
      .find(([url]) => String(url).includes("/api/guest-requests/gr1/progress"));
    expect(startCall).toBeTruthy();
    expect(JSON.parse(String(startCall?.[1]?.body))).toEqual({ action: "start" });
  });

  it("offers no Start/Complete to other departments, pending items, or managers", async () => {
    // Front Desk sees a housekeeping-department item: read-only for them.
    mockFetch([submission({ approval_status: "approved" })], [stock()]);
    render(<GuestRequestsPanel role="front_desk" />);
    await waitFor(() => expect(screen.getByText("Extra towels")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Start" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Complete" })).toBeNull();
    cleanup();

    // Pending items have no fulfillment actions even for the owning department.
    mockFetch([submission()], [stock()]);
    render(<GuestRequestsPanel role="housekeeping" onEscalate={() => {}} />);
    expect(await screen.findByText("No submissions")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Start" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Complete" })).toBeNull();
    cleanup();

    // Managers stay read-only on approved items too.
    mockFetch([submission({ approval_status: "approved" })], [stock()]);
    render(<GuestRequestsPanel role="manager" />);
    await waitFor(() => expect(screen.getByText("Extra towels")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Start" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Complete" })).toBeNull();
  });

  it("uses the queue filters as the single source of counts", async () => {
    mockFetch([
      submission(),
      submission({ id: "gr2", batch_id: "b2", approval_status: "approved", status: "in_progress" }),
      submission({ id: "gr3", batch_id: "b3", approval_status: "rejected" }),
    ], [stock()]);
    render(<GuestRequestsPanel role="front_desk" />);
    await waitFor(() => expect(screen.getAllByText(/Mark Cruz/).length).toBeGreaterThan(0));
    const summary = screen.getByRole("group", { name: "Submission filters" });
    expect(summary.textContent).toContain("Awaiting approval");
    expect(summary.textContent).toContain("Open work");
    const awaiting = within(summary).getByRole("button", { name: /Awaiting approval/ });
    expect(awaiting.querySelector("b")?.textContent).toBe("1");
    const queue = screen.getByRole("region", { name: "Submission queue" });
    expect(within(queue).getAllByRole("button", { name: /Mark Cruz/ })).toHaveLength(3);
    fireEvent.click(awaiting);
    expect(awaiting.getAttribute("aria-pressed")).toBe("true");
    expect(within(queue).getAllByRole("button", { name: /Mark Cruz/ })).toHaveLength(1);
  });
});
