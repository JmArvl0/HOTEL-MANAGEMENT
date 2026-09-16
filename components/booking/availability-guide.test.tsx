// @vitest-environment jsdom
// Choose-dates guidance: the glow/helper/scroll/focus sequence fires only on
// the Choose-dates event, clears itself, re-triggers, and respects
// reduced-motion. Booking logic is untouched (asserted by source contract).
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AvailabilityGuide, CHOOSE_DATES_EVENT } from "./availability-guide";
import { ChooseDatesButton } from "./choose-dates-button";
import { BookingSearchForm } from "./booking-search-form";

const scrollSpy = vi.fn();
let motionReduced = false;

beforeEach(() => {
  motionReduced = false;
  window.matchMedia = ((query: string) => ({
    matches: motionReduced,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  window.HTMLElement.prototype.scrollIntoView = scrollSpy;
  scrollSpy.mockClear();
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function fireChooseDates() {
  act(() => {
    window.dispatchEvent(new CustomEvent(CHOOSE_DATES_EVENT));
  });
}

function renderGuide(initial?: { checkIn?: string; checkOut?: string; guests?: number }) {
  return render(
    <AvailabilityGuide id="book-form">
      <BookingSearchForm compact action="/account/find-room" initial={initial} emptyDates={initial === undefined} />
    </AvailabilityGuide>
  );
}

describe("AvailabilityGuide", () => {
  it("shows no highlight or helper before Choose Dates is clicked", () => {
    const { container } = renderGuide();
    expect(container.querySelector("#book-form.is-guided")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(scrollSpy).not.toHaveBeenCalled();
  });

  it("scrolls, glows, explains, and focuses Check In on click", () => {
    const { container } = renderGuide();
    fireChooseDates();
    const target = container.querySelector("#book-form")!;
    expect(target.classList.contains("is-guided")).toBe(true);
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(screen.getByRole("status").textContent).toBe("Choose your stay dates and guests, then check availability.");
    expect(document.activeElement).toBe(screen.getByLabelText("Check in"));
  });

  it("focuses Check Out when check-in is already filled", () => {
    renderGuide({ checkIn: "2099-09-06", checkOut: "" });
    fireChooseDates();
    expect(document.activeElement).toBe(screen.getByLabelText("Check out"));
  });

  it("emphasizes Check Availability when every input is already valid", () => {
    renderGuide({ checkIn: "2099-09-06", checkOut: "2099-09-08", guests: 2 });
    fireChooseDates();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Check availability" }));
  });

  it("clears the highlight automatically and can trigger again", () => {
    const { container } = renderGuide();
    fireChooseDates();
    expect(container.querySelector("#book-form.is-guided")).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(container.querySelector("#book-form.is-guided")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    fireChooseDates();
    expect(container.querySelector("#book-form.is-guided")).not.toBeNull();
    expect(scrollSpy).toHaveBeenCalledTimes(2);
  });

  it("uses a static highlight without smooth scrolling under reduced motion", () => {
    motionReduced = true;
    const { container } = renderGuide();
    fireChooseDates();
    const target = container.querySelector("#book-form")!;
    expect(target.classList.contains("is-guided-static")).toBe(true);
    expect(target.classList.contains("is-guided")).toBe(false);
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
  });

  it("shares one handler across every room card", () => {
    render(
      <>
        <AvailabilityGuide id="book-form">
          <BookingSearchForm compact action="/account/find-room" emptyDates />
        </AvailabilityGuide>
        <ChooseDatesButton />
        <ChooseDatesButton />
      </>
    );
    const buttons = screen.getAllByRole("link", { name: "Choose dates" });
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute("href")).toBe("#book-form");
    fireEvent.click(buttons[1]);
    expect(screen.getByRole("status")).toBeTruthy();
    expect(scrollSpy).toHaveBeenCalledTimes(1);
  });

  it("leaves normal date edits alone (no reminder animation)", () => {
    const { container } = renderGuide();
    fireEvent.change(screen.getByLabelText("Check in"), { target: { value: "2099-09-06" } });
    expect(container.querySelector("#book-form.is-guided")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("choose-dates source contracts", () => {
  const results = readFileSync("components/booking/room-results.tsx", "utf8");
  const guide = readFileSync("components/booking/availability-guide.tsx", "utf8");
  const css = readFileSync("app/guest-booking.css", "utf8");

  it("routes browse cards through the shared button and keeps Select room", () => {
    expect(results).toContain("ChooseDatesButton");
    expect(results).toContain("Select room");
    expect(results).not.toContain("hrefFor(room.name)}>Choose dates");
  });

  it("keeps View Details and the photo viewer on their own actions", () => {
    expect(results).toContain("RoomDetailsButton");
    expect(results).toContain("RoomPhotoTrigger");
    expect(guide).not.toContain("RoomDetailsButton");
    expect(guide).not.toContain("RoomPhotoTrigger");
  });

  it("touches no booking, pricing, or availability logic", () => {
    expect(guide).not.toContain("lib/booking");
    expect(guide).not.toContain("getAvailability");
  });

  it("pins the scroll offset, single-pulse glow, and helper styles", () => {
    expect(css).toContain("#book-form{scroll-margin-top:96px}");
    expect(css).toContain("@keyframes availabilityGuide");
    expect(css).toContain(".availability-hint");
  });
});
