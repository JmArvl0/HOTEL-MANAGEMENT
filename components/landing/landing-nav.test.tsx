// @vitest-environment jsdom
// Contract for the landing nav: the menu button toggles the mobile drawer
// (aria-expanded / drawer visibility), Escape closes it, and drawer links
// close the drawer on click.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { LandingNav } from "./landing-nav";

afterEach(cleanup);

// scope to the primary nav: the open drawer also exposes "Close menu" buttons
function menuButton() {
  return within(screen.getByRole("navigation", { name: "Primary" })).getByRole("button", { name: /menu$/i });
}

function drawer() {
  const el = document.getElementById("landing-drawer");
  expect(el).toBeTruthy();
  return el as HTMLElement;
}

describe("LandingNav", () => {
  it("shows the drawer closed by default", () => {
    render(<LandingNav />);
    expect(menuButton().getAttribute("aria-expanded")).toBe("false");
    expect(drawer().style.display).toBe("none");
  });

  it("toggles aria-expanded and shows the drawer on menu click", () => {
    render(<LandingNav />);
    fireEvent.click(menuButton());
    const button = menuButton(); // label flips to "Close menu" when open
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(drawer().getAttribute("aria-hidden")).toBe("false");
    expect(drawer().style.display).toBe("block");
    expect(screen.getByRole("dialog", { name: "Navigation menu" })).toBeTruthy();
    // closing via the menu button again hides it
    fireEvent.click(button);
    expect(menuButton().getAttribute("aria-expanded")).toBe("false");
    expect(drawer().style.display).toBe("none");
  });

  it("closes the drawer on Escape", () => {
    render(<LandingNav />);
    fireEvent.click(menuButton());
    fireEvent.keyDown(window, { key: "Escape" });
    expect(menuButton().getAttribute("aria-expanded")).toBe("false");
    expect(drawer().style.display).toBe("none");
  });

  it("closes the drawer when a drawer link is clicked", () => {
    render(<LandingNav />);
    fireEvent.click(menuButton());
    const link = screen.getByRole("dialog", { name: "Navigation menu" }).querySelector("a");
    expect(link).toBeTruthy();
    fireEvent.click(link as Element);
    expect(menuButton().getAttribute("aria-expanded")).toBe("false");
    expect(drawer().style.display).toBe("none");
  });
});
