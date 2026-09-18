import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboard = readFileSync("components/owner/owner-dashboard-client.tsx", "utf8");
const paymentSettings = readFileSync("components/owner/payment-settings-panel.tsx", "utf8");
const theme = readFileSync("app/manager-dashboard-theme.css", "utf8");

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

  it("keeps payment configuration in a structured responsive workspace", () => {
    expect(paymentSettings).toContain('className="owner-payment-settings"');
    expect(paymentSettings).toContain("dashboard-grid owner-payment-grid");
    expect(paymentSettings).toContain("owner-payment-preview");
    expect(paymentSettings).toContain("owner-payment-history");
  });

  it("collapses dense executive grids without horizontal page overflow", () => {
    expect(theme).toContain(".app-shell.owner-workspace .owner-metric-grid");
    expect(theme).toContain("@media(max-width:1200px)");
    expect(theme).toContain(".app-shell.owner-workspace .owner-payment-grid{grid-template-columns:1fr}");
    expect(theme).toContain("@media(max-width:760px)");
    expect(theme).toContain(".app-shell.owner-workspace .owner-role-grid,");
  });
});
