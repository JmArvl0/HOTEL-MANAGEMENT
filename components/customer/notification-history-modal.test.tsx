// @vitest-environment jsdom
// Notification history modal: hotel-day filtering, unread-first grouping,
// counts, empty states, and read semantics (opening never marks read).
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
  { id: "u1", title: "Deposit proof submitted", detail: "RSV-HVN-1 requires verification.", createdAt: "2026-09-15T09:18:00+08:00", href: "/account/payments", readAt: null },
  { id: "u2", title: "New guest request", detail: "Room 401 requested extra towels.", createdAt: "2026-09-15T10:42:00+08:00", readAt: null },
  { id: "r1", title: "Request approved", detail: "Request routed to Housekeeping.", createdAt: "2026-09-15T08:30:00+08:00", readAt: "2026-09-15T09:00:00+08:00" },
  { id: "y1", title: "Yesterday unread", detail: "Older event.", createdAt: "2026-09-14T20:00:00+08:00", readAt: null },
  { id: "s1", title: "Older unread", detail: "Much older event.", createdAt: "2026-09-13T12:00:00+08:00", readAt: null },
];

function openDayFilter() {
  fireEvent.click(screen.getByRole("button", { name: "Filter notifications by day" }));
}

describe("NotificationHistoryModal", () => {
  it("titles the dialog Notifications with Today as the default day", () => {
    render(<NotificationHistoryModal open onClose={() => {}} items={items} todayKey={TODAY} />);
    expect(screen.getByRole("dialog", { name: "Notifications" })).toBeTruthy();
    expect(screen.getByText("Review your notification history.")).toBeTruthy();
    expect(screen.getByText("Showing notifications from September 15, 2026")).toBeTruthy();
  });

  it("renders only the selected day with unread above read, newest-first", () => {
    render(<NotificationHistoryModal open onClose={() => {}} items={items} todayKey={TODAY} />);
    // Other hotel days stay hidden.
    expect(screen.queryByText("Yesterday unread")).toBeNull();
    expect(screen.queryByText("Older unread")).toBeNull();
    // Section order: unread heading precedes the read heading.
    const unreadHeading = screen.getByRole("heading", { name: /Unread/ });
    const readHeading = screen.getByRole("heading", { name: /Read/ });
    expect(unreadHeading.compareDocumentPosition(readHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Unread newest-first: 10:42 request above 09:18 deposit.
    const unreadSection = screen.getByRole("region", { name: "Unread notifications" });
    const titles = within(unreadSection).getAllByText(/New guest request|Deposit proof submitted/).map((el) => el.textContent);
    expect(titles).toEqual(["New guest request", "Deposit proof submitted"]);
    // Counts are exact.
    expect(unreadHeading.textContent).toContain("2");
    expect(readHeading.textContent).toContain("1");
  });

  it("switches to Yesterday on filter change", () => {
    render(<NotificationHistoryModal open onClose={() => {}} items={items} todayKey={TODAY} />);
    openDayFilter();
    fireEvent.click(screen.getByRole("option", { name: "Yesterday" }));
    expect(screen.getByText("Yesterday unread")).toBeTruthy();
    expect(screen.queryByText("New guest request")).toBeNull();
    expect(screen.getByText("Showing notifications from September 14, 2026")).toBeTruthy();
  });

  it("supports a specific date through the date input", () => {
    render(<NotificationHistoryModal open onClose={() => {}} items={items} todayKey={TODAY} />);
    openDayFilter();
    fireEvent.click(screen.getByRole("option", { name: "Specific date…" }));
    fireEvent.change(screen.getByLabelText("Choose a specific date"), { target: { value: "2026-09-13" } });
    expect(screen.getByText("Older unread")).toBeTruthy();
    expect(screen.queryByText("New guest request")).toBeNull();
  });

  it("shows an empty state when the selected day has no notifications", () => {
    render(<NotificationHistoryModal open onClose={() => {}} items={items} todayKey={TODAY} />);
    openDayFilter();
    fireEvent.click(screen.getByRole("option", { name: "Specific date…" }));
    fireEvent.change(screen.getByLabelText("Choose a specific date"), { target: { value: "2026-09-01" } });
    expect(screen.getByText("No notifications for this day.")).toBeTruthy();
  });

  it("never marks anything read just by opening", () => {
    const onMarkDayRead = vi.fn();
    render(<NotificationHistoryModal open onClose={() => {}} items={items} todayKey={TODAY} onMarkDayRead={onMarkDayRead} />);
    expect(onMarkDayRead).not.toHaveBeenCalled();
  });

  it("marks the visible day when Mark this day as read is pressed", () => {
    const onMarkDayRead = vi.fn();
    render(<NotificationHistoryModal open onClose={() => {}} items={items} todayKey={TODAY} onMarkDayRead={onMarkDayRead} />);
    fireEvent.click(screen.getByRole("button", { name: "Mark this day as read" }));
    expect(onMarkDayRead).toHaveBeenCalledTimes(1);
    expect(onMarkDayRead).toHaveBeenCalledWith("2026-09-15", ["u2", "u1"]);
  });

  it("keeps the View destination and notifies the parent on open", () => {
    const onOpenItem = vi.fn();
    render(<NotificationHistoryModal open onClose={() => {}} items={items} todayKey={TODAY} onOpenItem={onOpenItem} />);
    const view = screen.getAllByRole("link", { name: "View" })[0];
    expect(view.getAttribute("href")).toBe("/account/payments");
    fireEvent.click(view);
    expect(onOpenItem).toHaveBeenCalledTimes(1);
  });

  it("closes with Escape", () => {
    const onClose = vi.fn();
    render(<NotificationHistoryModal open onClose={onClose} items={items} todayKey={TODAY} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
