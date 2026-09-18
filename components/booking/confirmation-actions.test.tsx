// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ConfirmationActions } from "./confirmation-actions";

afterEach(() => cleanup());

describe("ConfirmationActions", () => {
  it("keeps reservation management as the primary, reservation-specific action", () => {
    render(<ConfirmationActions reservationId="reservation-123" />);

    const link = screen.getByRole("link", { name: "Manage Reservation" });
    expect(link.getAttribute("href")).toBe("/my-reservations/reservation-123");
    expect(link.classList.contains("btn-accent")).toBe(true);
  });

  it("labels the customer Overview destination as Go Home", () => {
    render(<ConfirmationActions reservationId="reservation-123" />);

    const link = screen.getByRole("link", { name: "Go Home" });
    expect(link.getAttribute("href")).toBe("/account");
    expect(link.classList.contains("btn-soft")).toBe(true);
    expect(screen.queryByText(/customer portal/i)).toBeNull();
  });

  it("provides two distinct destinations in the intended action order", () => {
    render(<ConfirmationActions reservationId="reservation-123" />);

    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent?.trim())).toEqual(["Manage Reservation", "Go Home"]);
    expect(new Set(links.map((link) => link.getAttribute("href"))).size).toBe(2);
  });
});
