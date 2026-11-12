// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { HotelFaq } from "./hotel-information";
import { DEFAULT_WEBSITE_CONTENT } from "@/lib/website-content";
import { DEFAULT_OPERATIONAL_POLICY } from "@/lib/hotel-policy";
import type { PublicBookingInformation } from "@/lib/public-booking-information";

const information: PublicBookingInformation = {
  deposit: { enabled: true, calculationType: "percentage", percentageBasisPoints: 3500, fixedAmount: 0, holdMinutes: 18, remainingBalanceDue: "Balance due on arrival" },
  operations: { ...DEFAULT_OPERATIONAL_POLICY, checkInTime: "15:00", checkOutTime: "11:00", minimumBookingAge: 21 },
};
beforeEach(() => {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("arrival FAQ", () => {
  it("opens and focuses each shortcut's answer without filtering out other questions", () => {
    const { container } = render(<HotelFaq content={DEFAULT_WEBSITE_CONTENT} information={information} />);
    const shortcuts = within(screen.getByRole("navigation", { name: "Arrival information shortcuts" })).getAllByRole("link");
    const rows = container.querySelectorAll("details");
    expect(rows).toHaveLength(8 + DEFAULT_WEBSITE_CONTENT.customFaq.length);
    for (const [index, shortcut] of shortcuts.entries()) {
      const target = document.getElementById(shortcut.getAttribute("href")!.slice(1)) as HTMLDetailsElement;
      fireEvent.click(shortcut);
      expect(target.open).toBe(true);
      expect(document.activeElement).toBe(target.querySelector("summary"));
      expect(target).toBe(rows[[0, 1, 2, 3, 5][index]]);
      expect(container.querySelectorAll("details")).toHaveLength(rows.length);
    }
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "instant" });
  });

  it("preserves configured operating policy, dining, deposit and additional questions", () => {
    const content = { ...DEFAULT_WEBSITE_CONTENT, isDemo: false, family: { summary: "Children are welcome.", extraBeds: "Cots available on request." }, accessibility: { summary: "Step-free entrance and assistance on request." }, customFaq: [{ question: "Where is the entrance?", answer: "Use the north lobby." }] };
    const { container } = render(<HotelFaq content={content} information={information} />);
    expect(container.textContent).toContain("3:00 PM");
    expect(container.textContent).toContain("11:00 AM");
    expect(container.textContent).toContain("18-minute hold");
    expect(container.textContent).toContain("35%");
    expect(container.textContent).toContain("at least 21");
    expect(container.textContent).toContain("Balance due on arrival");
    expect(container.textContent).toContain("Children are welcome. Cots available on request.");
    expect(container.textContent).toContain("Step-free entrance and assistance on request.");
    expect(container.textContent).toContain("Use the north lobby.");
    expect(container.textContent).toContain(`₱${content.dining.breakfastPrice.toLocaleString("en-PH")}`);
  });

  it("keeps the requested contact actions with configured client or mock demo destinations", () => {
    const { rerender } = render(<HotelFaq content={{ ...DEFAULT_WEBSITE_CONTENT, isDemo: false, contact: { phone: "+63 2 8123 4567", email: "desk@property.example", frontDeskHours: "24 hours" } }} information={information} />);
    expect(screen.getByRole("link", { name: "Contact Front Desk" }).getAttribute("href")).toBe("tel:+63281234567");
    expect(screen.getByRole("link", { name: "Email us" }).getAttribute("href")).toBe("mailto:desk@property.example");
    rerender(<HotelFaq content={DEFAULT_WEBSITE_CONTENT} information={information} />);
    expect(screen.getByRole("link", { name: "Contact Front Desk" }).getAttribute("href")).toBe(`tel:${DEFAULT_WEBSITE_CONTENT.contact.phone.replace(/[^+0-9]/g, "")}`);
    expect(screen.getByRole("link", { name: "Email us" }).getAttribute("href")).toBe(`mailto:${DEFAULT_WEBSITE_CONTENT.contact.email}`);
    expect(screen.getByText("Our Front Desk can help with arrival, booking or accessibility requests.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Booking information" })).toBeNull();
    expect(screen.queryByRole("link", { name: "My reservations" })).toBeNull();
    rerender(<HotelFaq content={{ ...DEFAULT_WEBSITE_CONTENT, contact: { ...DEFAULT_WEBSITE_CONTENT.contact, phone: "+63 2 8555 0123", email: "frontdesk@demo.example" } }} information={information} />);
    expect(screen.getByRole("link", { name: "Contact Front Desk" }).getAttribute("href")).toBe("tel:+63285550123");
    expect(screen.getByRole("link", { name: "Email us" }).getAttribute("href")).toBe("mailto:frontdesk@demo.example");
  });

  it("keeps shortcut targets unique when an editor preview and another FAQ coexist", () => {
    const { container } = render(<><HotelFaq content={DEFAULT_WEBSITE_CONTENT} information={information} /><HotelFaq content={DEFAULT_WEBSITE_CONTENT} information={information} /></>);
    const ids = [...container.querySelectorAll("[id]")].map(element => element.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const region of container.querySelectorAll('[role="region"]')) expect(document.getElementById(region.getAttribute("aria-labelledby")!)).toBeTruthy();
  });
});
