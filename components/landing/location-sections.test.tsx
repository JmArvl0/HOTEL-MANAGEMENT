// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { LocationLoading, LocationSections } from "./location-sections";
import { EMPTY_LOCATION, type LocationContent } from "@/lib/location-content";

const geo = { latitude: 0, longitude: 0, maps_label: "", google_place_id: "", verification_source: "https://example.invalid/verified", verified_at: "2026-11-06" };
const common = { ...geo, version: 0, updated_at: "2026-11-06", status: "published" as const, sort_order: 0, location_revision: 1, image_id: null, sample_image: null, image_alt: "", distance_m: 400, distance_basis: "walking" as const, distance_reviewed_at: "2026-11-06" };
const content: LocationContent = { hotel: { ...common, id: "hotel", name: "Test hotel", address: "Temporary demo pin", entrance_notes: "Entrance notes", directions_title: "Find your way here.", directions_description: "Location and routes", nearby_title: "Explore nearby.", nearby_description: "Things nearby", is_demo: true, embed_url: "https://www.google.com/maps/embed?pb=example" }, categories: [{ id: "dining", name: "Dining", slug: "dining", status: "published", sort_order: 0, version: 0, updated_at: "" }, { id: "shopping", name: "Shopping", slug: "shopping", status: "published", sort_order: 1, version: 0, updated_at: "" }], places: [{ ...common, id: "cafe", name: "A local café", description: "A quiet corner", category_id: "dining", maps_search: "cafes near Rizal Park", featured: true }, { ...common, id: "shop", name: "A shopping destination", description: "Useful essentials", category_id: "shopping", maps_search: "shopping near Rizal Park", featured: false }], routes: [{ ...common, id: "airport", origin_name: "From the airport", description: "Airport guide", maps_label: "NAIA Terminal 3", travel_mode: "driving" }, { ...common, id: "city", origin_name: "From the city", description: "City guide", maps_label: "Manila City Hall", travel_mode: "driving" }] };
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event("close")); };
});
afterEach(cleanup);
describe("public location sections", () => {
  it("renders an actual Google iframe, not a screenshot or custom directional controls", () => { const { container } = render(<LocationSections content={content} />); const frame = screen.getByTitle(/Interactive Google Map/); expect(frame.tagName).toBe("IFRAME"); expect(frame.getAttribute("loading")).toBe("lazy"); expect(frame.hasAttribute("allowfullscreen")).toBe(true); expect(container.querySelector("#how-to-go")).toBeTruthy(); expect(container.querySelector("#nearby")).toBeTruthy(); expect(screen.queryByRole("button", { name: /Move (up|down|left|right)/ })).toBeNull(); });
  it("combines category and search, clears no-match results, and omits distances from a fictional hotel", () => { const { container } = render(<LocationSections content={content} />); fireEvent.click(screen.getByRole("button", { name: "Explore Nearby Places" })); const list = container.querySelector(".wl-places")!; expect(list.querySelectorAll("article").length).toBe(2); fireEvent.click(screen.getByRole("button", { name: "Dining" })); expect(list.querySelectorAll("article").length).toBe(1); fireEvent.change(screen.getByRole("searchbox"), { target: { value: "unmatched" } }); expect(within(list as HTMLElement).getByText("No places match.")).toBeTruthy(); fireEvent.click(screen.getByRole("button", { name: /Clear filters/ })); expect(list.querySelectorAll("article").length).toBe(2); expect(list.textContent).not.toContain("Sample distance"); });
  it("selects the city guide for a verified location while every route retains its own origin", () => { const { container } = render(<LocationSections content={{ ...content, hotel: { ...content.hotel!, is_demo: false } }} />); fireEvent.click(screen.getByRole("button", { name: "Explore Nearby Places" })); fireEvent.click(screen.getByRole("button", { name: /From the city/ })); expect(container.querySelector(".wl-route-guide")?.textContent).toBe("City guide"); const links = screen.getAllByRole("link", { name: /Navigate with Google Maps/ }); expect(new URL(links[0].getAttribute("href")!).searchParams.get("origin")).toBe("NAIA Terminal 3"); expect(new URL(links[1].getAttribute("href")!).searchParams.get("origin")).toBe("Manila City Hall"); });
  it("loads the selected place into the guide map and can restore the area overview", () => {
    const places = content.places.map(place => ({ ...place, verified_at: null, latitude: null, longitude: null }));
    render(<LocationSections content={{ ...content, places }} />);
    fireEvent.click(screen.getByRole("button", { name: "Explore Nearby Places" }));
    const guideMap = within(screen.getByRole("region", { name: "Area map" }));
    const cafe = screen.getByRole("button", { name: "Show on map: A local café" });
    const shopping = screen.getByRole("button", { name: "Show on map: A shopping destination" });
    fireEvent.click(cafe);
    expect(cafe.getAttribute("aria-pressed")).toBe("true");
    expect(new URL(guideMap.getByTitle("Interactive Google Map: A local café").getAttribute("src")!).searchParams.get("q")).toBe("cafes near Rizal Park");
    fireEvent.click(shopping);
    expect(cafe.getAttribute("aria-pressed")).toBe("false");
    expect(shopping.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(guideMap.getByRole("button", { name: "Reset map" }));
    expect(shopping.getAttribute("aria-pressed")).toBe("false");
    expect(guideMap.getByTitle(/neighborhood guide/).getAttribute("src")).toBe(content.hotel!.embed_url);
  });
  it("supports no hotel/pin, no places, loading, and data errors without fabricated navigation", () => {
    const { rerender } = render(<LocationSections content={EMPTY_LOCATION} />);
    expect(screen.queryByTitle(/Interactive Google Map/)).toBeNull();
    expect(screen.queryByRole("link", { name: /Get hotel directions/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Explore Nearby Places" }));
    const dialog = screen.getByRole("dialog", { name: "Explore Nearby Places" });
    expect(within(dialog).getByText("Your local guide is on its way.")).toBeTruthy();
    expect(within(dialog).queryByRole("link", { name: /Google Maps/ })).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close guide" }));
    rerender(<LocationSections content={EMPTY_LOCATION} unavailable />);
    expect(screen.getByRole("alert")).toBeTruthy();
    rerender(<LocationLoading />);
    expect(screen.getByRole("status").textContent).toContain("Loading arrival");
  });
  it("keeps a directions fallback when the configured embed URL is invalid", () => { render(<LocationSections content={{ ...content, hotel: { ...content.hotel!, embed_url: "javascript:alert(1)" } }} />); expect(screen.queryByTitle(/Interactive Google Map/)).toBeNull(); expect(screen.getByText("Map not available yet.")).toBeTruthy(); expect(screen.getByRole("link", { name: /View Directions/ })).toBeTruthy(); });
});
