import { describe, expect, it } from "vitest";
import { migrationStatus } from "@/lib/system-health";

describe("migrationStatus", () => {
  it("flags remote_behind when fewer migrations are applied than exist locally", () => {
    expect(migrationStatus(52, 53)).toBe("remote_behind");
  });

  it("reports in_sync when the ledger matches or exceeds local files", () => {
    expect(migrationStatus(53, 53)).toBe("in_sync");
    expect(migrationStatus(54, 53)).toBe("in_sync");
  });

  it("reports unknown when the local file count is unavailable", () => {
    expect(migrationStatus(53, null)).toBe("unknown");
  });
});
