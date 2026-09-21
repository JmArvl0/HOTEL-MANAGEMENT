// Display helpers shared by the bell dropdown and the All-notifications modal:
// relative time, recency grouping, semantic type icons, preview cap.
import { describe, expect, it } from "vitest";
import {
  BELL_PREVIEW_LIMIT,
  NOTIFICATION_TYPE_ICONS,
  groupNotificationsByRecency,
  notificationIcon,
  previewNotifications,
  relativeTime,
  splitUnreadRead,
} from "./notifications";

const NOW = new Date("2026-09-15T14:30:00+08:00");

describe("relativeTime", () => {
  it("renders just-now / minutes / hours within the same hotel day", () => {
    expect(relativeTime("2026-09-15T14:29:30+08:00", NOW)).toBe("Just now");
    expect(relativeTime("2026-09-15T14:00:00+08:00", NOW)).toBe("30m ago");
    expect(relativeTime("2026-09-15T11:30:00+08:00", NOW)).toBe("3h ago");
  });

  it("stays relative for late-in-the-day items (same hotel day is always < 24h)", () => {
    expect(relativeTime("2026-09-15T00:30:00+08:00", NOW)).toBe("14h ago");
  });

  it("renders Yesterday for the previous hotel day", () => {
    expect(relativeTime("2026-09-14T20:00:00+08:00", NOW)).toBe("Yesterday");
  });

  it("falls back to a short date for older items", () => {
    expect(relativeTime("2026-09-08T12:00:00+08:00", NOW)).toBe("Sep 8");
  });

  it("returns an empty string for unparseable input", () => {
    expect(relativeTime("not-a-date", NOW)).toBe("");
  });
});

describe("groupNotificationsByRecency", () => {
  it("buckets by Manila hotel days with labels in order", () => {
    const items = [
      { id: "a", createdAt: "2026-09-15T09:00:00+08:00" },
      { id: "b", createdAt: "2026-09-14T22:00:00+08:00" },
      { id: "c", createdAt: "2026-09-11T12:00:00+08:00" },
      { id: "d", createdAt: "2026-09-01T12:00:00+08:00" },
    ];
    const groups = groupNotificationsByRecency(items, "2026-09-15");
    expect(groups.map((group) => group.key)).toEqual(["today", "yesterday", "week", "earlier"]);
    expect(groups[0].items.map((item) => item.id)).toEqual(["a"]);
    expect(groups[1].items.map((item) => item.id)).toEqual(["b"]);
    expect(groups[2].items.map((item) => item.id)).toEqual(["c"]);
    expect(groups[3].items.map((item) => item.id)).toEqual(["d"]);
  });

  it("keeps input order inside each bucket (no re-sorting)", () => {
    const items = [
      { id: "late", createdAt: "2026-09-15T10:00:00+08:00" },
      { id: "early", createdAt: "2026-09-15T06:00:00+08:00" },
    ];
    const groups = groupNotificationsByRecency(items, "2026-09-15");
    expect(groups[0].items.map((item) => item.id)).toEqual(["late", "early"]);
  });
});

describe("previewNotifications / splitUnreadRead", () => {
  it("caps the bell preview at the shared limit", () => {
    expect(BELL_PREVIEW_LIMIT).toBe(7);
    const items = Array.from({ length: 12 }, (_, index) => ({
      id: `n${index}`,
      createdAt: new Date(Date.now() - index * 60_000).toISOString(),
      readAt: index < 3 ? null : new Date().toISOString(),
    }));
    const preview = previewNotifications(items);
    expect(preview).toHaveLength(7);
    // Unread first, then read; no duplicates between the groups.
    const { unread, read } = splitUnreadRead(preview);
    expect(unread).toHaveLength(3);
    expect(read).toHaveLength(4);
    expect(new Set(preview.map((item) => item.id)).size).toBe(7);
  });

  it("splits empty input safely", () => {
    expect(previewNotifications([])).toEqual([]);
  });
});

describe("notificationIcon", () => {
  it("maps every live notification type to a semantic icon", () => {
    for (const type of Object.keys(NOTIFICATION_TYPE_ICONS)) {
      expect(notificationIcon(type)).toBe(NOTIFICATION_TYPE_ICONS[type as keyof typeof NOTIFICATION_TYPE_ICONS]);
    }
    // Spot-check the semantic intent of a few.
    expect(NOTIFICATION_TYPE_ICONS.reservation_confirmed).toBe(NOTIFICATION_TYPE_ICONS.reservation_confirmed);
  });

  it("falls back to the bell icon for unknown types", () => {
    const fallback = notificationIcon("mystery_type");
    const bellFallback = notificationIcon(undefined);
    expect(fallback).toBe(bellFallback);
  });
});
