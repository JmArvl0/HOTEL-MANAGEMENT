// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MyStayCard, type MyStayCardData } from "./my-stay-card";

afterEach(cleanup);
const held: MyStayCardData = {
  roomType: "Deluxe King", roomNumber: "101", dates: "Nov 20–22, 2026", guests: 2,
  status: "Room held", stage: "held", nextTitle: "Finish booking your stay",
  nextDetail: "This stay is not confirmed.", action: "Resume booking", href: "/booking/review/test",
  total: 12800, paid: 0, balance: 12800, deposit: 3840, due: "Before the hold expires.",
  preferences: ["Quiet room"],
};
describe("My Stay booking summary", () => {
  it("keeps a held room visibly unconfirmed and shows the saved preference", () => {
    const { container } = render(<MyStayCard stay={held} />);
    expect(screen.getByRole("article", { name: "Booking in progress" })).toBeTruthy();
    expect(screen.getByText("This stay is not confirmed.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Resume booking" }).getAttribute("href")).toBe("/booking/review/test");
    expect(container.querySelector('[aria-current="step"]')?.textContent).toContain("Room held");
    expect(container.textContent).toContain("Saved; subject to confirmation");
    expect(container.querySelector("dl")?.textContent).toContain("Verified paid₱0");
    expect(container.textContent).not.toContain("No upcoming stay");
  });
  it("separates submitted payment evidence from verified paid money", () => {
    const { container } = render(<MyStayCard stay={{ ...held, status: "Verifying payment", stage: "verification", submitted: 3840, action: "View booking status" }} />);
    expect(container.querySelector('[aria-current="step"]')?.textContent).toContain("Verifying payment");
    expect(container.querySelector("dl")?.textContent).toContain("Verified paid₱0");
    expect(screen.getByText(/submitted for verification/).textContent).toContain("₱3,840");
  });
});
