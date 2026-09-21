// @vitest-environment jsdom
// Notification history modal: All/Unread/Read tabs (All first, default),
// Newest/Oldest sort, hotel-day filter retained, recency grouping
// (Today/Yesterday/Earlier this week/Earlier, Manila days), load-more footer,
// and read semantics (opening never marks read).
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NotificationHistoryModal, type NotificationHistoryItem } from "./notification-history-modal";

beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({ matches: false, media: query, onchange: null,
         addListener: () => {}, removeListener: () => {},
         addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as MediaQueryList;
  }
});

afterEach(cleanup);

const TODAY = "2026-09-15";
const items: NotificationHistoryItem[] = [
  { id: "u1", title: "Deposit proof submitted", detail: "RSV-HVN-1 requires verification.", createdAt: "2026-09-15T09:18:00+08:00", href: "/account/payments", readAt: null, type: "deposit_verified" },
  { id: "u2", title: "New guest request", detail: "Room 401 requested extra towels.", createdAt: "2026-09-15T10:42:00+08:00", readAt: null, type: "request_batch_reviewed" },
  { id: "r1", title: "Request approved", detail: "Request routed to Housekeeping.", createdAt: "2026-09-15T08:30:00+08:00", readAt: "2026-09-15T09:00:00+08:00", type: "request_batch_reviewed" },
  { id: "y1", title: "Yesterday unread", detail: "Older event.", createdAt: "2026-09-14T20:00:00+08:00", readAt: null, type: "reservation_confirmed" },
  { id: "s1", title: "Week-old read", detail: "Much older event.", createdAt: "2026-09-08T12:00:00+08:00", readAt: "2026-09-09T09:00:00+08:00", type: "reservation_confirmed" },
];

function openDayFilter() {
  fireEvent.click(screen.getByRole("button", { name: "Filter notifications by date" }));
}

function openSort() {
  fireEvent.click(screen.getByRole("button", { name: "Sort notifications" }));
}

describe("NotificationHistoryModal", () => {
  it("titles the dialog All notifications with the All tab default", () => {
    render(<NotificationHistoryModal open onClose={() => {}} items={items} todayKey={TODAY} />);
    expect(screen.getByRole("dialog", { name: "All notifications" })).toBeTruthy();
    expect(screen.getByText("Stay updated with important information about your reservations, payments, and stay.")).toBeTruthy();
    // All appears first and is active by default.
    const tabs = document.querySelectorAll(".nh-tab");
    expect(tabs[0]?.textContent).toContain("All");
    expect(tabs[0]?.classList.contains("is-active")).toBe(true);
    // Tab counts from the full loaded set: All 5 · Unread 3 · Read 2.
    expect(tabs[0]?.textContent).toContain("5");
    expect(tabs[1]?.textContent).toContain("3");
    expect(tabs[2]?.textContent).toContain("2");
  });

  it("shows the complete loaded history grouped by hotel-day recency", () => {
    render(<NotificationHistoryModal open onClose={() => {}} items={items} todayKey={TODAY} />);
    // All five items are present — not just one day's slice.
    expect(screen.getByText("New guest request")).toBeTruthy();
    expect(screen.getByText("Yesterday unread")).toBeTruthy();
    expect(screen.getByText("Week-old read")).toBeTruthy();
    // Recency sections: Today, Yesterday, Earlier (week bucket is day-6..1;
    // Sep 8 is 7 days back → Earlier). Order follows the label sequence.
    const groups = document.querySelectorAll(".nh-recency .nh-section");
    expect(groups.length).toBe(3);
    expect(groups[0]?.textContent).toContain("Today");
    expect(groups[1]?.textContent).toContain("Yesterday");
    expect(groups[2]?.textContent).toContain("Earlier");
    // Footer reflects the full visible history.
    expect(screen.getByText("Showing all 5 notifications")).toBeTruthy();
  });

  it("filters by the Unread and Read tabs immediately", () => {
    render(<NotificationHistoryModal open onClose={() => {}} items={items} todayKey={TODAY} />);
    fireEvent.click(screen.getByRole("button", { name: /Unread/ }));
    expect(screen.getByText("Deposit proof submitted")).toBeTruthy();
    expect(screen.queryByText("Request approved")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Read/ }));
    expect(screen.getByText("Request approved")).toBeTruthy();
    expect(screen.queryByText("Deposit proof submitted")).toBeNull();
  });

  it("sorts oldest-first without changing the grouped labels", () => {
    render(<NotificationHistoryModal open onClose={() => {}} items={items} todayKey={TODAY} />);
    openSort();
    fireEvent.click(screen.getByRole("option", { name: "Oldest first" }));
    // Within Today's group, the oldest unread now leads.
    const today = document.querySelector('.nh-recency[aria-label="Today"]') as HTMLElement;
    const titles = within(today).getAllByText(/Deposit proof submitted|New guest request|Request approved/).map((el) => el.textContent);
    expect(titles[0]).toBe("Request approved");
    // Switch back to newest.
    openSort();
    fireEvent.click(screen.getByRole("option", { name: "Newest first" }));
    const todayAgain = document.querySelector('.nh-recency[aria-label="Today"]') as HTMLElement;
    expect(within(todayAgain).getAllByText(/Deposit proof submitted|New guest request|Request approved/)[0].textContent).toBe("New guest request");
  });

  it("keeps the hotel-day filter working alongside the tabs", () => {
    render(<NotificationHistoryModal open onClose={() => {}} items={items} todayKey={TODAY} />);
    openDayFilter();
    fireEvent.click(screen.getByRole("option", { name: "Yesterday" }));
    expect(screen.getByText("Showing notifications from September 14, 2026")).toBeTruthy();
    expect(screen.getByText("Yesterday unread")).toBeTruthy();
    expect(screen.queryByText("New guest request")).toBeNull();
    // Day view keeps the unread/read sections inside the All tab.
    expect(document.querySelectorAll(".cnr.is-unread").length).toBe(1);
    // Tab + day combine: the Read tab over Yesterday shows nothing.
    fireEvent.click(screen.getByRole("button", { name: /Read/ }));
    expect(screen.getByText("No read notifications for this date.")).toBeTruthy();
  });

  it("supports a specific date and its empty state", () => {
    render(<NotificationHistoryModal open onClose={() => {}} items={items} todayKey={TODAY} />);
    openDayFilter();
    fireEvent.click(screen.getByRole("option", { name: "Custom date…" }));
    fireEvent.change(screen.getByLabelText("Choose a custom date"), { target: { value: "2026-09-01" } });
    expect(screen.getByText("No notifications for this date.")).toBeTruthy();
  });

  it("never marks anything read just by opening", () => {
    const onMarkDayRead = vi.fn();
    render(<NotificationHistoryModal open onClose={() => {}} items={items} todayKey={TODAY} onMarkDayRead={onMarkDayRead} />);
    expect(onMarkDayRead).not.toHaveBeenCalled();
  });

  it("marks the visible date when Mark visible as read is pressed", () => {
    const onMarkDayRead = vi.fn();
    render(<NotificationHistoryModal open onClose={() => {}} items={items} todayKey={TODAY} onMarkDayRead={onMarkDayRead} />);
    openDayFilter();
    fireEvent.click(screen.getByRole("option", { name: "Yesterday" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark visible as read" }));
    expect(onMarkDayRead).toHaveBeenCalledTimes(1);
    expect(onMarkDayRead).toHaveBeenCalledWith("2026-09-14", ["y1"]);
  });

  it("offers Load more only when older history may exist", () => {
    const onLoadMore = vi.fn();
    const { rerender } = render(
      <NotificationHistoryModal open onClose={() => {}} items={items} todayKey={TODAY} onLoadMore={onLoadMore} hasMore />
    );
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Showing the most recent 5 notifications")).toBeTruthy();
    // Exhausted history: footer flips to the complete count, control gone.
    rerender(<NotificationHistoryModal open onClose={() => {}} items={items} todayKey={TODAY} onLoadMore={onLoadMore} hasMore={false} />);
    expect(screen.getByText("Showing all 5 notifications")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("renders rows through the shared row component with semantic icons and times", () => {
    render(<NotificationHistoryModal open onClose={() => {}} items={items} todayKey={TODAY} />);
    // Semantic icon mapping: deposit rows carry the shared icon chip...
    expect(document.querySelectorAll(".cnr-icon").length).toBe(5);
    // ...unread rows keep the accessible dot, read rows do not.
    expect(document.querySelectorAll(".cnr.is-unread .cnr-dot").length).toBe(3);
    // Clock-variant rows inside dated groups render Manila clock times.
    const today = document.querySelector('.nh-recency[aria-label="Today"]') as HTMLElement;
    const times = within(today).getAllByRole("time").map((el) => el.textContent ?? "");
    expect(times.length).toBe(3);
    for (const value of times) expect(value).toMatch(/^\d{1,2}:\d{2}\s?(AM|PM)$/i);
  });

  it("keeps the View destination and notifies the parent on open", () => {
    const onOpenItem = vi.fn();
    render(<NotificationHistoryModal open onClose={() => {}} items={items} todayKey={TODAY} onOpenItem={onOpenItem} />);
    const row = screen.getByText("Deposit proof submitted").closest(".cnr") as HTMLAnchorElement;
    expect(row.getAttribute("href")).toBe("/account/payments");
    fireEvent.click(row);
    expect(onOpenItem).toHaveBeenCalledTimes(1);
  });

  it("shows the all-caught-up empty state", () => {
    render(<NotificationHistoryModal open onClose={() => {}} items={[]} todayKey={TODAY} />);
    expect(screen.getByText("No notifications yet.")).toBeTruthy();
  });

  it("shows skeleton rows while loading", () => {
    render(<NotificationHistoryModal open onClose={() => {}} items={[]} loading todayKey={TODAY} />);
    expect(screen.getByRole("status").textContent).toContain("Loading notifications");
    expect(document.querySelectorAll(".nh-skeleton").length).toBe(4);
  });

  it("closes with Escape", () => {
    const onClose = vi.fn();
    render(<NotificationHistoryModal open onClose={onClose} items={items} todayKey={TODAY} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
