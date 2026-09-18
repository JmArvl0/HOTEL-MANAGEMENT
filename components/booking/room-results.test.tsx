// @vitest-environment jsdom
// Availability badge contracts for the shared RoomResults list: real counts,
// the 1-unit singular, the sold-out Unavailable state with Select disabled,
// browse-mode guidance, and card/details count agreement (same room object).
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { formatPeso } from "@/lib/format";
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

describe("Garden Twin premium card (shared pattern)", () => {
  const gardenTwin = {
    id: "garden-twin",
    name: "Garden Twin",
    description: "A serene garden-facing room designed for restful shared stays.",
    maxGuests: 2,
    beds: "2 twin beds",
    sizeSqm: 32,
    amenities: ["Wi-Fi", "Air conditioning", "Rain shower", "Garden view"],
    photos: ["https://images.unsplash.com/photo-a?q=80&w=1600&auto=format&fit=crop"],
    nightlyRate: 5800,
  };
  const gardenPriced = { ...gardenTwin, nights: 2, subtotal: 11600, availableUnits: 3 };

  it("renders live title, description, facts, amenities, and formatted rates", () => {
    const { container } = render(
      <RoomResults rooms={[gardenPriced]} hrefFor={(roomType) => `/booking/details?roomType=${roomType}`} />
    );
    expect(screen.getByRole("heading", { name: "Garden Twin" })).toBeTruthy();
    expect(screen.getByText("A serene garden-facing room designed for restful shared stays.")).toBeTruthy();
    expect(screen.getByText(/Up to 2/)).toBeTruthy();
    expect(screen.getByText("2 twin beds")).toBeTruthy();
    expect(screen.getByText(/32 m²/)).toBeTruthy();
    for (const amenity of gardenTwin.amenities) expect(screen.getByText(amenity)).toBeTruthy();
    // Exactly the live amenities — no overflow note at the 4-item limit.
    expect(container.querySelector(".room-amenities-more")).toBeNull();
    expect(screen.getByText(formatPeso(5800))).toBeTruthy();
    expect(screen.getByText(`${formatPeso(11600)} estimated total`)).toBeTruthy();
    expect(screen.getByText("3 available")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Select room/ }).getAttribute("href")
    ).toContain("/booking/details?roomType=Garden Twin");
  });

  it("collapses amenity overflow to a +N more note without dropping the first four", () => {
    const room = { ...gardenPriced, amenities: [...gardenTwin.amenities, "Mini fridge", "Safe"] };
    const { container } = render(<RoomResults rooms={[room]} hrefFor={() => "#book-form"} />);
    for (const amenity of gardenTwin.amenities) expect(screen.getByText(amenity)).toBeTruthy();
    const more = container.querySelector(".room-amenities-more");
    expect(more?.textContent).toBe("+2 more");
  });

  it("browse-mode Garden Twin shows the catalog rate with Choose dates and no fabricated count", () => {
    render(<RoomResults rooms={[{ ...gardenTwin }]} hrefFor={() => "#book-form"} />);
    expect(screen.getByText("Check dates")).toBeTruthy();
    expect(screen.getByText(formatPeso(5800))).toBeTruthy();
    expect(screen.getByRole("link", { name: /Choose dates/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Select room/ })).toBeNull();
  });

  it("sold-out Garden Twin keeps View details with Select disabled", () => {
    const { container } = render(<RoomResults rooms={[{ ...gardenPriced, availableUnits: 0 }]} hrefFor={() => "#book-form"} />);
    const chip = container.querySelector(".room-availability-chip")!;
    expect(chip.textContent).toBe("Unavailable");
    expect(chip.className).toContain("is-off");
    expect((screen.getByRole("button", { name: "Unavailable" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("link", { name: /Select room/ })).toBeNull();
    expect(screen.getByRole("button", { name: "View details" })).toBeTruthy();
  });
});
