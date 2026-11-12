// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_WEBSITE_CONTENT } from "@/lib/website-content";
import { hotelGalleryPhotos } from "@/lib/website-gallery";
import { HotelGalleryCarousel, HotelGalleryGrid } from "./hotel-gallery";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event("close")); };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const photos = hotelGalleryPhotos(DEFAULT_WEBSITE_CONTENT, []);
const filters = () => within(screen.getByRole("group", { name: "Photo categories" }));

describe("hotel editorial gallery", () => {
  it("opens on Exterior, then filters actual photos and resets the selection", () => {
    render(<HotelGalleryCarousel photos={photos} />);
    expect(filters().getByRole("button", { name: "Exterior" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "View Haven Hotel Exterior fullscreen" })).toBeTruthy();
    expect(within(screen.getByRole("group", { name: "Choose a photo" })).getAllByRole("button")).toHaveLength(5);
    fireEvent.click(filters().getByRole("button", { name: "Rooms" }));
    expect(screen.getByRole("button", { name: "View Deluxe King Room fullscreen" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Next gallery photo" })).toBeNull();
    fireEvent.click(filters().getByRole("button", { name: "All Photos" }));
    expect(screen.getByRole("status").textContent).toContain("Photo 1 of 9");
  });
  it("wraps with arrows and lets the keyboard and thumbnails select photos", () => {
    render(<HotelGalleryCarousel photos={photos} />);
    fireEvent.click(screen.getByRole("button", { name: "Previous gallery photo" }));
    expect(screen.getByRole("status").textContent).toContain("Poolside at Haven. Photo 5 of 5");
    const carousel = screen.getByRole("region", { name: "Exterior photos" });
    fireEvent.keyDown(carousel, { key: "ArrowRight" });
    expect(screen.getByRole("status").textContent).toContain("Haven Hotel Exterior. Photo 1 of 5");
    fireEvent.click(within(screen.getByRole("group", { name: "Choose a photo" })).getByRole("button", { name: "Show The garden courtyard" }));
    expect(screen.getByRole("status").textContent).toContain("The garden courtyard. Photo 4 of 5");
    fireEvent.keyDown(carousel, { key: "Home" });
    expect(screen.getByRole("status").textContent).toContain("Photo 1 of 5");
  });
  it("opens the entire collection from the selected photo, traps focus and restores it on Escape", async () => {
    render(<HotelGalleryCarousel photos={photos} />);
    const trigger = screen.getByRole("button", { name: "View Haven Hotel Exterior fullscreen" });
    trigger.focus(); fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Haven photo gallery" });
    const close = within(dialog).getByRole("button", { name: "Close gallery" });
    expect(document.activeElement).toBe(close);
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(within(dialog).getByRole("heading").textContent).toBe("Your arrival at Haven");
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Next fullscreen photo" }));
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).toBe("");
  });
  it("keeps missing categories truthful and allows recovery to the available collection", () => {
    render(<HotelGalleryCarousel photos={[photos[3]]} />);
    expect(screen.getByRole("heading", { name: "Exterior photos are being updated." })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Browse all photos" }));
    expect(screen.getByRole("button", { name: "View Deluxe King Room fullscreen" })).toBeTruthy();
  });
  it("renders an empty CMS gallery without resurrecting demo images", () => {
    render(<HotelGalleryCarousel photos={[]} />);
    expect(screen.getByRole("heading", { name: "Property photos are being updated." })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "See full gallery" })).toBeNull();
  });
  it("shows a recoverable image failure in the fullscreen viewer", () => {
    render(<HotelGalleryCarousel photos={photos} />);
    fireEvent.click(screen.getByRole("button", { name: "View Haven Hotel Exterior fullscreen" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.error(within(dialog).getByRole("img"));
    expect(within(dialog).getByText("This photo couldn’t be loaded.")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Try again" }));
    expect(within(dialog).getByRole("img")).toBeTruthy();
  });
  it("keeps the private editor preview in its own surface", () => {
    render(<HotelGalleryCarousel photos={photos} preview />);
    fireEvent.click(screen.getByRole("button", { name: "View Haven Hotel Exterior fullscreen" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: "See full gallery" })).toBeNull();
  });
});

describe("full hotel gallery collection", () => {
  it("opens all photos on the homepage and returns focus when closed", () => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    render(<HotelGalleryCarousel photos={photos} />);
    const trigger = screen.getByRole("button", { name: "See full gallery" });
    fireEvent.click(trigger);
    const dialog = within(screen.getByRole("dialog", { name: "Inside Haven" }));
    const close = dialog.getByRole("button", { name: "Close gallery" });
    expect(document.activeElement).toBe(close);
    expect(within(dialog.getByRole("list", { name: "All Photos collection" })).getAllByRole("button")).toHaveLength(photos.length);
    fireEvent.click(close);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
  it("shows the complete ordered collection together before a photo is opened", () => {
    render(<HotelGalleryGrid photos={photos} />);
    const grid = screen.getByRole("list", { name: "All Photos collection" });
    expect(within(grid).getAllByRole("button").map(button => button.getAttribute("aria-label"))).toEqual(photos.map(photo => `View ${photo.label} fullscreen`));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("link", { name: "Back to hotel" }).getAttribute("href")).toBe("/#gallery");
    fireEvent.click(filters().getByRole("button", { name: "Rooms" }));
    expect(screen.getByRole("status").textContent).toBe("1 photo · Rooms");
    expect(within(screen.getByRole("list", { name: "Rooms collection" })).getAllByRole("button")).toHaveLength(1);
    fireEvent.click(filters().getByRole("button", { name: "All Photos" }));
    expect(within(screen.getByRole("list", { name: "All Photos collection" })).getAllByRole("button")).toHaveLength(photos.length);
  });
  it("enlarges the chosen photo and returns keyboard focus to its grid tile", async () => {
    render(<HotelGalleryGrid photos={photos} />);
    const tile = screen.getByRole("button", { name: "View Deluxe King Room fullscreen" });
    tile.focus(); fireEvent.click(tile);
    expect(within(screen.getByRole("dialog")).getByRole("heading").textContent).toBe("Deluxe King Room");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(tile);
    expect(document.body.style.overflow).toBe("");
  });
  it("keeps edited and empty collections truthful and recovers a missing category", () => {
    const { rerender } = render(<HotelGalleryGrid photos={[photos[3]]} />);
    fireEvent.click(filters().getByRole("button", { name: "Dining" }));
    expect(screen.getByRole("heading", { name: "Dining photos are being updated." })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Browse all photos" }));
    expect(screen.getByRole("button", { name: "View Deluxe King Room fullscreen" })).toBeTruthy();
    rerender(<HotelGalleryGrid photos={[]} />);
    expect(screen.getByRole("heading", { name: "Property photos are being updated." })).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });
});
