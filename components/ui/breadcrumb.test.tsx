// @vitest-environment jsdom
// Contract for the shared ui/Navigation Breadcrumb used by the booking flow:
// semantic trail, current page marked with aria-current, links keyboard-reachable,
// separators hidden from screen readers.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { Breadcrumb } from "./Navigation";

afterEach(cleanup);

const trail = [
  { label: "Find a Room", href: "/account/find-room?checkIn=2026-09-10" },
  { label: "Guest details", href: "/booking/details?roomType=King" },
  { label: "Review", current: true },
];

describe("Breadcrumb", () => {
  it("renders a labelled ordered list with every crumb", () => {
    render(<Breadcrumb items={trail}/>);
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    const list = within(nav).getByRole("list");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(nav.textContent).toContain("Find a Room");
    expect(nav.textContent).toContain("Guest details");
    expect(nav.textContent).toContain("Review");
  });

  it("marks only the current crumb with aria-current and renders ancestors as links", () => {
    render(<Breadcrumb items={trail}/>);
    const current = screen.getByText("Review");
    expect(current.getAttribute("aria-current")).toBe("page");
    expect(current.tagName).toBe("SPAN");
    const findRoom = screen.getByText("Find a Room");
    expect(findRoom.tagName).toBe("A");
    expect(findRoom.getAttribute("href")).toBe("/account/find-room?checkIn=2026-09-10");
    expect(findRoom.getAttribute("aria-current")).toBe(null);
  });

  it("hides separators from assistive technology", () => {
    render(<Breadcrumb items={trail}/>);
    const separators = document.querySelectorAll(".breadcrumb-separator");
    expect(separators.length).toBe(2);
    separators.forEach((separator) => expect(separator.getAttribute("aria-hidden")).toBe("true"));
  });
});
