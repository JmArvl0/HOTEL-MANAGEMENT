// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LocationSections } from "./location-sections";
import { LocationHighlights, LocationPhotoCard } from "./location-showcase";
import { EMPTY_LOCATION, type LocationContent } from "@/lib/location-content";
import { testHotel, testPlace } from "@/tests/fixtures/location-content";

const content: LocationContent = {
  ...EMPTY_LOCATION,
  hotel: testHotel,
  categories: [{ id: "dining", name: "Dining", slug: "dining", status: "published", sort_order: 0, version: 0, updated_at: "" }],
  places: [
    { ...testPlace, id: "dining-place", category_id: "dining", name: "A local café", description: "Coffee, fresh pastries, and a sunlit corner to start your day.", sample_image: "cafe" },
    { ...testPlace, id: "park", name: "Rizal Park", description: "Explore Rizal Park and its monument in Ermita, Manila. Check current visitor information before you go.", sample_image: "rizal", featured: true },
    { ...testPlace, id: "museum", name: "Manila museum district", description: "Discover the National Museum complex in Manila. The photograph shows the National Museum of Fine Arts. Check opening hours and admission information with the museum.", sample_image: "museum" },
    { ...testPlace, id: "extra", name: "An edited place", description: "Saved description", sample_image: null },
  ],
};
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event("close")); };
});
afterEach(cleanup);

describe("reference location presentation", () => {
  it("shows three demo highlights in reference order with honest sample disclosure", () => {
    const { container } = render(<LocationHighlights content={content} />);
    expect(screen.getAllByRole("heading", { level: 4 }).map(node => node.textContent)).toEqual(["Rizal Park", "National Museum", "Restaurants nearby"]);
    expect(screen.getByText("3 min walk")).toBeTruthy();
    expect(screen.getByText(/Walking times are sample values/)).toBeTruthy();
    expect(container.querySelectorAll("article")).toHaveLength(3);
  });
  it("preserves client content, reviewed distances and configured navigation", () => {
    render(<LocationHighlights content={{ ...content, hotel: { ...testHotel, is_demo: false } }} />);
    expect(screen.queryByText("3 min walk")).toBeNull();
    expect(screen.queryByText("Restaurants nearby")).toBeNull();
    expect(screen.getByRole("link", { name: "Manila museum district" })).toBeTruthy();
    expect(screen.getAllByText(/400 m · walking distance/)).toHaveLength(3);
  });
  it("keeps edited demo descriptions instead of replacing them with reference copy", () => {
    render(<LocationHighlights content={{ ...content, places: content.places.map(place => place.id === "museum" ? { ...place, description: "A saved museum update" } : place) }} />);
    expect(screen.getByText("A saved museum update")).toBeTruthy();
    expect(screen.queryByText("5 min walk")).toBeNull();
  });
  it("uses the supplied property photo and district and exposes a failed-image state", () => {
    render(<LocationPhotoCard content={content} photo={{ src: "/api/website/images/saved-image", alt: "Saved property photo" }} label="Saved district" />);
    expect(screen.getByRole("heading", { name: "Saved district" })).toBeTruthy();
    fireEvent.error(screen.getByAltText("Saved property photo"));
    expect(screen.getByText("Photo unavailable")).toBeTruthy();
    expect(new URL(screen.getByRole("link", { name: "View Directions" }).getAttribute("href")!).searchParams.get("destination")).toBe(testHotel.maps_label);
  });
  it("retains all places in the full guide and honors nearby visibility", () => {
    const { container, rerender } = render(<LocationSections content={content} />);
    const explore = screen.getByRole("button", { name: "Explore Nearby Places" });
    expect(explore.getAttribute("aria-haspopup")).toBe("dialog");
    expect(screen.queryByRole("searchbox")).toBeNull();
    fireEvent.click(explore);
    expect(screen.getByRole("dialog", { name: "Explore Nearby Places" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close guide" }));
    expect(container.querySelector(".wl-places")?.querySelectorAll("article")).toHaveLength(4);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "edited" } });
    expect(container.querySelector(".wl-places")?.querySelectorAll("article")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "View map" }));
    expect(screen.getByRole("button", { name: "View list" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close guide" }));
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(document.activeElement).toBe(explore);
    fireEvent.click(explore);
    expect(screen.getByRole("button", { name: "View map" })).toBeTruthy();
    const search = screen.getByRole("searchbox") as HTMLInputElement;
    expect(search.value).toBe("edited");
    fireEvent.keyDown(search, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(explore);
    rerender(<LocationSections content={content} showNearby={false} />);
    expect(container.querySelector(".location-nearby")).toBeNull();
    expect(container.querySelector("#nearby")).toBeNull();
    expect(screen.getByRole("link", { name: "View Directions" })).toBeTruthy();
  });
});
