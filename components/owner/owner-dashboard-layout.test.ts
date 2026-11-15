import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboard = readFileSync("components/owner/owner-dashboard-client.tsx", "utf8");
const paymentSettings = readFileSync("components/owner/payment-settings-panel.tsx", "utf8");
const theme = readFileSync("app/staff-theme.css", "utf8");

describe("Owner executive workspace layout", () => {
  it("uses Owner-scoped layouts for each information pattern", () => {
    expect(dashboard).toContain("app-shell owner-workspace");
    expect(dashboard).toContain("workspace-body owner-module");
    expect(dashboard).toContain("metric-grid owner-metric-grid");
    expect(dashboard).toContain("dashboard-grid owner-insight-grid");
    expect(dashboard).toContain("dashboard-grid owner-dual-grid");
    expect(dashboard).toContain("dashboard-grid owner-role-grid");
    expect(dashboard).toContain('className="owner-risk-stack"');
  });

  it("keeps payment configuration on the shared Owner grammar", () => {
    expect(paymentSettings).toContain('className="owner-payment-settings"');
    expect(paymentSettings).toContain("PageHeader");
    expect(paymentSettings).toContain('variant="default"');
    expect(paymentSettings).toContain("DepositMethodSwitch");
    expect(paymentSettings).toContain("data-panel owner-panel");
    expect(paymentSettings).toContain("OwnerTablePanel");
  });

  it("collapses dense executive grids without horizontal page overflow", () => {
    expect(theme).toContain(".app-shell.owner-workspace .owner-metric-grid");
    expect(theme).toContain("@media(max-width:1200px)");
    expect(theme).toContain("@media(max-width:760px)");
    // 2026-10-06 rewrite: the merge emits one selector per rule, so the old
    // grouped selector is asserted in its merged single-selector form.
    expect(theme).toContain(".app-shell.owner-workspace .owner-role-grid{grid-template-columns:repeat(auto-fit,minmax(250px,1fr))");
  });
});
