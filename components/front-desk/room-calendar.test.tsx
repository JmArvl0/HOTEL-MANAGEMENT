// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import RoomCalendar from "./room-calendar";
import type { RackReservation, RackRoom } from "@/lib/room-rack";

afterEach(cleanup);
const room: RackRoom = { id: "r101", number: "101", type: "Deluxe", floor: 1, status: "available", housekeeping: "clean" };
const stay: RackReservation = { id: "current", guest_name: "Mariel Santos", confirmation_number: "H-041", room_id: "r101", room_type: "Deluxe", check_in: "2026-11-04", check_out: "2026-11-05", status: "checked_in" };
const base = { rooms: [room], from: "2026-11-04", days: 7, today: "2026-11-04", blockedRoomIds: new Set<string>(), onSelectRoom: vi.fn(), onOpenReservation: vi.fn() };

describe("room assignment calendar", () => {
  it("shows current and next guests on adjacent nights, excluding checkout day", () => {
    const open = vi.fn();
    render(<RoomCalendar {...base} onOpenReservation={open} reservations={[stay, { ...stay, id: "next", guest_name: "Paolo Reyes", check_in: "2026-11-05", check_out: "2026-11-07", status: "confirmed" }]} />);
    const current = screen.getByRole("button", { name: /Mariel Santos.*room 101/ });
    const next = screen.getByRole("button", { name: /Paolo Reyes.*room 101/ });
    expect(current.style.gridColumn).toBe("1 / span 1");
    expect(next.style.gridColumn).toBe("2 / span 2");
    expect(current.style.gridRow).toBe(next.style.gridRow);
    fireEvent.click(next);
    expect(open).toHaveBeenCalledWith("next");
    expect(screen.getAllByRole("columnheader")).toHaveLength(8);
    expect(screen.getByText("Today")).toBeTruthy();
  });

  it("uses recorded room-move segments rather than placing the whole stay in the final room", () => {
    render(<RoomCalendar {...base} rooms={[room, { ...room, id: "r102", number: "102" }]} reservations={[{ ...stay, room_id: "r102", check_out: "2026-11-07" }]} assignments={[
      { id: "old", reservation_id: "current", room_id: "r101", check_in: "2026-11-04", check_out: "2026-11-07", effective_from: "2026-11-04", effective_to: "2026-11-05", status: "reassigned" },
      { id: "new", reservation_id: "current", room_id: "r102", check_in: "2026-11-04", check_out: "2026-11-07", effective_from: "2026-11-05", effective_to: null, status: "active" },
    ]} />);
    expect(screen.getByRole("button", { name: /Mariel Santos.*room 101/ }).style.gridColumn).toBe("1 / span 1");
    expect(screen.getByRole("button", { name: /Mariel Santos.*room 102/ }).style.gridColumn).toBe("2 / span 2");
  });

  it("keeps overlapping allocations visible in separate lanes", () => {
    render(<RoomCalendar {...base} reservations={[{ ...stay, check_out: "2026-11-07" }, { ...stay, id: "overlap", guest_name: "Aileen Tan", check_out: "2026-11-06" }]} />);
    expect(screen.getByRole("button", { name: /Mariel Santos.*room 101/ }).style.gridRow).toBe("1");
    expect(screen.getByRole("button", { name: /Aileen Tan.*room 101/ }).style.gridRow).toBe("2");
  });

  it("keeps unassigned bookings out of physical room lanes and exposes their review action", () => {
    const open = vi.fn();
    render(<RoomCalendar {...base} onOpenReservation={open} reservations={[{ ...stay, status: "confirmed", room_id: null }]} />);
    expect(screen.queryByRole("button", { name: /Mariel Santos.*room 101/ })).toBeNull();
    fireEvent.click(screen.getByText(/booking awaiting room assignment/));
    fireEvent.click(screen.getByRole("button", { name: "Review H-041" }));
    expect(open).toHaveBeenCalledWith("current");
  });
});
