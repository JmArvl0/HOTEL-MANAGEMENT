// @vitest-environment jsdom
// Shared stay-summary consolidation: Guest Details, Review, Reservation
// Deposit, and Confirmation all render the same BookingStaySummary card.
// The component displays passed-in authoritative values only — no fetching,
// no recalculation (source-scanned below).
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BookingStaySummary } from "./booking-stay-summary";
import { ReviewStayCard } from "./booking-review";
import { formatPeso } from "@/lib/format";
import { roomPhotosFor } from "@/lib/room-images";

afterEach(() => cleanup());

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const garden = {
  roomType: "Garden Twin",
  checkIn: "2026-09-18",
  checkOut: "2026-09-20",
  guests: 2,
  nights: 2,
  rate: 5800,
  total: 11600,
  photos: ["https://images.unsplash.com/photo-a?q=80&w=1600&auto=format&fit=crop"],
};

describe("BookingStaySummary base card (Details + Review shape)", () => {
  it("renders room type, dates, guests, nights, nightly rate, and stay total", () => {
    render(<BookingStaySummary {...garden} photos={garden.photos} />);
    expect(screen.getByRole("heading", { name: "Garden Twin" })).toBeTruthy();
    expect(screen.getByText("2026-09-18")).toBeTruthy();
    expect(screen.getByText("2026-09-20")).toBeTruthy();
    expect(screen.getByText("Your stay")).toBeTruthy();
    expect(screen.getByText(formatPeso(5800))).toBeTruthy();
    expect(screen.getByText(formatPeso(11600))).toBeTruthy();
  });

  it("shows no payment-only rows on the base variant", () => {
    render(<BookingStaySummary {...garden} photos={garden.photos} />);
    expect(screen.queryByText(/Required reservation deposit/)).toBeNull();
    expect(screen.queryByText("Remaining balance")).toBeNull();
  });

  it("renders the room cover photo when provided", () => {
    const { container } = render(<BookingStaySummary {...garden} photos={garden.photos} />);
    expect(container.querySelector(".review-stay-photo img")).toBeTruthy();
    expect(container.querySelector(".review-stay-photo--fallback")).toBeNull();
  });

  it("renders the type stock photo (never a broken image) when DB photos are empty", () => {
    const { container } = render(<BookingStaySummary {...garden} photos={[]} />);
    expect(container.querySelector(".review-stay-photo img")?.getAttribute("src")).toBe(
      roomPhotosFor([], "Garden Twin")[0],
    );
    expect(container.querySelector(".review-stay-photo--fallback")).toBeNull();
  });
});

describe("BookingStaySummary payment extension (Deposit + Confirmation shape)", () => {
  const paid = {
    ...garden,
    photos: garden.photos,
    depositDue: { label: "Required reservation deposit - 30%", amount: 3480 },
    remainingBalance: 8120,
  };

  it("shows the required deposit and remaining balance rows", () => {
    render(<BookingStaySummary {...paid} />);
    expect(screen.getByText(/Required reservation deposit/)).toBeTruthy();
    expect(screen.getByText(formatPeso(3480))).toBeTruthy();
    expect(screen.getByText("Remaining balance")).toBeTruthy();
    expect(screen.getByText(formatPeso(8120))).toBeTruthy();
    // Base rows stay intact alongside the extension.
    expect(screen.getByText(formatPeso(5800))).toBeTruthy();
    expect(screen.getByText(formatPeso(11600))).toBeTruthy();
  });

  it("renders the stay-related footnote when provided", () => {
    render(<BookingStaySummary {...paid} footnote={<p>Transport booked (1): Airport transfer</p>} />);
    expect(screen.getByText(/Transport booked/)).toBeTruthy();
  });
});

describe("photo resolution (authoritative Find-a-Room chain)", () => {
  const db = ["https://example.com/cover.jpg", "https://example.com/second.jpg"];

  it("prefers the DB cover photo and hands the full gallery to the lightbox", () => {
    const { container } = render(<BookingStaySummary {...garden} photos={db} />);
    expect(container.querySelector(".review-stay-photo img")?.getAttribute("src")).toBe(db[0]);
    expect(
      container.querySelector('[aria-label="Open Garden Twin photo gallery"]'),
    ).toBeTruthy();
  });

  it("falls back to the Garden Twin stock photo when the DB has none", () => {
    const { container } = render(<BookingStaySummary {...garden} photos={[]} />);
    expect(container.querySelector(".review-stay-photo img")?.getAttribute("src")).toBe(
      roomPhotosFor([], "Garden Twin")[0],
    );
    expect(container.querySelector(".review-stay-photo--fallback")).toBeNull();
  });

  it("resolves each room type to its own stock photo", () => {
    const deluxe = roomPhotosFor([], "Deluxe King")[0];
    const ocean = roomPhotosFor([], "Ocean Suite")[0];
    const gardenStock = roomPhotosFor([], "Garden Twin")[0];
    expect(deluxe).toContain("images.unsplash.com");
    expect(new Set([deluxe, ocean, gardenStock]).size).toBe(3);
    const { container } = render(
      <BookingStaySummary {...garden} roomType="Deluxe King" photos={[]} />,
    );
    expect(container.querySelector(".review-stay-photo img")?.getAttribute("src")).toBe(deluxe);
  });

  it("shows unknown types the same generic stock Find a Room would show", () => {
    const { container } = render(
      <BookingStaySummary {...garden} roomType="Mystery Loft" photos={[]} />,
    );
    expect(container.querySelector(".review-stay-photo img")?.getAttribute("src")).toBe(
      roomPhotosFor([], "Mystery Loft")[0],
    );
    expect(container.querySelector(".review-stay-photo--fallback")).toBeNull();
  });

  it("filters blank URLs so no broken image renders", () => {
    const { container } = render(
      <BookingStaySummary {...garden} roomType="Mystery Loft" photos={["  ", ""]} />,
    );
    const src = container.querySelector(".review-stay-photo img")?.getAttribute("src") ?? "";
    expect(src.trim()).not.toBe("");
    expect(src).toBe(roomPhotosFor([], "Mystery Loft")[0]);
  });

  it("resolves through the shared helper, never its own fetch", () => {
    const source = read("components/booking/booking-stay-summary.tsx");
    expect(source).toContain("roomPhotosFor");
    expect(source).not.toContain(".from(");
  });

  it("retains the HAVEN fallback branch for a genuinely imageless gallery", () => {
    const source = read("components/booking/booking-stay-summary.tsx");
    expect(source).toContain("review-stay-photo--fallback");
  });
});

describe("ReviewStayCard alias (Review unchanged)", () => {
  it("renders the identical shared card", () => {
    const { container } = render(<ReviewStayCard {...garden} photos={garden.photos} />);
    expect(container.querySelector(".review-stay-card")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Garden Twin" })).toBeTruthy();
    expect(screen.getByText(formatPeso(5800))).toBeTruthy();
    expect(screen.getByText(formatPeso(11600))).toBeTruthy();
  });
});

describe("stay-summary consolidation contracts", () => {
  it("keeps business logic out of the presentational component", () => {
    const source = read("components/booking/booking-stay-summary.tsx");
    for (const banned of [
      "supabase",
      "fetch(",
      "expire_booking_holds",
      "create_booking_hold",
      "submit_reservation_deposit",
      "calculateNights",
      "calculateReservationDeposit",
      "calculateFinancialState",
    ]) {
      expect(source).not.toContain(banned);
    }
  });

  it("wires every booking step to the shared component with no duplicate cards", () => {
    expect(read("app/(booking)/booking/details/page.tsx")).toContain("BookingStaySummary");
    expect(read("app/(booking)/booking/payment/[token]/page.tsx")).toContain("BookingStaySummary");
    expect(read("app/(booking)/booking/confirmation/[id]/page.tsx")).toContain("BookingStaySummary");
    expect(read("app/(booking)/booking/review/[token]/page.tsx")).toContain("ReviewStayCard");
    // Old variants are gone: no BookingSummary import/usage, no inline deposit aside.
    expect(read("app/(booking)/booking/details/page.tsx")).not.toContain("BookingSummary ");
    expect(read("app/(booking)/booking/payment/[token]/page.tsx")).not.toContain("booking-summary deposit-summary");
    expect(read("components/booking/booking-shell.tsx")).not.toContain("BookingSummary");
  });

  it("shares one width rule and the extension styles in CSS", () => {
    const css = read("app/guest-booking.css");
    expect(css).toContain("grid-template-columns:minmax(0,1fr) 320px");
    expect(css).toContain(".review-stay-deposit");
    expect(css).toContain(".review-stay-footnote");
    expect(css).toContain(".confirmation-stay");
  });
});
