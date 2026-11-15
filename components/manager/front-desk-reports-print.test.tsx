// @vitest-environment jsdom
// Front Desk report export — QA retest: Export timed out with no download or
// print result. Export is window.print() over the preview article; this pins
// the wiring (preview → Export → print call) and the print CSS that keeps a
// tall preview from choking the browser's print preview (unbreakable panels
// + interactive chrome must not print).
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import FrontDeskReportsPanel, { ReportSnapshotView } from "./front-desk-reports-panel";
import type { DailyReportSnapshot } from "@/lib/front-desk-reports";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const snapshot: DailyReportSnapshot = {
  reportDate: "2026-10-02",
  generatedAt: "2026-10-02T12:00:00Z",
  reservations: { created: 2, bySource: { Website: 2 }, arrivals: 1, departures: 0, cancelled: 0, noShow: 0 },
  guestRequests: { opened: 1, escalated: 0, openByDepartment: { housekeeping: 1 } },
  collections: { count: 1, total: 2670, byPurpose: { reservation_deposit: 2670 }, byMethod: { manual_gcash: 2670 } },
  rooms: { available: 40 },
  transportation: {},
  approvals: {},
};

function mockFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).includes("?date=")) return { ok: true, json: async () => ({ data: snapshot }) };
      return { ok: true, json: async () => ({ data: { rows: [], page: 0, pageCount: 1, total: 0 } }) };
    }),
  );
}

describe("FrontDeskReportsPanel export", () => {
  it("builds a preview and hands it to the print workflow on Export", async () => {
    mockFetch();
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    render(<FrontDeskReportsPanel role="front_desk" />);
    fireEvent.click(screen.getByRole("button", { name: "Generate preview" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Export preview" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Export preview" }));
    expect(print).toHaveBeenCalledOnce();
  });
});

describe("report money presentation", () => {
  const current: DailyReportSnapshot = {
    ...snapshot,
    collections: { count: 1, total: 2000, byPurpose: { stay_payment: 1 }, byMethod: { cash: 2000 } },
    refunds: { count: 2, total: 350.25, byMethod: { cash: 250, manual_gcash: 100.25 } },
    netReceipts: 1649.75,
  };

  it("shows incoming, outgoing and net amounts with centavos in the shared report view", () => {
    render(<ReportSnapshotView snapshot={current} collapseBreakdown={false} />);
    expect(screen.getAllByText("Collections received").length).toBeGreaterThan(0);
    expect(screen.getByText("Refunds paid out")).toBeTruthy();
    expect(screen.getByText("Net receipts")).toBeTruthy();
    expect(screen.getByText(/Cash collections:/)).toBeTruthy();
    expect(screen.getByText(/Cash refunds:/)).toBeTruthy();
    expect(screen.getByText("₱100.25")).toBeTruthy();
    expect(screen.getByText("₱1,649.75")).toBeTruthy();
  });

  it("labels older mixed snapshots without changing their stored total", () => {
    render(<ReportSnapshotView snapshot={{ ...snapshot, collections: { count: 2, total: 2100.25, byPurpose: { stay_payment: 1, refund: 1 }, byMethod: { cash: 2100.25 } } }} collapseBreakdown={false} />);
    expect(screen.getByText("Legacy settled payments (includes refunds)")).toBeTruthy();
    expect(screen.getByText(/Refund amounts cannot be reconstructed/)).toBeTruthy();
    expect(screen.getAllByText("₱2,100.25").length).toBeGreaterThan(0);
    expect(screen.queryByText("Cash received")).toBeNull();
  });
});

describe("report print CSS", () => {
  const css = readFileSync(join(process.cwd(), "app/staff-theme.css"), "utf8");

  it("lets the tall report preview break across printed pages", () => {
    // Regression: globals.css forces break-inside:avoid on every panel, so a
    // day-long preview could stall the browser's print preview entirely.
    expect(css).toMatch(/\.app-shell \.report-preview\{[^}]*break-inside:\s*auto/);
  });

  it("keeps interactive chrome off the printed page", () => {
    expect(css).toMatch(/\.app-shell \.report-actions[^{]*\{[^}]*display:\s*none/);
  });
});
