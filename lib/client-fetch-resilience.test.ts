import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("client fetch resilience", () => {
  it("does not fetch a NextAuth session globally for pages that do not consume it", () => {
    expect(read("components/providers.tsx")).not.toContain("SessionProvider");
    // SessionProvider (next-auth/react) uses React context with no "use client"
    // boundary, so a Server Component importing it crashes with "React Context
    // is unavailable in Server Components". The profile page must stay a pure
    // server component; the provider lives in the client boundary instead.
    expect(read("app/(booking)/(customer)/account/profile/page.tsx")).not.toContain("next-auth/react");
    expect(read("app/(booking)/(customer)/account/profile/page.tsx")).toContain("<ProfileWithSession");
    expect(read("components/account/account-forms.tsx")).toContain("<SessionProvider session={session}");
  });

  it("turns an initial manager dashboard fetch rejection into a retryable state", () => {
    const source = read("components/manager/manager-dashboard-client.tsx");
    expect(source).toContain("setLoadError");
    expect(source).toContain("catch (cause)");
    expect(source).toContain("Unable to reach the hotel service");
    expect(source).toContain("Try again");
  });

  it("turns an initial admin dashboard fetch rejection into a retryable state", () => {
    const source = read("components/admin/admin-dashboard-client.tsx");
    expect(source).toContain("setLoadError");
    expect(source).toMatch(/catch\s*\(cause\)/);
    expect(source).toContain("Unable to reach the administration service");
    expect(source).toContain("Try again");
  });
});
