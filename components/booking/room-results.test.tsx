// @vitest-environment jsdom
// Availability badge contracts for the shared RoomResults list: real counts,
// the 1-unit singular, the sold-out Unavailable state with Select disabled,
// browse-mode guidance, and card/details count agreement (same room object).
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RoomResults } from "./room-results";

const base = {
  id: "deluxe-king",
  name: "Deluxe King",
  description: "King bed, clean contemporary finishes.",
  maxGuests: 2,
  beds: "1 king bed",
  sizeSqm: 32,
  amenities: ["Free Wi-Fi", "Air conditioning"],
  photos: ["https://images.unsplash.com/photo-a?q=80&w=1600&auto=format&fit=crop"],
  nightlyRate: 6400,
};

const priced = (availableUnits: number) => ({ ...base, nights: 2, subtotal: 12800, availableUnits });
const browse = { ...base };

// Modal reads matchMedia during render; jsdom does not provide it.
beforeEach(() => {
  if (typeof window.matchMedia !== "function") {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    });
  }
});
afterEach(cleanup);

describe("availability badges", () => {
  it("shows the real count with correct grammar", () => {
    render(<RoomResults rooms={[priced(4)]} hrefFor={() => "#book-form"} />);
    expect(screen.getByText("4 available")).toBeTruthy();
    cleanup();
    render(<RoomResults rooms={[priced(1)]} hrefFor={() => "#book-form"} />);
    expect(screen.getByText("1 available")).toBeTruthy();
  });

  it("shows Unavailable with Select disabled at zero units, keeping View Details", () => {
    const { container } = render(<RoomResults rooms={[priced(0)]} hrefFor={() => "#book-form"} />);
    const chip = container.querySelector(".room-availability-chip")!;
    expect(chip.textContent).toBe("Unavailable");
    expect(chip.className).toContain("is-off");
    const action = screen.getByRole("button", { name: "Unavailable" });
    expect((action as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("link", { name: /Select room/ })).toBeNull();
    expect(screen.getByRole("button", { name: "View details" })).toBeTruthy();
  });

  it("offers Select room only when units remain", () => {
    render(<RoomResults rooms={[priced(2)]} hrefFor={(roomType) => `/booking/details?roomType=${roomType}`} />);
    expect(screen.getByRole("link", { name: /Select room/ }).getAttribute("href")).toContain("/booking/details");
  });

  it("shows Check dates guidance before any availability search", () => {
    render(<RoomResults rooms={[browse]} hrefFor={() => "#book-form"} />);
    expect(screen.getByText("Check dates")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Choose dates/ })).toBeTruthy();
    expect(screen.queryByText(/available/)).toBeNull();
  });

  it("View Details reports the same count as the card", () => {
    render(<RoomResults rooms={[priced(0)]} hrefFor={() => "#book-form"} />);
    fireEvent.click(screen.getByRole("button", { name: "View details" }));
    expect(screen.getByText("0 rooms available for your dates")).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Deluxe King photo gallery" })).toBeNull();
  });
});
