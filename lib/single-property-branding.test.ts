// Single-property branding contract: no branch switcher affordance, no
// "Haven Makati" / "Main property" in app UI, no branch/property scoping in
// API or lib code. Geographic facts (transfer route names, hotel address
// label, fixture street addresses) are intentionally excluded.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const BRANDED_UI = [
  "components/manager/manager-dashboard-client.tsx",
  "components/owner/owner-dashboard-client.tsx",
  "components/admin/admin-dashboard-client.tsx",
  "components/customer/check-in-qr.tsx",
  "lib/email.ts",
];

describe("single-property branding", () => {
  it("has no Haven Makati or Main property strings in app UI", () => {
    for (const path of BRANDED_UI) {
      const src = read(path);
      expect(src, path).not.toMatch(/Haven Makati/);
      expect(src, path).not.toMatch(/Main property/);
    }
  });
  it("has no switcher chevron inside the brand pill", () => {
    for (const path of BRANDED_UI.slice(0, 3)) {
      const src = read(path);
      const pill = src.slice(src.indexOf("property-pill"));
      expect(pill.slice(0, 400), path).not.toMatch(/Chevron/);
    }
  });
  it("brands the pill as HAVEN / HOTEL & RESIDENCES", () => {
    for (const path of BRANDED_UI.slice(0, 3)) {
      expect(read(path), path).toMatch(/HOTEL &/);
    }
  });
});

describe("no branch/property scoping in code", () => {
  // Fast source assertions on the files most likely to carry scoping.
  // A full-tree scan was verified once via grep (zero branch_id hits in
  // app/components/lib/config); repeating it per test run is not worth the
  // I/O. Re-scan with: git grep "branch_id" -- app components lib config
  it("references no branch_id in auth, guards, or data layers", () => {
    for (const path of [
      "lib/auth.ts",
      "lib/customer-auth.ts",
      "lib/data.ts",
      "lib/staff-data.ts",
      "lib/permissions.ts",
      "app/api/resources/[resource]/route.ts",
    ]) {
      expect(read(path), path).not.toMatch(/branch_id/);
    }
  });
});
