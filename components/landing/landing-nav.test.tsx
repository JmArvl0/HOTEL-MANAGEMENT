// @vitest-environment jsdom
// Navigation behavior: drawer accessibility, real scroll events, active-link
// geometry, cross-page links and the motion-aware return-to-top action.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

describe("scroll-aware public navigation", () => {
  const positions: Record<string, number> = { book: 500, stay: 1000, amenities: 2000, dining: 2400, gallery: 3000, "how-to-go": 4000, contact: 5000, faq: 6000 };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("scrollY", 0);
    vi.stubGlobal("innerHeight", 800);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 16));
    vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
    Object.defineProperty(document.documentElement, "scrollHeight", { configurable: true, value: 7200 });
    // jsdom has no layout; supply section geometry while exercising the real events and DOM.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const top = (positions[this.id] ?? 0) - window.scrollY;
      return { top, bottom: top + 400, height: this.id in positions ? 400 : 0, left: 0, right: 100, width: 100, x: 0, y: top, toJSON: () => ({}) };
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    Reflect.deleteProperty(document.documentElement, "scrollHeight");
    window.history.replaceState(null, "", "/");
  });

  function mount(props: Parameters<typeof LandingNav>[0] = {}) {
    const view = render(<main><LandingNav overHero {...props} />{Object.keys(positions).map(id => <section key={id} id={id} />)}</main>);
    Object.defineProperty(screen.getByRole("navigation", { name: "Primary" }), "offsetHeight", { value: 88 });
    return view;
  }

  function scrollTo(top: number) {
    act(() => {
      vi.stubGlobal("scrollY", top);
      fireEvent.scroll(window);
      vi.advanceTimersByTime(20);
    });
  }

  function primaryLink(name: string) {
    return within(screen.getByRole("navigation", { name: "Primary" })).getByRole("link", { name });
  }

  it("returns the bounded amenities content to its beginning through desktop and drawer links", () => {
    mount();
    const amenities = document.getElementById("amenities")!;
    amenities.innerHTML = '<div class="hotel-amenities-layout"><div class="hotel-amenities-facilities"></div><article class="hotel-dining"></article></div>';
    const panes = [...amenities.querySelectorAll<HTMLElement>("div, article")];
    panes.forEach(pane => { pane.scrollTop = 120; });
    fireEvent.click(primaryLink("Amenities"), { ctrlKey: true });
    expect(panes.every(pane => pane.scrollTop === 120)).toBe(true);
    fireEvent.click(primaryLink("Amenities"));
    expect(panes.every(pane => pane.scrollTop === 0)).toBe(true);
    panes.forEach(pane => { pane.scrollTop = 80; });
    fireEvent.click(menuButton());
    fireEvent.click(within(screen.getByRole("dialog", { name: "Navigation menu" })).getByRole("link", { name: "Amenities" }));
    expect(panes.every(pane => pane.scrollTop === 0)).toBe(true);
    expect(drawer().style.display).toBe("none");
  });

  it("keeps Amenities current when its nested dining card shares the frame", () => {
    mount();
    const amenities = document.getElementById("amenities")!;
    amenities.className = "hotel-amenities-section";
    amenities.append(document.getElementById("dining")!);
    window.history.replaceState(null, "", "/#amenities");
    scrollTo(2300);
    expect(primaryLink("Amenities").getAttribute("aria-current")).toBe("location");
    expect(primaryLink("Dining").hasAttribute("aria-current")).toBe(false);
    act(() => {
      window.history.replaceState(null, "", "/#dining");
      fireEvent(window, new HashChangeEvent("hashchange"));
      vi.advanceTimersByTime(20);
    });
    expect(primaryLink("Dining").getAttribute("aria-current")).toBe("location");
  });

  it("tracks manual scrolling down and back up without changing the URL hash", () => {
    window.history.replaceState(null, "", "/#gallery");
    mount();
    expect(primaryLink("Gallery").hasAttribute("aria-current")).toBe(false);
    scrollTo(900);
    expect(primaryLink("Rooms").getAttribute("aria-current")).toBe("location");
    scrollTo(2300);
    expect(primaryLink("Dining").getAttribute("aria-current")).toBe("location");
    scrollTo(2900);
    expect(primaryLink("Gallery").getAttribute("aria-current")).toBe("location");
    expect(primaryLink("Rooms").hasAttribute("aria-current")).toBe(false);
    scrollTo(900);
    expect(primaryLink("Rooms").getAttribute("aria-current")).toBe("location");
    scrollTo(0);
    expect(primaryLink("Rooms").hasAttribute("aria-current")).toBe(false);
    expect(window.location.hash).toBe("#gallery");
  });

  it("moves one underline to the current link and remeasures on resize", () => {
    const { container } = mount();
    const rooms = primaryLink("Rooms");
    const gallery = primaryLink("Gallery");
    Object.defineProperties(rooms, { offsetLeft: { value: 10 }, offsetWidth: { value: 54 } });
    Object.defineProperties(gallery, { offsetLeft: { configurable: true, value: 240 }, offsetWidth: { value: 70 } });
    scrollTo(900);
    const line = container.querySelector<HTMLElement>(".landing-nav-indicator")!;
    expect(line.style.transform).toBe("translateX(10px) scaleX(54)");
    scrollTo(2900);
    expect(line.style.transform).toBe("translateX(240px) scaleX(70)");
    Object.defineProperty(gallery, "offsetLeft", { value: 280 });
    fireEvent.resize(window);
    expect(line.style.transform).toBe("translateX(280px) scaleX(70)");
  });

  it("shows FAQ on desktop and keeps the drawer's current location in sync", () => {
    mount();
    scrollTo(5900);
    expect(primaryLink("FAQ").getAttribute("aria-current")).toBe("location");
    fireEvent.click(menuButton());
    const faq = within(screen.getByRole("dialog")).getByRole("link", { name: "FAQ" });
    expect(faq.getAttribute("aria-current")).toBe("location");
    expect(screen.queryByRole("button", { name: "Back to top" })).toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("button", { name: "Back to top" })).toBeTruthy();
  });

  it("excludes disabled sections and the demo's duplicate Contact destination", () => {
    mount({ visibleSections: { gallery: false, amenities: false, faq: false }, contact: { isDemo: true, phone: "", frontDeskHours: "" } });
    for (const label of ["Gallery", "Amenities", "Dining", "FAQ", "Contact"]) {
      expect(within(screen.getByRole("navigation", { name: "Primary" })).queryByRole("link", { name: label })).toBeNull();
    }
    scrollTo(5900);
    expect(primaryLink("Location").getAttribute("aria-current")).toBe("location");
  });

  it("keeps a secondary page's active link while scrolling", () => {
    mount({ active: "Rooms", rootLinks: true });
    scrollTo(5900);
    expect(primaryLink("Rooms").getAttribute("aria-current")).toBe("page");
    expect(primaryLink("FAQ").hasAttribute("aria-current")).toBe(false);
    expect(primaryLink("Gallery").getAttribute("href")).toBe("/#gallery");
  });

  it.each([false, true])("returns to the top, clears the old anchor and restores focus (reduced motion: %s)", reducedMotion => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: reducedMotion })));
    const scroll = vi.fn();
    vi.stubGlobal("scrollTo", scroll);
    mount();
    expect(screen.queryByRole("button", { name: "Back to top" })).toBeNull();
    scrollTo(900);
    window.history.replaceState({ retained: true }, "", "/?guests=2#stay");
    fireEvent.click(screen.getByRole("button", { name: "Back to top" }));
    expect(scroll).toHaveBeenCalledWith({ top: 0, behavior: reducedMotion ? "instant" : "smooth" });
    expect(window.location.hash).toBe("");
    expect(window.location.search).toBe("?guests=2");
    expect(window.history.state).toEqual({ retained: true });
    expect(document.activeElement).toBe(primaryLink("Haven Hotel home"));
    scrollTo(0);
    expect(screen.queryByRole("button", { name: "Back to top" })).toBeNull();
  });
});
