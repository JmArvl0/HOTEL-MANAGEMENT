// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { BookingPolicyPage } from "./booking-policy-page";
import { WebsiteFooter } from "./website-footer";
import { DEFAULT_OPERATIONAL_POLICY } from "@/lib/hotel-policy";
import { DEFAULT_WEBSITE_CONTENT } from "@/lib/website-content";
import type { PublicBookingInformation } from "@/lib/public-booking-information";

const information: PublicBookingInformation = {
  deposit: { enabled: true, calculationType: "percentage", percentageBasisPoints: 3500, fixedAmount: 0, holdMinutes: 18, remainingBalanceDue: "Balance due on arrival" },
  operations: { ...DEFAULT_OPERATIONAL_POLICY, checkInTime: "14:00", checkOutTime: "11:00", minimumBookingAge: 21, vatRateBp: 900, serviceChargeBp: 800, cancellationFullRefundDays: 10, cancellationPartialRefundDays: 3, cancellationPartialRefundBasisPoints: 2500 },
};
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, "", "/"); });

describe("booking policy page", () => {
  it("uses configured policies throughout the snapshot and detailed rules", () => {
    render(<BookingPolicyPage information={information} content={DEFAULT_WEBSITE_CONTENT} />);
    const snapshot = within(screen.getByRole("region", { name: "Policy Snapshot" }));
    expect(snapshot.getAllByRole("listitem")).toHaveLength(4);
    expect(snapshot.getByRole("heading", { name: "35% deposit" })).toBeTruthy();
    expect(snapshot.getByRole("heading", { name: "18-minute room hold" })).toBeTruthy();
    expect(snapshot.getByRole("heading", { name: "Check-in 2:00 PM" })).toBeTruthy();
    expect(snapshot.getByRole("heading", { name: "Check-out 11:00 AM" })).toBeTruthy();
    const cancellation = within(screen.getByRole("region", { name: "Cancellation & refunds" }));
    expect(cancellation.getAllByRole("listitem")).toHaveLength(3);
    expect(cancellation.getByText(/10 or more calendar days/)).toBeTruthy();
    expect(cancellation.getByText(/3–9 days.*25%/)).toBeTruthy();
    expect(cancellation.getByText(/Fewer than 3 days/)).toBeTruthy();
    expect(screen.getByText(/Lead guest minimum age: 21/)).toBeTruthy();
    expect(screen.getByText(/Remaining balance: Balance due on arrival.*9% VAT and 8% service charge/)).toBeTruthy();
  });

  it("handles fixed and disabled deposits without promising a percentage or confirmation", () => {
    const fixed = { ...information, deposit: { ...information.deposit, calculationType: "fixed" as const, fixedAmount: 1500 } };
    const { rerender } = render(<BookingPolicyPage information={fixed} content={DEFAULT_WEBSITE_CONTENT} />);
    expect(screen.getByText(/1,500.00 per reservation/)).toBeTruthy();
    expect(screen.queryByText(/35% of the total stay/)).toBeNull();
    rerender(<BookingPolicyPage information={{ ...fixed, deposit: { ...fixed.deposit, enabled: false } }} content={DEFAULT_WEBSITE_CONTENT} />);
    expect(screen.getByText(/Online deposit reservations are currently unavailable/)).toBeTruthy();
    expect(screen.queryByText(/Your reservation is confirmed after deposit verification/)).toBeNull();
  });

  it("preserves publication contacts, valid section targets and collapsed refund tiers", () => {
    const content = { ...DEFAULT_WEBSITE_CONTENT, contact: { ...DEFAULT_WEBSITE_CONTENT.contact, email: "reservations@example.com" } };
    const { container } = render(<BookingPolicyPage content={content} information={{ ...information, operations: { ...information.operations, validIdRequired: false, cancellationFullRefundDays: 0, cancellationPartialRefundDays: 0 } }} />);
    expect(screen.getByRole("link", { name: "Contact our team" }).getAttribute("href")).toBe("mailto:reservations@example.com");
    expect(screen.getByRole("link", { name: "View FAQ" }).getAttribute("href")).toBe("/#faq");
    for (const link of container.querySelectorAll('a[href^="#"]')) {
      expect(document.getElementById(link.getAttribute("href")!.slice(1))).toBeTruthy();
    }
    expect(within(screen.getByRole("region", { name: "Cancellation & refunds" })).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.queryByText(/government-issued ID/)).toBeNull();
  });

  it("switches narrow-screen panels with keyboard and tabs, then exposes every section on desktop", () => {
    let compact = true;
    const listeners = new Set<() => void>();
    vi.stubGlobal("matchMedia", () => ({ get matches() { return compact; }, addEventListener: (_: string, callback: () => void) => listeners.add(callback), removeEventListener: (_: string, callback: () => void) => listeners.delete(callback) }));
    render(<BookingPolicyPage content={DEFAULT_WEBSITE_CONTENT} information={information} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    expect(screen.getByRole("tabpanel", { name: "Before you reserve" })).toBeTruthy();
    fireEvent.keyDown(tabs[0], { key: "ArrowRight" });
    expect(screen.getByRole("tabpanel", { name: "Cancellation & refunds" })).toBeTruthy();
    expect(document.activeElement).toBe(tabs[1]);
    fireEvent.keyDown(tabs[1], { key: "End" });
    expect(screen.getByRole("tabpanel", { name: "Arrival & departure" })).toBeTruthy();
    fireEvent.click(tabs[1]);
    expect(screen.getByRole("tabpanel", { name: "Cancellation & refunds" })).toBeTruthy();
    act(() => { compact = false; listeners.forEach(callback => callback()); });
    expect(screen.queryByRole("tablist")).toBeNull();
    for (const name of ["Before you reserve", "Cancellation & refunds", "Arrival & departure"]) {
      expect(screen.getByRole("region", { name })).toBeTruthy();
    }
  });

  it("opens a linked section on narrow-screen arrival and follows browser fragment changes", () => {
    window.history.replaceState(null, "", "/booking-policy#arrival-departure");
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    render(<BookingPolicyPage content={DEFAULT_WEBSITE_CONTENT} information={information} />);
    expect(screen.getByRole("tabpanel", { name: "Arrival & departure" })).toBeTruthy();
    act(() => {
      window.history.replaceState(null, "", "/booking-policy#cancellation-refunds");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(screen.getByRole("tabpanel", { name: "Cancellation & refunds" })).toBeTruthy();
  });

  it("keeps one policy destination in the footer and no quick-links block on the policy page", () => {
    const { rerender } = render(<BookingPolicyPage content={DEFAULT_WEBSITE_CONTENT} information={information} />);
    expect(screen.queryByRole("navigation", { name: "Quick links" })).toBeNull();
    expect(screen.queryByText("Booking terms")).toBeNull();
    expect(screen.queryByText("Privacy policy")).toBeNull();
    rerender(<WebsiteFooter content={DEFAULT_WEBSITE_CONTENT} />);
    const footer = within(screen.getByRole("navigation", { name: "Footer" }));
    expect(footer.getByRole("link", { name: "Booking policy" }).getAttribute("href")).toBe("/booking-policy");
    expect(screen.queryByRole("link", { name: /Booking terms|Privacy policy|Deposit & cancellation/ })).toBeNull();
  });
});
