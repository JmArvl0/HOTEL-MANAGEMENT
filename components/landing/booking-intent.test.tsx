// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { BookingIntentProvider, FeaturedStays, HeroBookingForm, type FeaturedRoom } from "./booking-intent";

vi.mock("next/image", () => ({default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img src={props.src} alt={props.alt} width={props.width} height={props.height} onError={props.onError} />}));
const photos = ["https://example.com/room.webp", "https://example.com/room-angle.webp", "https://example.com/bathroom.webp", "https://example.com/window.webp"];
const room: FeaturedRoom = {
  id: "deluxe", name: "Deluxe King", description: "Description saved by the admin.", beds: "1 king bed",
  max_guests: 2, size_sqm: 36, base_rate: "6400", amenities: ["Wi-Fi", "Work desk", "Private bathroom", "Air conditioning", "Extra amenity"], photo_urls: photos,
};
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("Featured Stays", () => {
  it("shows every catalog room with saved copy, facts, rate and the first four highlights", () => {
    render(<FeaturedStays rooms={[room, ...[2, 3, 4, 5].map(i => ({ ...room, id: String(i), name: `Room ${i}` }))]} />);
    expect(screen.getAllByRole("article")).toHaveLength(5);
    const first = within(screen.getAllByRole("article")[0]);
    expect(first.getByText(room.description)).toBeTruthy();
    expect(first.getByText("1 king bed · 36 m² · Up to 2 guests")).toBeTruthy();
    expect(first.getByText("₱6,400")).toBeTruthy();
    expect(within(first.getByRole("list", { name: "Deluxe King highlights" })).getAllByRole("listitem")).toHaveLength(4);
    expect(first.queryByText("Extra amenity")).toBeNull();
    expect(first.getByRole("link", { name: "Choose Deluxe King type" }).getAttribute("href")).toBe("/booking/rooms/Deluxe%20King?roomType=Deluxe+King");
  });

  it("uses uploaded photos in their saved order and switches to the bathroom without navigating", () => {
    render(<FeaturedStays rooms={[room]} />);
    const main = screen.getByRole("button", { name: "Open Deluxe King photo gallery" });
    expect(main.querySelector("img")?.getAttribute("src")).toBe(photos[0]);
    const bathroom = screen.getByRole("button", { name: "View photo 3 of Deluxe King" });
    bathroom.focus();
    fireEvent.click(bathroom);
    expect(main.querySelector("img")?.getAttribute("src")).toBe(photos[2]);
    expect(bathroom.getAttribute("aria-pressed")).toBe("true");
    expect(document.activeElement).toBe(bathroom);
    fireEvent.click(main);
    expect(screen.getByRole("dialog", { name: "Deluxe King photo gallery" })).toBeTruthy();
    expect(screen.getByText("Deluxe King · Photo 3 of 4")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next photo" }));
    expect(screen.getByAltText("Deluxe King room photo 4").getAttribute("src")).toBe(photos[3]);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("uses the generated whole-room and bathroom sample gallery only when uploads are absent", () => {
    const { rerender } = render(<FeaturedStays rooms={[{ ...room, photo_urls: null }]} />);
    const main = () => screen.getByRole("button", { name: "Open Deluxe King photo gallery" }).querySelector("img");
    expect(main()?.getAttribute("src")).toBe("/room-samples/deluxe-king-room.webp");
    fireEvent.click(screen.getByRole("button", { name: "View photo 3 of Deluxe King" }));
    expect(main()?.getAttribute("src")).toBe("/room-samples/deluxe-king-bathroom.webp");
    rerender(<FeaturedStays rooms={[{ ...room, photo_urls: [photos[1], photos[0]] }]} />);
    expect(main()?.getAttribute("src")).toBe(photos[1]);
  });

  it("removes failed photos and keeps the booking action usable when every upload fails", () => {
    render(<FeaturedStays rooms={[{ ...room, photo_urls: photos.slice(0, 2) }]} />);
    fireEvent.error(screen.getByAltText("Deluxe King — room photo 1"));
    expect(screen.getByAltText("Deluxe King — room photo 1").getAttribute("src")).toBe(photos[1]);
    expect(screen.queryByRole("group", { name: "Deluxe King photos" })).toBeNull();
    fireEvent.error(screen.getByAltText("Deluxe King — room photo 1"));
    expect(screen.getByText("Room photos are currently unavailable.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Choose Deluxe King type" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Open Deluxe King photo gallery" })).toBeNull();
  });

  it("preserves the guest's dates and party size while browsing photos", () => {
    vi.setSystemTime(new Date("2027-01-10T04:00:00Z"));
    HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    HTMLDialogElement.prototype.close = function () { this.open = false; };
    render(<BookingIntentProvider><HeroBookingForm /><FeaturedStays rooms={[room]} /></BookingIntentProvider>);
    fireEvent.click(screen.getByRole("button", { name: /Check in/ }));
    fireEvent.click(screen.getByRole("button", { name: "Tuesday, January 12, 2027" }));
    fireEvent.click(screen.getByRole("button", { name: "Thursday, January 14, 2027" }));
    fireEvent.click(screen.getByRole("button", { name: /Check out/ }));
    fireEvent.click(screen.getByRole("button", { name: "Friday, January 15, 2027" }));
    fireEvent.change(screen.getByLabelText("Guests"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "View photo 2 of Deluxe King" }));
    const params = new URL(screen.getByRole("link", { name: "Choose Deluxe King type" }).getAttribute("href")!, "https://example.com").searchParams;
    expect(Object.fromEntries(params)).toEqual({ roomType: "Deluxe King", checkIn: "2027-01-12", checkOut: "2027-01-15", guests: "3" });
    expect(Object.fromEntries(new FormData(screen.getByRole<HTMLFormElement>("form", { name: "Check availability" })))).toEqual({ checkIn: "2027-01-12", checkOut: "2027-01-15", guests: "3" });
  });

  it("handles a single uploaded photo and missing optional facts without empty controls", () => {
    render(<FeaturedStays rooms={[{ ...room, amenities: null, size_sqm: null, photo_urls: [photos[0]] }]} />);
    expect(screen.queryByRole("group", { name: "Deluxe King photos" })).toBeNull();
    expect(screen.queryByRole("list", { name: "Deluxe King highlights" })).toBeNull();
    expect(screen.getByText("1 king bed · Up to 2 guests")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open Deluxe King photo gallery" })).toBeTruthy();
  });
});
