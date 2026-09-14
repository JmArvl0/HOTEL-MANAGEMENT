import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("client fetch resilience", () => {
  it("does not fetch a NextAuth session globally for pages that do not consume it", () => {
    expect(read("components/providers.tsx")).not.toContain("SessionProvider");
    expect(read("app/(booking)/(customer)/account/profile/page.tsx")).toContain("<SessionProvider session={session}");
  });

  it("turns an initial manager dashboard fetch rejection into a retryable state", () => {
    const source = read("components/manager/manager-dashboard-client.tsx");
    expect(source).toContain("setLoadError");
    expect(source).toContain("catch (cause)");
    expect(source).toContain("Unable to reach the hotel service");
    expect(source).toContain("Try again");
  });
});
