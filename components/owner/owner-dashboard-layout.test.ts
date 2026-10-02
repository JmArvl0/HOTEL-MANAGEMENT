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

  it("keeps payment configuration on the shared Owner grammar", () => {
    expect(paymentSettings).toContain('className="owner-payment-settings"');
    expect(paymentSettings).toContain("PageHeader");
    expect(paymentSettings).toContain('variant="default"');
    expect(paymentSettings).toContain("owner-steps");
    expect(paymentSettings).toContain("owner-method-grid");
    expect(paymentSettings).toContain("owner-dest-grid");
    expect(paymentSettings).toContain("data-panel owner-panel");
    expect(paymentSettings).toContain("OwnerSectionHead");
    expect(paymentSettings).toContain("OwnerTablePanel");
    expect(paymentSettings).not.toContain("owner-payment-grid");
    expect(paymentSettings).not.toContain("owner-payment-history");
    expect(paymentSettings).not.toContain("pay-preview");
  });

  it("uses the method radio as the single control with no separate toggle", () => {
    expect(paymentSettings).toContain('"off", "Deposits off"');
    expect(paymentSettings).not.toContain("owner-toggle-row");
    expect(paymentSettings).not.toContain("Accept GCash deposits");
    expect(paymentSettings).toContain("depositMethod !== \"off\"");
  });

  it("keeps the wizard Continue on the primary button with a readable soft hover", () => {
    expect(paymentSettings).toContain("btn btn-accent");
    expect(paymentSettings).toContain("Continue to destination");
    expect(theme).toContain(".app-shell.owner-workspace .owner-payment-settings .btn-soft:hover");
  });

  it("activates PayMongo express with always-visible saves and a readable header badge", () => {
    expect(paymentSettings).toContain("Activate PayMongo");
    expect(paymentSettings).toContain("owner-sticky-saves");
    expect(paymentSettings).toContain("not needed for instant checkout");
    expect(theme).toContain(".app-shell.owner-workspace .owner-payment-settings .page-header-actions .badge");
  });

  it("renders save dialogs through a viewport portal with the standard branded header", () => {
    expect(paymentSettings).toContain("portal: true");
    expect(paymentSettings).toContain('headerVariant: "branded"');
  });

  it("collects the audit reason in the save dialog, never as an inline field", () => {
    expect(paymentSettings).toContain("askPrompt");
    expect(paymentSettings).toContain('label: "Reason for change"');
    expect(paymentSettings).not.toContain("Reason for change<textarea");
    // The unified save audits one dialog reason on both requests — the method
    // switch first, then the destination — so neither can drift from the other.
    expect(paymentSettings.split("reason: destReason.trim()").length - 1).toBe(2);
    expect(paymentSettings).not.toContain("methodReason");
  });

  it("collapses dense executive grids without horizontal page overflow", () => {
    expect(theme).toContain(".app-shell.owner-workspace .owner-metric-grid");
    expect(theme).toContain("@media(max-width:1200px)");
    expect(theme).toContain("@media(max-width:760px)");
    expect(theme).toContain(".app-shell.owner-workspace .owner-role-grid,");
  });
});
