// @vitest-environment jsdom
// Digital Express Pass contract (Scenario A): the stay QR renders as a
// compact pass card anchored inside the hero grid — never as its own
// full-width section — and stacks below the reservation info on mobile.
// Terminal states render the expired band instead, never a live pass.
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReservationDetailView, type ReservationDetailViewData } from "./reservation-detail-view";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: null, status: "unauthenticated" }) }));

if (!window.matchMedia) {
  window.matchMedia = (() => ({
    matches: false,
    media: "",
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const data: ReservationDetailViewData = {
  id: "rsv-1",
  confirmationNumber: "HVN-260921-B2B01B",
  roomType: "Garden Twin",
  checkIn: "2026-09-21",
  checkOut: "2026-09-26",
  nights: 5,
  guests: 2,
  status: "confirmed",
  paymentStatus: "paid",
  guestName: "Ana Reyes",
  guestEmail: "ana@example.com",
  guestPhone: "+63 917 000 0000",
  roomNumber: "Room 123",
  identityStatus: "verified",
  source: "direct",
  specialRequests: null,
  expectedArrival: null,
  cancellationReason: null,
  checkInTime: "14:00",
  checkOutTime: "12:00",
  transportLines: [],
  policyText: "Policy text.",
  pendingNotice: null,
  money: { stayTotal: 15000, folioTotal: 15000, depositRequired: 5000, paid: 15000, balance: 0, nightly: 3000 },
  charges: [],
  payments: [],
  refunds: [],
  changeRequests: [],
  transportation: [],
};

const stubFetch = () =>
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ data: { dataUrl: "data:image/png;base64,QR", points: 0 } }) })
    )
  );

describe("Digital Express Pass layout (Scenario A)", () => {
  it("renders the pass inside the hero heading grid, not as a standalone section below it", async () => {
    stubFetch();
    const { container } = render(<ReservationDetailView data={data} />);
    await screen.findByText("Digital Express Pass");
    const heading = container.querySelector(".customer-reservation-heading")!;
    // Anchored via the pass-column wrapper, a direct grid child of the hero heading.
    const column = heading.querySelector(":scope > .customer-checkin-qr-pass-column");
    expect(column).toBeTruthy();
    expect(column!.querySelector(".customer-checkin-qr")).toBeTruthy();
    // The old standalone block sat between the hero and the folio strip.
    expect(screen.queryByText("Present this QR to the Front Desk")).toBeNull();
  });

  it("labels the pass card with its parts: hotel, scan hint, ready badge, download", async () => {
    stubFetch();
    const { container } = render(<ReservationDetailView data={data} />);
    await waitFor(() => expect(container.querySelector(".customer-checkin-qr-figure img")).toBeTruthy());
    expect(screen.getByText("Digital Express Pass")).toBeTruthy();
    expect(screen.getByText("HAVEN Hotel & Residences")).toBeTruthy();
    expect(screen.getByText("Scan at front desk or kiosk")).toBeTruthy();
    expect(screen.getByText(/Ready for Express Check-In/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Download QR/ })).toBeTruthy();
    const img = container.querySelector(".customer-checkin-qr-figure img") as HTMLImageElement;
    expect(img.getAttribute("width")).toBe("160");
    expect(img.getAttribute("height")).toBe("160");
  });

  it("keeps the folio summary strip directly after the hero", () => {
    stubFetch();
    const { container } = render(<ReservationDetailView data={data} />);
    const hero = container.querySelector(".customer-reservation-hero")!;
    const strip = hero.nextElementSibling!;
    expect(strip.classList.contains("crd-folio-strip")).toBe(true);
  });

  it("renders the expired band instead of the pass for terminal states", () => {
    stubFetch();
    render(<ReservationDetailView data={{ ...data, status: "cancelled" }} />);
    expect(screen.getByText("QR expired")).toBeTruthy();
    expect(screen.queryByText("Digital Express Pass")).toBeNull();
  });
});
