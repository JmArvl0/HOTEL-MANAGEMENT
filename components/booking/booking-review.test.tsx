// @vitest-environment jsdom
// Presentation-only tests for the booking-review redesign: guest rows render
// actual values, empty states hold, and financial figures pass through
// unchanged (no calculation lives here — lib/booking owns the math).
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ReviewDepositTiles, ReviewGuestCard, ReviewStayCard } from "./booking-review";
import { roomPhotosFor } from "@/lib/room-images";
import { HoldCountdown } from "./hold-countdown";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

afterEach(() => cleanup());

const guest = {
  firstName: "Mark",
  lastName: "Cruz",
  email: "mark@example.com",
  mobile: "+639171234567",
  address: "123 Makati Ave",
  nationality: "Filipino",
  expectedArrival: "14:00",
  requested: ["Extra towels", "Extra pillows"],
  specialRequests: "aray mooo",
  detailsHref: "/booking/details?hold=token",
};

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
// "{firstName} {lastName}" renders as separate text nodes, so match on
// the element's full text content instead of a single text node.
const byFullText = (text: string) => (_: string, el: Element | null) => el?.textContent === text;

describe("ReviewGuestCard", () => {
  it("renders the guest full name", () => {
    render(<ReviewGuestCard {...guest} />);
    expect(screen.getByText(byFullText("Mark Cruz"))).toBeTruthy();
  });
  it("renders the email address", () => {
    render(<ReviewGuestCard {...guest} />);
    expect(screen.getByText("mark@example.com")).toBeTruthy();
  });
  it("renders the mobile number", () => {
    render(<ReviewGuestCard {...guest} />);
    expect(screen.getByText("+639171234567")).toBeTruthy();
  });
  it("renders the address", () => {
    render(<ReviewGuestCard {...guest} />);
    expect(screen.getByText("123 Makati Ave")).toBeTruthy();
  });
  it("renders the expected arrival time", () => {
    render(<ReviewGuestCard {...guest} />);
    expect(screen.getByText("2:00 PM")).toBeTruthy();
  });
  it("renders stay preparation selections as chips", () => {
    render(<ReviewGuestCard {...guest} />);
    expect(screen.getByText("Extra towels")).toBeTruthy();
    expect(screen.getByText("Extra pillows")).toBeTruthy();
  });
  it("renders the special request note", () => {
    render(<ReviewGuestCard {...guest} />);
    expect(screen.getByText("aray mooo")).toBeTruthy();
  });
  it("handles an empty special request with a clean empty state", () => {
    render(<ReviewGuestCard {...guest} specialRequests={null} requested={[]} />);
    expect(screen.getByText("No additional request.")).toBeTruthy();
    expect(screen.getByText("No stay preparations selected.")).toBeTruthy();
  });
  it("keeps a single Edit details link to the details step", () => {
    render(<ReviewGuestCard {...guest} />);
    const link = screen.getByRole("link", { name: "Edit details" });
    expect(link.getAttribute("href")).toContain("/booking/details");
    expect(link.getAttribute("href")).toContain("hold=token");
  });
});

describe("ReviewDepositTiles + ReviewStayCard passthrough", () => {
  it("renders the deposit due amount unchanged", () => {
    render(
      <ReviewDepositTiles
        depositRequired={2670}
        remainingBalance={6230}
        depositLabel="30%"
        remainingNote="Due at hotel / check-in according to hotel policy."
      />,
    );
    expect(screen.getByText(byFullText("₱2,670"))).toBeTruthy();
  });
  it("renders the remaining balance unchanged", () => {
    render(
      <ReviewDepositTiles
        depositRequired={2670}
        remainingBalance={6230}
        depositLabel="30%"
        remainingNote="Due at hotel / check-in according to hotel policy."
      />,
    );
    expect(screen.getByText(byFullText("₱6,230"))).toBeTruthy();
  });
  it("renders stay total, nightly rate, dates, guests, and nights unchanged", () => {
    render(
      <ReviewStayCard
        roomType="Ocean Suite"
        checkIn="2026-09-16"
        checkOut="2026-09-17"
        guests={2}
        nights={1}
        rate={8900}
        total={8900}
        photos={[]}
      />,
    );
    expect(screen.getByText("Ocean Suite")).toBeTruthy();
    expect(screen.getByText("2026-09-16")).toBeTruthy();
    expect(screen.getByText("2026-09-17")).toBeTruthy();
    // Nightly rate and stay total agree on a uniform single-night stay.
    expect(screen.getAllByText(byFullText("₱8,900")).length).toBe(2);
  });
  it("renders the type stock photo (no broken image, no fallback) when DB photos are empty", () => {
    const { container } = render(
      <ReviewStayCard
        roomType="Ocean Suite"
        checkIn="2026-09-16"
        checkOut="2026-09-17"
        guests={2}
        nights={1}
        rate={8900}
        total={8900}
        photos={[]}
      />,
    );
    expect(container.querySelector(".review-stay-photo img")?.getAttribute("src")).toBe(
      roomPhotosFor([], "Ocean Suite")[0],
    );
    expect(container.querySelector(".review-stay-photo--fallback")).toBeNull();
  });
  it("renders per-night rows when frozen rates vary", () => {
    render(
      <ReviewStayCard
        roomType="Ocean Suite"
        checkIn="2026-09-16"
        checkOut="2026-09-18"
        guests={2}
        nights={2}
        rate={null}
        total={13600}
        nightly={[
          { date: "2026-09-16", rate: 6400 },
          { date: "2026-09-17", rate: 7200 },
        ]}
        photos={[]}
      />,
    );
    // Check-in date and the first per-night row share a label by design.
    expect(screen.getAllByText("2026-09-16").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("2026-09-17").length).toBeGreaterThanOrEqual(1);
  });
  it("keeps the hold timer operating with the held-for label", () => {
    const expiresAt = new Date(Date.now() + 14 * 60 * 1000 + 57 * 1000).toISOString();
    render(<HoldCountdown expiresAt={expiresAt} recoveryUrl="/booking/search?expired=1" />);
    expect(screen.getByText(/Room held for/)).toBeTruthy();
  });
  it("keeps the review grid responsive without horizontal overflow", () => {
    const css = read("app/guest-booking.css");
    expect(css).toContain(".review-row");
    expect(css).toContain(".review-stay-card");
    expect(css).toContain("@media(max-width:680px)");
  });
  it("leaves booking business logic out of the presentational layer", () => {
    const source = read("components/booking/booking-review.tsx");
    expect(source).not.toContain("create_booking_hold");
    expect(source).not.toContain("submit_reservation_deposit");
    expect(source).not.toContain("expire_booking_holds");
  });
});

describe("Review correction contracts (wide premium workspace)", () => {
  it("sizes the workspace to the approved 1240–1360px band with a 28–30% stay column", () => {
    const css = read("app/guest-booking.css");
    expect(css).toContain("max-width:1320px");
    expect(css).toContain("grid-template-columns:minmax(0,1fr) 320px");
  });
  it("renders the name as a full-width block, never a tiny chip", () => {
    const { container } = render(<ReviewGuestCard {...guest} />);
    const box = container.querySelector(".review-info-surface dd");
    expect(box?.textContent).toBe("Mark Cruz");
    const css = read("app/guest-booking.css");
    expect(css).toContain(".review-stage .review-card dl>.review-info-surface{display:block;min-width:0");
  });
  it("keeps the email address from breaking mid-word", () => {
    render(<ReviewGuestCard {...guest} email="johnmichael24@gmail.com" />);
    const node = screen.getByText("johnmichael24@gmail.com");
    expect(node.className).toContain("review-email");
    expect(read("app/guest-booking.css")).toContain(".review-field dd.review-email{min-width:0;white-space:nowrap");
  });
  it("styles preparations as comfortable rounded rects, not pills", () => {
    const css = read("app/guest-booking.css");
    expect(css).toContain("border-radius:9px");
    expect(css).not.toContain(".review-chips li{padding:6px 11px");
  });
  it("gives the special request a large read-only area", () => {
    const css = read("app/guest-booking.css");
    expect(css).toContain("min-height:64px");
  });
  it("sets the stay photo to the approved 150–180px band", () => {
    expect(read("app/guest-booking.css")).toContain(".review-stay-photo{position:relative;height:170px");
  });
  it("uses a warm-cream stay eyebrow and a prominent room total", () => {
    const css = read("app/guest-booking.css");
    expect(css).toContain(".review-stay-eyebrow{");
    expect(css).toContain("color:#eed9a8");
    expect(css).toContain(".review-stay-total dt,.review-stay-total dd{font-size:21px");
  });
});
