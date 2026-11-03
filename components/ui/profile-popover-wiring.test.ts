import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const headers = [
  "components/admin/admin-dashboard-client.tsx",
  "components/owner/owner-dashboard-client.tsx",
  "components/manager/manager-dashboard-client.tsx",
];

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

describe("shared profile popover wiring", () => {
  it.each(headers)("%s uses the shared ProfilePopover", (file) => {
    expect(read(file)).toContain("<ProfilePopover");
  });

  it.each(headers)("%s no longer renders the legacy inline panel", (file) => {
    expect(read(file)).not.toContain('popover-gap"><div className="profile-popover">');
  });

  it("loads the popover stylesheet from the root layout", () => {
    expect(read("app/layout.tsx")).toContain('components/ui/profile-popover.css');
  });
});
