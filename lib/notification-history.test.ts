// Notification-history helpers: hotel-day bucketing, day resolution,
// unread-first grouping, and read_at exposure/scoping on the guest store.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/fake-supabase";

const fake = vi.hoisted(() => ({ db: {} as Record<string, Record<string, unknown>[]> }));
vi.mock("@/lib/supabase", async () => {
  const { fakeSupabase: make } = await import("@/lib/fake-supabase");
  return { supabase: make(fake.db as FakeDb) };
});

const {
  filterNotificationsByHotelDay,
  getCustomerNotifications,
  hotelDayKey,
  hotelTodayKey,
  markNotificationsRead,
  recordNotification,
  resolveNotificationDay,
  splitUnreadRead,
} = await import("@/lib/notifications");

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

const resetDb = () => {
  for (const key of Object.keys(fake.db)) delete fake.db[key];
};

describe("hotelDayKey", () => {
  it("buckets by the Manila hotel day, not the UTC calendar day", () => {
    // Sep 15 00:30 Manila == Sep 14 16:30 UTC — still Sep 15 for the hotel.
    expect(hotelDayKey("2026-09-14T16:30:00.000Z")).toBe("2026-09-15");
    expect(hotelDayKey("2026-09-14T15:30:00.000Z")).toBe("2026-09-14");
  });

  it("returns empty for missing or unparseable timestamps", () => {
    expect(hotelDayKey(null)).toBe("");
    expect(hotelDayKey(undefined)).toBe("");
    expect(hotelDayKey("not-a-date")).toBe("");
  });

  it("derives today in Manila time", () => {
    expect(hotelTodayKey(new Date("2026-09-15T15:30:00.000Z"))).toBe("2026-09-15");
  });
});

describe("resolveNotificationDay", () => {
  it("resolves today, yesterday, and explicit dates", () => {
    expect(resolveNotificationDay("today", "2026-09-15")).toBe("2026-09-15");
    expect(resolveNotificationDay("yesterday", "2026-09-15")).toBe("2026-09-14");
    expect(resolveNotificationDay("2026-09-10", "2026-09-15")).toBe("2026-09-10");
  });

  it("falls back to today for garbage input", () => {
    expect(resolveNotificationDay("someday", "2026-09-15")).toBe("2026-09-15");
    expect(resolveNotificationDay("", "2026-09-15")).toBe("2026-09-15");
  });
});

describe("filterNotificationsByHotelDay", () => {
  const items = [
    { id: "a", createdAt: "2026-09-14T16:30:00.000Z" }, // Sep 15 Manila
    { id: "b", createdAt: "2026-09-14T15:30:00.000Z" }, // Sep 14 Manila
    { id: "c", createdAt: null },
  ];

  it("renders only the selected hotel day", () => {
    expect(filterNotificationsByHotelDay(items, "2026-09-15").map((i) => i.id)).toEqual(["a"]);
    expect(filterNotificationsByHotelDay(items, "2026-09-14").map((i) => i.id)).toEqual(["b"]);
  });

  it("never matches undated items", () => {
    expect(filterNotificationsByHotelDay(items, "")).toEqual([]);
  });
});

describe("splitUnreadRead", () => {
  it("puts unread first and sorts both sections newest-first", () => {
    const items = [
      { id: "read-old", createdAt: "2026-09-15T01:00:00+08:00", readAt: "2026-09-15T02:00:00+08:00" },
      { id: "unread-old", createdAt: "2026-09-15T01:00:00+08:00", readAt: null },
      { id: "read-new", createdAt: "2026-09-15T03:00:00+08:00", readAt: "2026-09-15T04:00:00+08:00" },
      { id: "unread-new", createdAt: "2026-09-15T05:00:00+08:00", readAt: null },
    ];
    const { unread, read } = splitUnreadRead(items);
    expect(unread.map((i) => i.id)).toEqual(["unread-new", "unread-old"]);
    expect(read.map((i) => i.id)).toEqual(["read-new", "read-old"]);
  });

  it("never intermixes read and unread", () => {
    const { unread, read } = splitUnreadRead([
      { id: "r", createdAt: "2026-09-15T09:00:00+08:00", readAt: "2026-09-15T10:00:00+08:00" },
      { id: "u", createdAt: "2026-09-15T01:00:00+08:00", readAt: null },
    ]);
    expect(unread.map((i) => i.id)).toEqual(["u"]);
    expect(read.map((i) => i.id)).toEqual(["r"]);
  });
});

describe("guest read state", () => {
  beforeEach(resetDb);

  it("exposes readAt/type and scopes mark-read to the owning user", async () => {
    await recordNotification({ userId: A, type: "deposit_verified", title: "mine" });
    await recordNotification({ userId: B, type: "deposit_verified", title: "theirs" });
    const mine = (await getCustomerNotifications(A)).find((row) => row.title === "mine");
    expect(mine?.readAt ?? null).toBeNull();
    expect(mine?.type).toBe("deposit_verified");
    await markNotificationsRead(A, [mine!.id]);
    const after = await getCustomerNotifications(A);
    expect(after.find((row) => row.id === mine!.id)?.readAt).toBeTruthy();
    // The other guest's row is untouched by A's mark-read.
    expect((await getCustomerNotifications(B))[0].readAt ?? null).toBeNull();
  });
});
