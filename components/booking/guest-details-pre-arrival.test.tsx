// @vitest-environment jsdom
// Guest Details pre-arrival section: dynamic Manager-linked amenities plus
// independent service constants — never dummy data, never stock quantities.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GuestDetailsForm } from "./guest-details-form";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const base = {
  roomType: "King",
  checkIn: "2026-09-20",
  checkOut: "2026-09-22",
  guests: 2,
  checkInFrom: "2:00 PM",
  defaults: {} as Record<string, string>,
};

const live = {
  amenities: [
    { value: "extra_towels", label: "Extra towels", inventoryItemId: "ITM-1" },
    { value: "baby_crib", label: "Baby crib", inventoryItemId: "ITM-9" },
  ],
  services: [
    { value: "high_floor_quiet", label: "High floor / quiet room request" },
    { value: "early_check_in", label: "Early check-in request" },
    { value: "celebration", label: "Celebration arrangement request" },
  ],
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  push.mockClear();
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ token: "hold-token" }) }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("pre-arrival request options", () => {
  it("renders live amenities grouped above the independent services", () => {
    const { container } = render(<GuestDetailsForm {...base} preArrival={live} />);
    expect(screen.getByText("Amenities & items")).toBeTruthy();
    expect(screen.getByText("Special requests")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Extra towels" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Early check-in request" })).toBeTruthy();
    expect(container.textContent).not.toMatch(/24|stock/i);
  });

  it("shows the safe state instead of dummy amenities when none are offered", () => {
    render(<GuestDetailsForm {...base} preArrival={{ amenities: [], services: live.services }} />);
    expect(screen.getByText("Request items are temporarily unavailable.")).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: "Extra towels" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "Extra pillows" })).toBeNull();
    // Services stand on their own source.
    expect(screen.getByRole("checkbox", { name: "Early check-in request" })).toBeTruthy();
  });

  it("submits checked live options and ignores stale prefill values", async () => {
    const { container } = render(
      <GuestDetailsForm {...base} preArrival={live} initialRequests={["extra_towels", "extra_pillows"]} />
    );
    // Stale value (no longer offered) renders no checkbox at all.
    expect(screen.queryByRole("checkbox", { name: "Extra pillows" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Expected arrival"), { target: { value: "15:00" } });
    fireEvent.submit(container.querySelector("form")!);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(payload.requestOptions).toEqual(["extra_towels"]);
  });
});
