// @vitest-environment jsdom
// System Health module: the view formats server-computed figures only — status
// cards, drift warning, and the migration ledger table. Pure render; no fetches.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SystemHealthView } from "./admin-dashboard-client";
import type { SystemHealth } from "@/lib/system-health";

// The dashboard module imports panels that read layout/motion APIs jsdom lacks.
class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
if (!window.matchMedia) {
  Object.assign(window, {
    matchMedia: (query: string) => ({
      matches: false, media: query, onchange: null,
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

const health = (overrides: Partial<SystemHealth> = {}): SystemHealth => ({
  db: { live: true, latencyMs: 142, checkedAt: "2026-09-24T08:30:00.000Z" },
  activity: { lastAuditAt: "2026-09-24T08:12:00.000Z", auditEvents24h: 37, pendingApprovals: 2 },
  migrations: {
    applied: [
      { version: "20260924010000", name: "system_health_ledger" },
      { version: "20260923010000", name: "stay_extension_exception" },
    ],
    appliedCount: 2,
    localCount: 2,
    status: "in_sync",
  },
  application: { environment: "Production", version: "1.0.0", commit: "abc1234" },
  storage: { status: "operational" },
  email: { status: "configured" },
  automations: [
    { name: "Guest reminders", schedule: "Daily 01:05 UTC", lastRun: null, status: "unknown" },
    { name: "Analytics generation", schedule: "Daily 18:35 UTC", lastRun: null, status: "unknown" },
  ],
  deployment: { provider: "Vercel", status: "unknown" },
  domain: { status: "not_connected" },
  issues: [],
  ...overrides,
});

const tableRows = () => Array.from(document.querySelectorAll<HTMLTableRowElement>('table[aria-label="Applied migrations"] tbody tr'));

afterEach(cleanup);

describe("SystemHealthView", () => {
  it("renders the live DB card with latency and the activity counters", () => {
    render(<SystemHealthView data={health()} onRefresh={() => {}} />);
    expect(screen.getByText("Live")).toBeTruthy();
    expect(screen.getByText("142 ms response")).toBeTruthy();
    expect(screen.getByText("37")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("renders the migration ledger rows and the applied count", () => {
    render(<SystemHealthView data={health()} onRefresh={() => {}} />);
    expect(tableRows()).toHaveLength(2);
    expect(screen.getByText("system health ledger")).toBeTruthy();
    expect(screen.getByText("2 / 2")).toBeTruthy();
  });

  it("shows the drift warning when local migrations are not applied remotely", () => {
    render(<SystemHealthView data={health({ migrations: { applied: [{ version: "20260923010000", name: "stay_extension_exception" }], appliedCount: 1, localCount: 2, status: "remote_behind" } })} onRefresh={() => {}} />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Deployment drift" })).toBeTruthy();
    expect(screen.getByText(/1 local migration is not applied/)).toBeTruthy();
  });

  it("shows the unreachable alert instead of a drift warning when the DB probe fails", () => {
    render(<SystemHealthView data={health({ db: { live: false, latencyMs: null, checkedAt: "2026-09-24T08:30:00.000Z", error: "connection refused" } })} onRefresh={() => {}} />);
    expect(screen.getByText("Unreachable")).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Database unreachable" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Deployment drift" })).toBeNull();
  });

  it("exposes the manual refresh control", () => {
    const onRefresh = vi.fn();
    render(<SystemHealthView data={health()} onRefresh={onRefresh} />);
    fireEvent.click(screen.getByText("Run checks now"));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("renders without crashing while the previous section's data is still in state", () => {
    // Section switches re-render once before the new fetch lands — the view
    // must tolerate a payload with none of its keys (e.g. the overview shape).
    render(<SystemHealthView data={{} as SystemHealth} onRefresh={() => {}} />);
    expect(screen.getByText("Checking…")).toBeTruthy();
    expect(screen.getByText("0")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders the extended application, storage, email, deployment, and domain cards", () => {
    render(<SystemHealthView data={health()} onRefresh={() => {}} />);
    expect(screen.getByText("Production")).toBeTruthy();
    expect(screen.getByText("v1.0.0 · abc1234")).toBeTruthy();
    expect(screen.getByText("Operational")).toBeTruthy();
    expect(screen.getByText("Configured")).toBeTruthy();
    expect(screen.getByText("Not connected")).toBeTruthy();
    expect(screen.getByText("Guest reminders")).toBeTruthy();
    expect(screen.getByText("Analytics generation")).toBeTruthy();
  });

  it("falls back to honest Unknowns when extended sections are missing", () => {
    render(<SystemHealthView data={{ db: health().db, activity: health().activity, migrations: health().migrations } as SystemHealth} onRefresh={() => {}} />);
    expect(screen.getAllByText("Unknown").length).toBeGreaterThan(0);
    expect(screen.getByText("Not connected")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("lists technical issues without adding alert roles", () => {
    render(<SystemHealthView data={health({ issues: ["1 local migration is not applied to the live database."] })} onRefresh={() => {}} />);
    expect(screen.getByRole("heading", { name: "Recent technical issues" })).toBeTruthy();
    expect(screen.getByText("1 local migration is not applied to the live database.")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("never carries secret values in the health payload", () => {
    const payload = JSON.stringify(health());
    for (const marker of ["DATABASE_URL", "DIRECT_URL", "SERVICE_ROLE_KEY", "RESEND_API_KEY", "NEXTAUTH_SECRET", "BEGIN PRIVATE", "postgres://", "postgresql://"]) expect(payload).not.toContain(marker);
  });
});
