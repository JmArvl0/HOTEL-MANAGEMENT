// @vitest-environment jsdom
// Render-layer tests for the Room Board: type grouping, card states, the
// room action sheet, assign-picker RPC call, dirty-cell dispatch dialog, and
// folio routing. The rack hook is stubbed — no network, no mutation.
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import FrontOfficeRack from "./fused-room-rack-panel";
import * as hook from "@/hooks/use-front-office-rack";

vi.mock("@/hooks/use-front-office-rack", () => ({
  useFrontOfficeRack: vi.fn(),
}));

const rooms = [
  { id: "RM-101", number: "101", floor: 1, wing: null, type: "Deluxe King", status: "available", housekeeping: "clean" },
  { id: "RM-102", number: "102", floor: 1, wing: null, type: "Deluxe King", status: "dirty", housekeeping: "dirty" },
  { id: "RM-103", number: "103", floor: 1, wing: null, type: "Deluxe King", status: "maintenance", housekeeping: "dirty" },
  { id: "RM-104", number: "104", floor: 1, wing: null, type: "Deluxe King", status: "available", housekeeping: "clean" },
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
    setFrom: vi.fn(),
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
  const props = {
    role,
    onOpenFolio: vi.fn(),
    onCheckIn: vi.fn(),
    onViewRoom: vi.fn(),
    onNewReservation: vi.fn(),
    onCheckOut: vi.fn(),
    onScan: vi.fn(),
    notify: vi.fn(),
  };
  render(<FrontOfficeRack {...props} />);
  return props;
}

describe("FrontOfficeRack", () => {
  it("groups rooms by live type and renders card states with guests", () => {
    renderRack();
    expect(screen.getByText("Deluxe King")).toBeTruthy();
    expect(screen.getByText("rooms")).toBeTruthy();
    expect(screen.getByText(/1 occupied/)).toBeTruthy();
    expect(screen.getByText("Room 101")).toBeTruthy();
    expect(screen.getAllByText("Floor 1").length).toBe(3);
    expect(screen.getByText("Floor 1 · Maintenance")).toBeTruthy();
    expect(screen.getByText("Guest · Cruz")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Room 101, floor 1, Occupied/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Room 102, floor 1, Dirty/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Room 103, floor 1, Out of service/ })).toBeTruthy();
    expect(screen.getByText("Guest · Cruz")).toBeTruthy();
    expect(screen.getByText("Available")).toBeTruthy();
  });

  it("lands on the deep-linked rack tab from overview shortcuts", () => {
    render(<FrontOfficeRack role="front_desk" onOpenFolio={vi.fn()} onCheckIn={vi.fn()} onViewRoom={vi.fn()} initialView="departures" initialTab="departures" />);
    const views = screen.getByRole("tablist", { name: "Room reservations views" });
    expect(within(views).getByRole("tab", { name: "Departures Today" }).getAttribute("aria-selected")).toBe("true");
  });

  it("opens room details directly on card click with folio actions attached", () => {
    const props = renderRack();
    fireEvent.click(screen.getByRole("button", { name: /Room 101, floor 1, Occupied/ }));
    expect(props.onViewRoom).toHaveBeenCalledWith(expect.objectContaining({ id: "RM-101" }), expect.any(Array));
    expect(screen.queryByText("View room details")).toBeNull();
  });

  it("routes the in-house stay to the folio from the attached detail actions", () => {
    const props = renderRack();
    fireEvent.click(screen.getByRole("button", { name: /Room 101, floor 1, Occupied/ }));
    const actions = props.onViewRoom.mock.calls[0][1] as { label: string; onSelect: () => void }[];
    actions.find((a) => a.label === "View folio")!.onSelect();
    expect(props.onOpenFolio).toHaveBeenCalledWith("RSV-B");
  });

  it("routes dirty cards to dispatch and posts the reclean task", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchMock);
    const props = renderRack();
    fireEvent.click(screen.getByRole("button", { name: /Room 102, floor 1, Dirty/ }));
    const actions = props.onViewRoom.mock.calls[0][1] as { label: string; onSelect: () => void }[];
    act(() => { actions.find((a) => a.label === "Dispatch reclean")!.onSelect(); });
    expect(screen.getByText("Dispatch reclean for room 102?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dispatch reclean" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/resources/housekeeping_tasks",
      expect.objectContaining({ method: "POST" })
    ));
    vi.unstubAllGlobals();
  });

  it("offers no assign action on a dirty room", () => {
    const props = renderRack();
    fireEvent.click(screen.getByRole("button", { name: /Room 102, floor 1, Dirty/ }));
    const actions = props.onViewRoom.mock.calls[0][1] as { label: string }[];
    expect(actions.some((a) => a.label === "Assign arrival…")).toBe(false);
  });

  it("uses the standard confirm dialog for assign with kit buttons", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchMock);
    const props = renderRack();
    fireEvent.click(screen.getByRole("button", { name: /Room 104, floor 1, Clean/ }));
    const actions = props.onViewRoom.mock.calls[0][1] as { label: string; onSelect: () => void }[];
    act(() => { actions.find((a) => a.label === "Assign arrival…")!.onSelect(); });
    fireEvent.click(screen.getByRole("option", { name: /Reyes/ }));
    const dialog = screen.getByRole("dialog", { name: "Assign room 104?" });
    const cancel = within(dialog).getByRole("button", { name: "Cancel" });
    const confirm = within(dialog).getByRole("button", { name: "Assign & check in" });
    expect(cancel.className).toContain("btn-soft");
    expect(confirm.className).toContain("btn-accent");
    fireEvent.click(confirm);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/front-desk/reservations/RSV-A/assign",
      expect.objectContaining({ method: "POST" })
    ));
    expect(props.onCheckIn).toHaveBeenCalledWith("RSV-A");
    vi.unstubAllGlobals();
  });

  it("uses the standard footer buttons for dispatch reclean", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchMock);
    const props = renderRack();
    fireEvent.click(screen.getByRole("button", { name: /Room 102, floor 1, Dirty/ }));
    const actions = props.onViewRoom.mock.calls[0][1] as { label: string; onSelect: () => void }[];
    act(() => { actions.find((a) => a.label === "Dispatch reclean")!.onSelect(); });
    const dialog = screen.getByRole("dialog", { name: "Dispatch reclean for room 102?" });
    expect(within(dialog).getByText("Creates an urgent housekeeping task. The turnover queue owns completion.")).toBeTruthy();
    const cancel = within(dialog).getByRole("button", { name: "Cancel" });
    const confirm = within(dialog).getByRole("button", { name: "Dispatch reclean" });
    expect(cancel.className).toContain("btn-soft");
    expect(confirm.className).toContain("btn-accent");
    fireEvent.click(confirm);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/resources/housekeeping_tasks",
      expect.objectContaining({ method: "POST" })
    ));
    vi.unstubAllGlobals();
  });

  it("keeps manager read-only on assignment with a friendly notice", () => {
    const props = renderRack("manager");
    fireEvent.click(screen.getByRole("button", { name: /Room 104, floor 1, Clean/ }));
    const actions = props.onViewRoom.mock.calls[0][1] as { label: string; onSelect: () => void }[];
    expect(actions.some((a) => a.label === "Assign arrival…")).toBe(false);
    expect(actions.some((a) => a.label === "Check in guest")).toBe(false);
    actions.find((a) => a.label === "Assignment is Front Desk only")!.onSelect();
    expect(screen.queryByText(/Front Desk operations/)).toBeNull();
  });

  it("sends notices to the toast stack with tones, not inline text", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const props = renderRack("manager");
      fireEvent.click(screen.getByRole("button", { name: /Room 104, floor 1, Clean/ }));
      const actions = props.onViewRoom.mock.calls[0][1] as { label: string; onSelect: () => void }[];
      actions.find((a) => a.label === "Assignment is Front Desk only")!.onSelect();
      expect(props.notify).toHaveBeenCalledWith(expect.stringMatching(/Front Desk operations/), "info");
      expect(document.querySelector(".rack-notice")).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("falls back to inline text when unwired", () => {
    render(<FrontOfficeRack role="manager" onOpenFolio={vi.fn()} onCheckIn={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Room 104, floor 1, Clean/ }));
    fireEvent.click(screen.getByText("Assignment is Front Desk only"));
    expect(screen.getByText(/Front Desk operations/)).toBeTruthy();
  });

  it("offers a single range control with no steppers, presets, or captions", () => {
    renderRack();
    const trigger = screen.getByRole("button", { name: /Stay window, currently/ });
    expect(trigger.textContent).toContain("09/22");
    expect(screen.queryByRole("button", { name: "Today" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Previous period" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Next period" })).toBeNull();
    expect(screen.queryByText("Room Type")).toBeNull();
    expect(screen.queryByText("Start date")).toBeNull();
    fireEvent.click(trigger);
    const fromInput = screen.getByLabelText("From") as HTMLInputElement;
    const toInput = screen.getByLabelText("To") as HTMLInputElement;
    expect(fromInput.type).toBe("date");
    expect(toInput.type).toBe("date");
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    nativeSetter!.call(toInput, "2026-09-24");
    fireEvent.input(toInput);
    const calls = vi.mocked(hook.useFrontOfficeRack).mock.results;
    expect(calls.at(-1)?.value.setFrom).toHaveBeenCalledWith("2026-09-22");
    expect(calls.at(-1)?.value.setDays).toHaveBeenCalledWith(3);
  });

  it("keeps the ops rail visible in reservation views with a working search", async () => {
    renderRack();
    const views = screen.getByRole("tablist", { name: "Room reservations views" });
    fireEvent.click(within(views).getByRole("tab", { name: "Current Guests" }));
    expect(screen.getByRole("complementary", { name: "Front office operations" })).toBeTruthy();
    const searchSection = screen.getByRole("region", { name: "Reservation search" });
    expect(searchSection.tagName).toBe("SECTION");
    expect(searchSection.closest(".board-tabs")).toBeNull();
    const search = screen.getByLabelText("Search reservations") as HTMLInputElement;
    fireEvent.change(search, { target: { value: "no-such-guest" } });
    await waitFor(() => expect(screen.getByText("No guests in house")).toBeTruthy());
  });

  it("lists Scan QR first in Quick Actions and fires the scanner", () => {
    const props = renderRack();
    const rail = screen.getByRole("complementary", { name: "Front office operations" });
    const scan = within(rail).getByRole("button", { name: "Scan QR" });
    const items = within(rail).getAllByRole("listitem");
    expect(items[0].textContent).toContain("Scan QR");
    fireEvent.click(scan);
    expect(props.onScan).toHaveBeenCalledTimes(1);
  });

  it("orders view tabs with the board default and switches to reservation views", () => {
    renderRack();
    const views = screen.getByRole("tablist", { name: "Room reservations views" });
    const order = within(views).getAllByRole("tab").map((t) => t.textContent?.trim());
    expect(order).toEqual([
      "Room Reservations", "All Reservations", "Upcoming Arrivals", "Current Guests", "Departures Today", "Completed",
    ]);
    expect(within(views).getByRole("tab", { name: "Room Reservations" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(within(views).getByRole("tab", { name: "Current Guests" }));
    const panel = document.querySelector(".board-tabs") as HTMLElement;
    expect(within(panel).getByText("Cruz")).toBeTruthy();
    expect(views).toBeTruthy();
  });

  it("loads full history for All and Completed, excluding cancelled from Completed", async () => {
    const history = [
      { id: "RSV-DONE", confirmation_number: "HVN-9", guest_name: "Done", room_type: "Deluxe King", room_id: "RM-101", room_number: "101", check_in: "2026-09-01", check_out: "2026-09-03", status: "checked_out" },
      { id: "RSV-CX", confirmation_number: "HVN-8", guest_name: "Cancelled", room_type: "Deluxe King", room_id: null, room_number: null, check_in: "2026-09-01", check_out: "2026-09-03", status: "cancelled" },
    ];
    vi.stubGlobal("fetch", vi.fn(async (url: unknown) =>
      String(url).includes("/api/resources/reservations")
        ? { ok: true, json: async () => ({ data: history }) }
        : { ok: true, json: async () => ({}) }
    ));
    try {
      renderRack();
      const views = screen.getByRole("tablist", { name: "Room reservations views" });
      fireEvent.click(within(views).getByRole("tab", { name: "All Reservations" }));
      expect(screen.getByRole("tab", { name: "All Reservations" }).getAttribute("aria-selected")).toBe("true");
      await waitFor(() => expect(document.querySelector(".board-tabs")).toBeTruthy());
      fireEvent.click(within(views).getByRole("tab", { name: "Completed" }));
      const panel = document.querySelector(".board-tabs") as HTMLElement;
      expect(within(panel).getByText("Done")).toBeTruthy();
      expect(within(panel).queryByText("Cancelled")).toBeNull();
      fireEvent.click(within(views).getByRole("tab", { name: "All Reservations" }));
      expect(within(panel).getAllByText("Cancelled").length).toBeGreaterThanOrEqual(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
