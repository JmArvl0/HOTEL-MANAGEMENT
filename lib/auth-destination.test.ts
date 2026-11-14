import { describe, expect, it } from "vitest";
import { authDestination } from "./auth-destination";

describe("credentials callback navigation", () => {
  it("keeps booking details and query on the current origin", () => {
    expect(authDestination("/booking/details?roomId=101&guests=2")).toBe("/booking/details?roomId=101&guests=2");
    expect(authDestination("/auth/continue")).toBe("/auth/continue");
  });
  it.each(["https://evil.example/account", "//evil.example/account", "/\\evil.example/account", "javascript:alert(1)", "/\n/evil.example"])("rejects a non-internal callback %s", (value) => {
    expect(authDestination(value)).toBe("/auth/continue");
  });
});
