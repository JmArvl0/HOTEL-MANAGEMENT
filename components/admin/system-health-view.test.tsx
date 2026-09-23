// @vitest-environment jsdom
// System Health executive layout: the 8-card status grid, automations ×
// alerts workspace, and the tabbed ledger (migrations / payment / audit
// trail). The view formats server-computed figures only. Pure render; the
// tabs switch visibility without refetching.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  gateway: { status: "listening_test" },
  recentProbes: [
    { action: "security_policy_updated", entity: "security_policy", at: "2026-09-24T08:12:00.000Z" },
    { action: "admin_create_staff", entity: "user_account", at: "2026-09-24T07:58:00.000Z" },
  ],
  automations: [
    { name: "Guest reminders", schedule: "Daily 01:05 UTC", lastRun: null, status: "unknown" },
    { name: "Analytics generation", schedule: "Daily 18:35 UTC", lastRun: null, status: "unknown" },
  ],
  deployment: { provider: "Vercel", status: "unknown" },
  domain: { status: "not_connected" },
  issues: [],
  ...overrides,
});

const migrationRows = () => Array.from(document.querySelectorAll<HTMLTableRowElement>('table[aria-label="Applied migrations"] tbody tr'));

afterEach(cleanup);

describe("SystemHealthView", () => {
  it("renders the executive header with the probes trigger", () => {
    const onRefresh = vi.fn();
    render(<SystemHealthView data={health()} onRefresh={onRefresh} />);
    expect(screen.getByRole("heading", { name: /System Health & Infrastructure/ })).toBeTruthy();
    expect(screen.getByText(/Auto-refreshed every 60 seconds/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Run Health Probes/ }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("renders the 8-card infrastructure grid with live values", () => {
    render(<SystemHealthView data={health()} onRefresh={() => {}} />);
    const grid = screen.getByRole("group", { name: "Infrastructure status" });
    // Native design-system grid only — the repo ships hand-written CSS.
    expect(grid.classList.contains("metric-grid")).toBe(true);
    expect(grid.querySelectorAll("article.metric-card")).toHaveLength(8);
    expect(screen.getByText("Database (Postgres)")).toBeTruthy();
    expect(screen.getByText("Connected")).toBeTruthy();
    expect(screen.getByText(/142 ms response/)).toBeTruthy();
    const dbCard = screen.getByText("Database (Postgres)").closest("article")!;
    expect(within(dbCard).getByText(/Supabase PostgreSQL/)).toBeTruthy();
    expect(screen.getByText("PayMongo Webhook")).toBeTruthy();
    expect(screen.getByText("Listening · Test")).toBeTruthy();
    expect(screen.getByText("/api/webhooks/payments")).toBeTruthy();
    expect(screen.getByText("2 Pending")).toBeTruthy();
  });

  it("renders the automations ledger and the gateway test-mode alert", () => {
    render(<SystemHealthView data={health()} onRefresh={() => {}} />);
    expect(screen.getByRole("heading", { name: /Scheduled Automations/ })).toBeTruthy();
    expect(screen.getByText("Guest reminders")).toBeTruthy();
    expect(screen.getByText("Analytics generation")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Live System Alerts/ })).toBeTruthy();
    expect(screen.getByText(/Test mode active/)).toBeTruthy();
  });

  it("renders the migration ledger rows and the applied count in its tab", () => {
    render(<SystemHealthView data={health()} onRefresh={() => {}} />);
    expect(migrationRows()).toHaveLength(2);
    expect(screen.getByText("system health ledger")).toBeTruthy();
    expect(screen.getByText("2 / 2 Applied")).toBeTruthy();
    expect(screen.getAllByText("Applied", { exact: true })).toHaveLength(2);
  });

  it("searches the migration ledger without refetching", async () => {
    const onRefresh = vi.fn();
    render(<SystemHealthView data={health()} onRefresh={onRefresh} />);
    fireEvent.change(screen.getByLabelText("Search migrations"), { target: { value: "stay_extension" } });
    // HavenSearchInput debounces — wait for the filtered rows.
    await waitFor(() => expect(migrationRows()).toHaveLength(1));
    fireEvent.change(screen.getByLabelText("Search migrations"), { target: { value: "nothing matches" } });
    expect(await screen.findByText("No migrations match this search")).toBeTruthy();
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("switches ledger tabs without triggering a probe refetch", () => {
    const onRefresh = vi.fn();
    render(<SystemHealthView data={health()} onRefresh={onRefresh} />);
    fireEvent.click(screen.getByRole("tab", { name: /Audit Trail/ }));
    expect(screen.getByText("security policy updated")).toBeTruthy();
    expect(screen.getByText(/37 in the last 24 hours/)).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /Payment Configuration/ }));
    expect(screen.getByText("Payment health is still loading.")).toBeTruthy();
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("supports arrow-key tab navigation", () => {
    render(<SystemHealthView data={health()} onRefresh={() => {}} />);
    const list = screen.getByRole("tablist", { name: "System health ledgers" });
    // Native tab styling from the shared design system.
    expect(list.classList.contains("insights-tabs")).toBe(true);
    fireEvent.keyDown(list, { key: "ArrowRight" });
    const paymentTab = screen.getByRole("tab", { name: /Payment Configuration/ });
    expect(paymentTab.getAttribute("aria-selected")).toBe("true");
    expect(paymentTab.classList.contains("active")).toBe(true);
    fireEvent.keyDown(list, { key: "End" });
    expect(screen.getByRole("tab", { name: /Audit Trail/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("uses native design-system classes with zero Tailwind utilities", () => {
    render(<SystemHealthView data={health()} onRefresh={() => {}} />);
    expect(document.body.innerHTML).not.toMatch(/grid-cols-|text-emerald|text-muted|text-primary|sm:|lg:/);
  });

  it("shows the drift warning when local migrations are not applied remotely", () => {
    render(<SystemHealthView data={health({ migrations: { applied: [{ version: "20260923010000", name: "stay_extension_exception" }], appliedCount: 1, localCount: 2, status: "remote_behind" } })} onRefresh={() => {}} />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText(/Deployment drift/)).toBeTruthy();
    expect(screen.getByText(/1 local migration is not applied/)).toBeTruthy();
  });

  it("shows the unreachable alert instead of a drift warning when the DB probe fails", () => {
    render(<SystemHealthView data={health({ db: { live: false, latencyMs: null, checkedAt: "2026-09-24T08:30:00.000Z", error: "connection refused" } })} onRefresh={() => {}} />);
    expect(screen.getByText("Unreachable")).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText(/Database unreachable/)).toBeTruthy();
    expect(screen.queryByText(/Deployment drift/)).toBeNull();
  });

  it("renders without crashing while the previous section's data is still in state", () => {
    render(<SystemHealthView data={{} as SystemHealth} onRefresh={() => {}} />);
    expect(screen.getByText("Checking…")).toBeTruthy();
    expect(screen.getByText("0 Pending")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders the extended application, storage, email, deployment, and domain facts", () => {
    render(<SystemHealthView data={health()} onRefresh={() => {}} />);
    expect(screen.getByText("Production")).toBeTruthy();
    expect(screen.getByText("v1.0.0 · abc1234")).toBeTruthy();
    expect(screen.getByText("Operational")).toBeTruthy();
    expect(screen.getByText("Configured")).toBeTruthy();
    expect(screen.getByText(/Not connected/)).toBeTruthy();
  });

  it("falls back to honest Unknowns when extended sections are missing", () => {
    render(<SystemHealthView data={{ db: health().db, activity: health().activity, migrations: health().migrations } as SystemHealth} onRefresh={() => {}} />);
    expect(screen.getAllByText("Unknown").length).toBeGreaterThan(0);
    expect(screen.getByText(/Not connected/)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("lists technical issues without adding alert roles", () => {
    render(<SystemHealthView data={health({ issues: ["Photo bucket probe failed twice."] })} onRefresh={() => {}} />);
    expect(screen.getByText("Photo bucket probe failed twice.")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders the gateway card honestly when unconfigured", () => {
    render(<SystemHealthView data={health({ gateway: { status: "not_configured" } })} onRefresh={() => {}} />);
    expect(screen.getByText("Not configured")).toBeTruthy();
    expect(screen.queryByText(/Test mode active/)).toBeNull();
  });

  it("carries zero emoji characters in the rendered tree", () => {
    render(<SystemHealthView data={health()} onRefresh={() => {}} />);
    expect(document.body.innerHTML.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u)).toBeNull();
  });

  it("never carries secret values in the health payload", () => {
    const payload = JSON.stringify(health());
    for (const marker of ["DATABASE_URL", "DIRECT_URL", "SERVICE_ROLE_KEY", "RESEND_API_KEY", "NEXTAUTH_SECRET", "PAYMONGO_SECRET_KEY", "sk_test_", "sk_live_", "BEGIN PRIVATE", "postgres://", "postgresql://"]) expect(payload).not.toContain(marker);
  });
});
