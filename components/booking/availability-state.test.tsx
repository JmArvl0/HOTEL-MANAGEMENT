// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const lookup = vi.hoisted(() => ({ availability: vi.fn(), catalog: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: async () => null }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/components/landing/public-website-nav", () => ({ PublicWebsiteNav: () => null }));
vi.mock("@/components/booking/booking-search-form", () => ({ BookingSearchForm: () => <form aria-label="Stay search" /> }));
vi.mock("@/components/booking/back-button", () => ({ BackButton: () => null }));
vi.mock("@/lib/booking", async () => ({ ...(await vi.importActual("@/lib/booking")), getAvailability: lookup.availability, getRoomCatalog: lookup.catalog }));
const { default: SearchPage } = await import("@/app/(booking)/booking/search/page");
const search = { checkIn: "2099-11-10", checkOut: "2099-11-12", guests: "2" };
const show = async () => render(await SearchPage({ searchParams: Promise.resolve(search) }));
beforeEach(() => {
  vi.clearAllMocks();
  lookup.availability.mockResolvedValue([]);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("public search distinguishes failed inventory from sold out", () => {
  it("preserves the dates and offers retry without any sold-out claim on lookup failure", async () => {
    lookup.availability.mockRejectedValue(new Error("Availability query failed"));
    await show();
    expect(screen.queryByText("No rooms available for these dates")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Choose different dates" })).toBeNull();
    expect(screen.getByText("Availability unavailable")).toBeTruthy();
    const retry = screen.getByRole("link", { name: "Retry availability" });
    expect(retry.getAttribute("href")).toBe("/booking/search?checkIn=2099-11-10&checkOut=2099-11-12&guests=2");
  });
  it("shows sold out only after a successful empty lookup", async () => {
    await show();
    expect(screen.getByText("No rooms available for these dates")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Choose different dates" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Retry availability" })).toBeNull();
  });
  it("shows actual inventory after a successful nonzero lookup", async () => {
    lookup.availability.mockResolvedValue([{ id: "king", name: "King", description: "Room", beds: "King", maxGuests: 2, sizeSqm: null, amenities: [], photos: [], nightlyRate: 100, nights: 2, subtotal: 200, availableUnits: 1 }]);
    await show();
    expect(screen.getByText("1 room type · 1 room available")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Rooms for your dates" })).toBeTruthy();
  });
});
