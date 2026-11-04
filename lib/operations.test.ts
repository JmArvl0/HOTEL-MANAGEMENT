import { describe, expect, it } from "vitest";
import { foundAction, manilaInputToIso, operationsAction, rosterWindowValid } from "./operations";

describe("Manila schedules", () => {
  it("converts wall time consistently across overnight shifts", () => {
    const start = manilaInputToIso("2030-01-01T22:00");
    const end = manilaInputToIso("2030-01-02T06:00");
    expect(start).toBe("2030-01-01T14:00:00.000Z");
    expect(rosterWindowValid(start, end)).toBe(true);
  });
  it("rejects invalid calendar dates, reversed windows and shifts over 24 hours", () => {
    expect(() => manilaInputToIso("2030-02-30T08:00")).toThrow();
    expect(() => manilaInputToIso("01/02/2030")).toThrow();
    expect(rosterWindowValid("bad", "bad")).toBe(false);
    expect(rosterWindowValid("2030-01-02", "2030-01-01")).toBe(false);
    expect(rosterWindowValid("2030-01-01", "2030-01-03")).toBe(false);
  });
});
describe("operational action inputs", () => {
  const id = "123e4567-e89b-42d3-a456-426614174000";
  it("requires a typed source and staff follow-up for handovers", () => {
    expect(operationsAction.safeParse({ action: "handover", id, summary: "Follow up arrival", sourceType: "reservation", sourceId: "RSV-1", followUpId: id }).success).toBe(true);
    expect(operationsAction.safeParse({ action: "handover", id, summary: "Follow up arrival", sourceType: "user_accounts", sourceId: "RSV-1", followUpId: id }).success).toBe(false);
    expect(operationsAction.safeParse({ action: "cancel_schedule", id, version: 0, note: "Correction" }).success).toBe(false);
  });
  it("requires an explicit note for item custody changes", () => {
    expect(foundAction.safeParse({ action: "take_custody", id, version: 1, note: "Locker transfer" }).success).toBe(true);
    expect(foundAction.safeParse({ action: "release", id, version: 1, note: "" }).success).toBe(false);
    expect(foundAction.safeParse({ action: "arbitrary_delete", id, version: 1, note: "Remove" }).success).toBe(false);
  });
});
