// @vitest-environment jsdom
// Render-layer tests for the fused Room Rack & Reservations panel: queue vs
// chart rendering, click-to-assign RPC call, dirty-cell dispatch dialog, and
// folio routing. The rack hook is stubbed — no network, no mutation.
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import FrontOfficeRack from "./fused-room-rack-panel";
import * as hook from "@/hooks/use-front-office-rack";

vi.mock("@/hooks/use-front-office-rack", () => ({
  useFrontOfficeRack: vi.fn(),
}));

const rooms = [
  { id: "RM-101", number: "101", floor: 1, wing: null, type: "Deluxe King", status: "available", housekeeping: "clean" },
  { id: "RM-102", number: "102", floor: 1, wing: null, type: "Deluxe King", status: "dirty", housekeeping: "dirty" },
  { id: "RM-103", number: "103", floor: 1, wing: null, type: "Deluxe King", status: "maintenance", housekeeping: "dirty" },
];
const reservations = [
  {
    id: "RSV-A", confirmation_number: "HVN-1", guest_name: "Reyes", room_type: "Deluxe King",
    room_id: null, room_number: null, check_in: "2026-09-22", check_out: "2026-09-24",
    status: "confirmed", payment_status: "partial", identity_status: "verified", folio_balance: 0,
  },
  {
    id: "RSV-B", confirmation_number: "HVN-2", guest_name: "Cruz", room_type: "Deluxe King",
    room_id: "RM-101", room_number: "101", check_in: "2026-09-24", check_out: "2026-09-26",
    status: "checked_in", payment_status: "paid", identity_status: "verified", folio_balance: 0,
  },
];

function stubRack() {
  vi.mocked(hook.useFrontOfficeRack).mockReturnValue({
    from: "2026-09-22",
    days: 7,
    setDays: vi.fn(),
    shift: vi.fn(),
    goToday: vi.fn(),
    snapshot: { from: "2026-09-22", days: 7, rooms, reservations },
    loading: false,
    error: "",
    reload: vi.fn(async () => {}),
  });
}

beforeEach(stubRack);
afterEach(cleanup);

function renderRack(role = "front_desk") {
  const props = { role, onOpenFolio: vi.fn(), onCheckIn: vi.fn() };
  render(<FrontOfficeRack {...props} />);
  return props;
}

describe("FrontOfficeRack", () => {
  it("lists unassigned arrivals and renders room rows with bars", () => {
    renderRack();
    expect(screen.getByText("Unassigned arrivals (1)")).toBeTruthy();
    expect(screen.getByText("Reyes")).toBeTruthy();
    // Cruz is assigned — not in the queue, but on the chart as a bar.
    expect(screen.getByRole("gridcell", { name: /Cruz in room 101/ })).toBeTruthy();
    expect(screen.getAllByText("Out of service").length).toBeGreaterThan(0);
  });

  it("opens the assign confirm on card select + clean cell click, then posts the assign route", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchMock);
    const props = renderRack();
    fireEvent.click(screen.getByText("Reyes"));
    // Click the clean room's cell container (first .rack-cells).
    fireEvent.click(document.querySelectorAll(".rack-cells")[0]);
    expect(screen.getByText("Assign room 101?")).toBeTruthy();
    fireEvent.click(screen.getByText("Assign & check in"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/front-desk/reservations/RSV-A/assign",
      expect.objectContaining({ method: "POST" })
    ));
    expect(props.onCheckIn).toHaveBeenCalledWith("RSV-A");
    vi.unstubAllGlobals();
  });

  it("routes bar clicks to the folio and dirty cells to dispatch", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchMock);
    const props = renderRack();
    fireEvent.click(screen.getByRole("gridcell", { name: /Cruz in room 101/ }));
    expect(props.onOpenFolio).toHaveBeenCalledWith("RSV-B");
    fireEvent.click(screen.getByRole("button", { name: /Room 102 dirty/ }));
    expect(screen.getByText("Dispatch reclean for room 102?")).toBeTruthy();
    fireEvent.click(screen.getByText("Dispatch reclean"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/resources/housekeeping_tasks",
      expect.objectContaining({ method: "POST" })
    ));
    vi.unstubAllGlobals();
  });

  it("blocks assignment to a dirty room with a notice, without calling assign", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchMock);
    renderRack();
    fireEvent.click(screen.getByText("Reyes"));
    // Dirty room's cell container is the second .rack-cells; a front-desk click
    // opens dispatch instead of assign.
    fireEvent.click(document.querySelectorAll(".rack-cells")[1]);
    expect(screen.getByText("Dispatch reclean for room 102?")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("keeps manager/owner read-only on assignment with a friendly notice", () => {
    renderRack("manager");
    fireEvent.click(screen.getByText("Reyes"));
    fireEvent.click(document.querySelectorAll(".rack-cells")[0]);
    expect(screen.getByText(/Front Desk operations/)).toBeTruthy();
    expect(screen.queryByText("Assign room 101?")).toBeNull();
  });
});
