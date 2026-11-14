// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ReservationAccessRecovery } from "./reservation-access-recovery";

vi.mock("next/navigation", () => ({ usePathname: () => "/booking/confirmation/RSV-TEST" }));
afterEach(cleanup);

it("preserves the confirmation destination when switching to the booking account", () => {
  render(<ReservationAccessRecovery />);
  expect(screen.getByRole("link", { name: "Sign in to the booking account" }).getAttribute("href")).toBe("/login?callbackUrl=%2Fbooking%2Fconfirmation%2FRSV-TEST");
  expect(screen.getByRole("link", { name: "Contact Front Desk" }).getAttribute("href")).toBe("/account/help");
  expect(screen.getByText(/don't pay again/i)).toBeTruthy();
});
