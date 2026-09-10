import { describe, expect, it } from "vitest";
import { approvalKind, compareApprovalUrgency, formatDetail, waitingSince } from "./approval-display";

const HOUR = 3600_000;

describe("waitingSince", () => {
  it("formats sub-minute, minutes, hours, and days buckets", () => {
    const now = Date.UTC(2026, 8, 8, 12, 0, 0);
    expect(waitingSince(new Date(now - 20_000).toISOString(), now)).toBe("just now");
    expect(waitingSince(new Date(now - 12 * 60_000).toISOString(), now)).toBe("12m");
    expect(waitingSince(new Date(now - 2 * HOUR - 15 * 60_000).toISOString(), now)).toBe("2h 15m");
    expect(waitingSince(new Date(now - 3 * HOUR).toISOString(), now)).toBe("3h");
    expect(waitingSince(new Date(now - 26 * HOUR).toISOString(), now)).toBe("1d 2h");
    expect(waitingSince(new Date(now - 48 * HOUR).toISOString(), now)).toBe("2d");
  });
  it("returns a dash for missing or unparseable timestamps and never negative", () => {
    expect(waitingSince(null)).toBe("—");
    expect(waitingSince("not a date")).toBe("—");
    expect(waitingSince(new Date(Date.now() + HOUR).toISOString())).toBe("just now");
  });
});

describe("formatDetail", () => {
  it("humanizes known keys, labels unknown camelCase, and joins with a separator", () => {
    expect(formatDetail({ requestedRoomType: "Executive Suite", priceDifference: 1500, waived: true })).toBe(
      "Requested room type: Executive Suite · Price difference: 1,500 · Price difference waived: yes"
    );
    expect(formatDetail({ requestedResolution: "Manager coordination" })).toBe("Requested resolution: Manager coordination");
    expect(formatDetail({ someFutureKey: "value" })).toBe("Some Future Key: value");
  });
  it("drops empty values and returns an empty string for non-objects", () => {
    expect(formatDetail({ a: null, b: "", c: false, d: "kept" })).toBe("D: kept");
    expect(formatDetail(null)).toBe("");
    expect(formatDetail("text")).toBe("");
    expect(formatDetail({})).toBe("");
  });
  it("hides raw uuid identifiers and labels the structured room-exception fields", () => {
    const action = {
      roomType: "Deluxe King",
      originalRoomTypeId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      originalRoomType: "Garden Twin",
      requestedRoomTypeId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      requestedRoomId: "RM-205ABCD",
      requestedRoomNumber: "205",
    };
    expect(formatDetail(action)).toBe(
      "Room type: Deluxe King · Original room type: Garden Twin · Requested room: 205"
    );
  });
});

describe("compareApprovalUrgency", () => {
  const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * HOUR).toISOString();
  it("orders critical before high before normal, then oldest first", () => {
    const normal = { severity: "normal", requested_at: at(5) };
    const critical = { severity: "critical", requested_at: at(1) };
    const highOld = { severity: "high", requested_at: at(4) };
    const highNew = { severity: "high", requested_at: at(2) };
    const order = [normal, highNew, critical, highOld].sort(compareApprovalUrgency);
    expect(order.map((row) => row.severity)).toEqual(["critical", "high", "high", "normal"]);
    expect(order[1].requested_at).toBe(highOld.requested_at);
  });
  it("sorts unknown-severity rows after normal; undated rows fall last within their severity", () => {
    const undated = { severity: "critical" };
    const unknown = { severity: "weird", requested_at: at(1) };
    const normal = { severity: "normal", requested_at: at(1) };
    const order = [undated, unknown, normal].sort(compareApprovalUrgency);
    expect(order).toEqual([undated, normal, unknown]);
  });
});

describe("approvalKind", () => {
  it("classifies guest_escalation as escalation and every exception type as approval", () => {
    expect(approvalKind("guest_escalation")).toBe("escalation");
    expect(approvalKind("room_upgrade")).toBe("approval");
    expect(approvalKind("refund_exception")).toBe("approval");
    expect(approvalKind(undefined)).toBe("approval");
  });
});
