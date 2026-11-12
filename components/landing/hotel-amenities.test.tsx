// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_WEBSITE_CONTENT, websiteContentSchema, type WebsiteContent } from "@/lib/website-content";
import { HotelAmenities } from "./hotel-information";

afterEach(cleanup);
function facilities(count: number): WebsiteContent {
  return { ...structuredClone(DEFAULT_WEBSITE_CONTENT), amenities: Array.from({ length: count }, (_, index) => ({ id: `facility-${index}`, name: `Facility ${index + 1}`, description: `Availability and fees for facility ${index + 1}.`, enabled: true })) };
}

describe("configurable amenities and dining", () => {
  it("shows every enabled facility through eight, in saved order, without card arrows or false actions", () => {
    const content = facilities(8);
    content.amenities.splice(1, 0, { id: "closed", name: "Closed facility", description: "Unavailable", enabled: false });
    const { container } = render(<HotelAmenities content={content} />);
    const list = screen.getByRole("list", { name: "Hotel amenities" });
    expect(within(list).getAllByRole("heading").map(node => node.textContent)).toEqual(Array.from({ length: 8 }, (_, index) => `Facility ${index + 1}`));
    expect(screen.queryByText("Closed facility")).toBeNull();
    expect(container.querySelector(".hotel-amenities-overflow")).toBeNull();
    for (const card of list.children) expect(card.querySelector("a, button, .lucide-arrow-right")).toBeNull();
  });

  it("makes all 32 configured facilities reachable through a native expandable list", () => {
    const { container } = render(<HotelAmenities content={facilities(32)} />);
    const disclosure = container.querySelector("details")!;
    expect(disclosure.open).toBe(false);
    expect(within(screen.getByRole("list", { name: "Hotel amenities" })).getAllByRole("listitem")).toHaveLength(8);
    expect(disclosure.querySelectorAll("li")).toHaveLength(24);
    fireEvent.click(disclosure.querySelector("summary")!);
    expect(disclosure.open).toBe(true);
    expect(screen.getByRole("heading", { name: "Facility 32" })).toBeTruthy();
    fireEvent.click(disclosure.querySelector("summary")!);
    expect(disclosure.open).toBe(false);
  });

  it("keeps dining available when no amenities are enabled and renders changed breakfast details", () => {
    const content = facilities(0);
    content.dining = { ...content.dining, name: "Garden dining", breakfastPrice: 625, breakfastStart: "07:00", breakfastEnd: "11:30", breakfastSchedule: "Weekends", priceCaption: "Per adult", ctaText: "Check room inclusions", ctaLink: "/booking/search?guests=2" };
    render(<HotelAmenities content={content} />);
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.getByRole("article", { name: "Garden dining" })).toBeTruthy();
    expect(screen.getByText("₱625")).toBeTruthy();
    expect(screen.getByText("Weekends")).toBeTruthy();
    expect(screen.getByText("Per adult")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Check room inclusions" }).getAttribute("href")).toBe("/booking/search?guests=2");
    expect(screen.getByText("7:00 AM").getAttribute("datetime")).toBe("07:00");
  });

  it("preserves long availability and fee information and the included-breakfast state", () => {
    const content = facilities(1);
    content.amenities[0].description = "Outdoor pool, open 7:00 AM–9:00 PM. Children require adult supervision. Towels are available from reception; confirm additional charges before use.";
    content.dining.breakfastIncluded = true;
    const { container } = render(<HotelAmenities content={content} />);
    expect(container.querySelector(".hotel-amenity-card p")?.textContent).toBe(content.amenities[0].description);
    expect(container.querySelector(".hotel-amenity-hours")?.textContent).toBe("7:00 AM–9:00 PM");
    expect(screen.getByText("Included")).toBeTruthy();
    expect(screen.getByText("In the room rate")).toBeTruthy();
    expect(screen.queryByText(/₱/)).toBeNull();
  });

  it("uses the saved dining gallery photo for a client and never substitutes sample breakfast imagery", () => {
    const content = facilities(1);
    content.isDemo = false;
    content.media.gallery = [];
    const { container, rerender } = render(<HotelAmenities content={content} />);
    expect(container.querySelector(".hotel-dining-photo")).toBeNull();
    const id = "e9952208-3e66-41c4-88ef-1f96353fe857";
    content.media.gallery = [{ key: id, label: "Dining room", alt: "Actual dining room", category: "Dining" }];
    rerender(<HotelAmenities content={content} images={[{ id, alt: "Actual dining room", image_kind: "property", bytes: 100, width: 1000, height: 1000 }]} preview />);
    expect(screen.getByRole("img", { name: "Actual dining room" }).getAttribute("src")).toBe(`/api/website/images/${id}?preview=1`);
    expect(screen.queryByText("Illustrative dining concept")).toBeNull();
  });

  it("round-trips optional CMS settings while accepting older documents and rejecting off-site action paths", () => {
    expect(websiteContentSchema.safeParse(DEFAULT_WEBSITE_CONTENT).success).toBe(true);
    const content = facilities(1);
    content.amenities[0].icon = "pool";
    content.dining.breakfastSchedule = "Daily except Monday";
    content.dining.ctaLink = "/booking-policy";
    expect(websiteContentSchema.parse(content)).toEqual(content);
    for (const path of ["javascript:alert(1)", "//example.com", "/\\example.com"]) {
      expect(websiteContentSchema.safeParse({ ...content, dining: { ...content.dining, ctaLink: path } }).success).toBe(false);
    }
  });
});
