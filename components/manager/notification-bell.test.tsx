// @vitest-environment jsdom
// Header notification bell: exactly ONE aggregate badge for the live-alert
// list, never one pill per notification source. Sidebar workload badges keep
// their own metric counts and toasts stay transient — both covered by their
// own suites (manager-sidebar-nav, toast-stack), not duplicated here.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { countUniqueNotifications, HeaderNotificationBell } from "./manager-dashboard-client";

// The dashboard file pulls in recharts via its panel imports; jsdom has no
// ResizeObserver or layout. (Same stubs as manager-sidebar-nav.test.tsx.)
class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
if (!window.matchMedia) {
  Object.assign(window, {
    matchMedia: (query: string) => ({
      matches: false, media: query, onchange: null,
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// Mirrors the observed bug: alerts from guest_requests + housekeeping must
// aggregate into one badge, not overlap as separate numerals.
const multiModule = [
  { id: "request-123", title: "Guest request requires coordination", section: "guest_requests" },
  { id: "dept-hk-1", title: "Room-care task open", section: "housekeeping_tasks" },
  { id: "dept-hk-2", title: "Room-care task open", section: "housekeeping_tasks" },
];

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("countUniqueNotifications", () => {
  it("returns 0 for missing or empty lists", () => {
    expect(countUniqueNotifications(null)).toBe(0);
    expect(countUniqueNotifications(undefined)).toBe(0);
    expect(countUniqueNotifications([])).toBe(0);
  });

  it("aggregates unread alerts across modules into one total", () => {
    expect(countUniqueNotifications(multiModule)).toBe(3);
  });

  it("counts a duplicated event id once", () => {
    expect(countUniqueNotifications([...multiModule, { id: "request-123" }])).toBe(3);
  });
});

describe("HeaderNotificationBell", () => {
  it("renders no numeric badge at 0 with a plain label", () => {
    const { container } = render(<HeaderNotificationBell count={0} expanded={false} onToggle={() => {}} />);
    expect(container.querySelectorAll(".nav-badge")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Notifications" })).toBeTruthy();
  });

  it("renders exactly one badge aggregating multi-module alerts", () => {
    const count = countUniqueNotifications(multiModule);
    const { container } = render(<HeaderNotificationBell count={count} expanded={false} onToggle={() => {}} />);
    const badges = container.querySelectorAll(".nav-badge");
    expect(badges).toHaveLength(1);
    expect(badges[0].textContent).toBe("3");
    // The numeral is presentational; the button label carries the count.
    expect(badges[0].getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByRole("button", { name: "Notifications, 3 current" })).toBeTruthy();
  });

  it("caps triple-digit counts at 99+", () => {
    const { container } = render(<HeaderNotificationBell count={100} expanded={false} onToggle={() => {}} />);
    expect(container.querySelector(".nav-badge")?.textContent).toBe("99+");
    expect(screen.getByRole("button", { name: "Notifications, 100 current" })).toBeTruthy();
  });

  it("toggles the popover on click without touching any count", () => {
    const onToggle = vi.fn();
    render(<HeaderNotificationBell count={2} expanded={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button", { name: "Notifications, 2 current" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
