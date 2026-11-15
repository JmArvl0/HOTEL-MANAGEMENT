import { describe, expect, it } from "vitest";
import { bcryptPassword, calendarDate, integerInput, normalizePhone, pesoAmount } from "@/lib/input-validation";
import { guestDetailsSchema, searchSchemaFor, transportationPreferencesSchema } from "@/lib/booking";

describe("audit input boundaries", () => {
  it.each(["2028-02-29", "2026-11-15"])("accepts the real calendar day %s", value => {
    expect(calendarDate.safeParse(value).success).toBe(true);
  });
  it.each(["2026-02-29", "2026-02-31", "2026-13-01", "2026-00-10", "0000-01-01"])("rejects the impossible day %s", value => {
    expect(calendarDate.safeParse(value).success).toBe(false);
  });
  it.each([true, false, null, "", " ", [2], "2.1", 1.2])("rejects unintended guest count %j", value => {
    expect(integerInput(1, 8).safeParse(value).success).toBe(false);
  });
  it("keeps form integer strings and amounts while rejecting extra currency precision", () => {
    expect(integerInput(1, 8).parse("2")).toBe(2);
    expect(pesoAmount(.01, 10000000).parse("100.10")).toBe(100.1);
    for (const value of [true, [100], "", null, "0.001", 0.001, Infinity, NaN]) {
      expect(pesoAmount(.01, 10000000).safeParse(value).success).toBe(false);
    }
  });
  it("uses the supplied hotel day and limits quote materialization", () => {
    const schema = searchSchemaFor("2026-11-14");
    expect(schema.safeParse({ checkIn: "2026-11-14", checkOut: "2026-11-15", guests: 2 }).success).toBe(true);
    expect(schema.safeParse({ checkIn: "2026-11-13", checkOut: "2026-11-15", guests: 2 }).success).toBe(false);
    expect(schema.safeParse({ checkIn: "2026-11-15", checkOut: "2027-11-16", guests: 2 }).success).toBe(false);
  });
  it.each([
    ["0917 123 4567", "+639171234567"],
    ["+63 917 123 4567", "+639171234567"],
    ["0049 1512 3456789", "+4915123456789"],
    ["+1 (202) 555-0123", "+12025550123"],
  ])("normalizes %s without changing its country", (value, expected) => {
    expect(normalizePhone(value)).toBe(expected);
  });
  it.each(["call me 09171234567", "+999 12345678", "abcdefghi", "+63 123", "+1 0000000000"])("rejects invalid phone %s", value => {
    expect(normalizePhone(value)).toBeNull();
  });
  it("accepts the exact bcrypt byte limit and rejects multibyte overflow", () => {
    expect(bcryptPassword(8).safeParse("a".repeat(72)).success).toBe(true);
    expect(bcryptPassword(8).safeParse("a".repeat(73)).success).toBe(false);
    expect(bcryptPassword(8).safeParse("界".repeat(24)).success).toBe(true);
    expect(bcryptPassword(8).safeParse("界".repeat(25)).success).toBe(false);
  });
  it("accepts conditional drop-off and rejects a same-day reversed round trip", () => {
    const common = { pickupDate: "2026-12-01", pickupTime: "18:00", passengerCount: 2 };
    expect(transportationPreferencesSchema.safeParse({ ...common, serviceType: "DROPOFF", dropoffLocation: "Airport terminal" }).success).toBe(true);
    expect(transportationPreferencesSchema.safeParse({ ...common, serviceType: "ROUND_TRIP", pickupLocation: "Airport terminal",
      returnLocation: "Airport terminal", returnDate: common.pickupDate, returnTime: "16:00" }).success).toBe(false);
  });
  it("allows an explicit unknown ETA and rejects transport outside the stay", () => {
    const details = { roomType: "Deluxe", checkIn: "2026-12-01", checkOut: "2026-12-03", guests: 2,
      firstName: "Ava", lastName: "Reyes", email: "ava@example.invalid", mobile: "+639171234567", address: "Manila" };
    expect(guestDetailsSchema.safeParse(details).success).toBe(true);
    expect(guestDetailsSchema.safeParse({ ...details, transportationPreferences: { serviceType: "DROPOFF", dropoffLocation: "Airport terminal",
      pickupDate: "2026-12-04", pickupTime: "18:00", passengerCount: 2 } }).success).toBe(false);
  });
});
