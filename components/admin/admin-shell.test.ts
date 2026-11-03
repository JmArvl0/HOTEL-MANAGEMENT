import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("admin mobile navigation", () => {
  it("labels the menu control and provides a dismissible backdrop", () => {
    const client = readFileSync(join(process.cwd(), "components/admin/admin-dashboard-client.tsx"), "utf8");

    expect(client.includes('className="menu-btn brand-menu-btn" aria-label={menu ? "Close navigation" : "Open navigation"} aria-controls="admin-navigation" aria-expanded={menu} onClick={() => setMenu((value) => !value)}')).toBe(true);
    expect(client.includes('className="sidebar-backdrop" onClick={() => setMenu(false)} aria-label="Close navigation"')).toBe(true);
    expect(client.includes('if (e.key === "Escape") setMenu(false);')).toBe(true);
  });
});
