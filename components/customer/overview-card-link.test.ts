import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guest-requests overview card: "View requests" renders as a soft pill
// button (source assertions — rendered shape stays a manual screenshot check).
const page = readFileSync(
  join(process.cwd(), "app/(booking)/(customer)/account/page.tsx"),
  "utf8"
);
const css = readFileSync(join(process.cwd(), "app/customer-portal.css"), "utf8");

describe("overview requests card link", () => {
  it("styles View requests as a soft button to /account/requests", () => {
    expect(page).toContain(
      '<Link className="btn btn-soft" href="/account/requests">View requests'
    );
  });

  it("shapes card button links as full-width ovals with readable text", () => {
    expect(css).toContain(".customer-shell .customer-card>a.btn{");
    expect(css).toMatch(/\.customer-card>a\.btn\{[^}]*border-radius:999px/);
    expect(css).toMatch(/\.customer-card>a\.btn\{[^}]*min-height:44px/);
    expect(css).toMatch(/\.customer-card>a\.btn\{[^}]*font-size:12px/);
  });

  it("leaves the other card links as text links", () => {
    expect(page).toContain('<Link href="/account/payments">View payment details');
    expect(page).toContain('<Link href="/account/notifications">View notifications');
    expect(css).toContain(".customer-shell .customer-card>a{font-size:11px;font-weight:700}");
  });
});
