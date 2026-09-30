// @vitest-environment jsdom
// System Health layout: the 8-card status grid, the de-duplicated attention
// list that sits under it, and the tabbed ledger (migrations / payment /
// audit trail) beside the automations rail. The view formats server-computed
// figures only. Pure render; the tabs switch visibility without refetching.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
      { version: "20260924010000", name: "system_health_ledger", appliedAt: "2026-09-24T08:30:00.000Z" },
      { version: "20260923010000", name: "stay_extension_exception", appliedAt: "2026-09-24T08:30:00.000Z", approximate: true },
    ],
    appliedCount: 2,
    localCount: 2,
    status: "in_sync",
  },
  application: { environment: "Production", version: "1.0.0", commit: "abc1234" },
  storage: { status: "operational" },
  email: { status: "configured" },
  gateway: { status: "listening_test", hasSecretKey: true, hasWebhookSecret: true },
  recentProbes: [
    { action: "security_policy_updated", entity: "security_policy", at: "2026-09-24T08:12:00.000Z", actor: "Ada (System Administrator)" },
    { action: "admin_create_staff", entity: "user_account", at: "2026-09-24T07:58:00.000Z", actor: null },
  ],
  automations: [
    { name: "Guest reminders", schedule: "Daily 01:05 UTC", lastRun: null, lastRunLabel: "Last send", lastStatus: "unknown" },
    { name: "Analytics generation", schedule: "Daily 18:35 UTC", lastRun: null, lastRunLabel: "Last run", lastStatus: "unknown" },
  ],
  // Tier 1 only: no VERCEL_TOKEN, so the newest build's outcome is unknown and
  // the card reports the facts of the deployment serving the request.
  deployment: {
    provider: "Vercel",
    environment: "production",
    commit: "abc1234",
    branch: "main",
    deploymentId: "dpl_test",
    buildStatus: "unknown",
    source: "environment",
  },
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
    expect(screen.getByText(/auto-refresh every 60 seconds/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Run Health Probes/ }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("renders the 8-card executive health grid with live values", () => {
    render(<SystemHealthView data={health()} onRefresh={() => {}} />);
    // Grid architecture: one responsive 4-column grid of status cards —
    // never a definition-list row stack (no .sys-svc-row in this view) and
    // never the shared KPI wall (no .mod-kpis, no .metric-grid).
    const grid = document.querySelector(".sys-health-grid-4")!;
    expect(grid.getAttribute("role")).toBe("list");
    expect(grid.querySelectorAll(":scope > .sys-health-card")).toHaveLength(8);
    expect(document.querySelector(".sys-health .mod-kpis")).toBeNull();
    expect(document.querySelector(".metric-grid")).toBeNull();
    expect(document.querySelector(".sys-svc-row")).toBeNull();
    expect(screen.getByText("Database (Postgres)")).toBeTruthy();
    expect(screen.getByText("Connected")).toBeTruthy();
    expect(screen.getByText(/142 ms response/)).toBeTruthy();
    expect(screen.getByText("PayMongo Webhook")).toBeTruthy();
    expect(screen.getByText("Listening · Test")).toBeTruthy();
    expect(screen.getByText(/\/api\/webhooks\/payments/)).toBeTruthy();
    expect(screen.getByText("2 Pending")).toBeTruthy();
  });

  it("summarizes posture in the header from probe counts without inventing an algorithm", () => {
    render(<SystemHealthView data={health()} onRefresh={() => {}} />);
    expect(screen.getByText(/Attention required · 7 monitored/)).toBeTruthy();
    const headerLine = document.querySelector(".page-title p:not(.admin-section-context)")!;
    expect(headerLine.textContent).toMatch(/Last checked/);
    // Tier 1 deployment: the serving environment is named, and the part the
    // system cannot read (the newest build) is named as the gap — never as
    // healthy, and never as a bare "Unknown".
    const deployCard = screen.getByText("Deployment (Vercel)").closest(".sys-health-card")!;
    expect(deployCard.textContent).toMatch(/newest build status needs VERCEL_TOKEN/);
    expect(deployCard.textContent).toMatch(/Serving/);
    expect(deployCard.querySelector(".sys-card-value")!.classList.contains("sys-tone-neutral")).toBe(true);
  });

  it("escalates the header and leads the queue with the critical database failure", () => {
    render(<SystemHealthView data={health({ db: { live: false, latencyMs: null, checkedAt: "2026-09-24T08:30:00.000Z", error: "connection refused" } })} onRefresh={() => {}} />);
    expect(screen.getByText(/^Critical · /)).toBeTruthy();
    const alerts = Array.from(document.querySelectorAll(".sys-queue > li.sys-queue-row"));
    expect(alerts[0].textContent).toMatch(/Database unreachable/);
  });

  it("orders the page verdict → cards → split with ledger and rail panels", () => {
    render(<SystemHealthView data={health()} onRefresh={() => {}} />);
    const order = ["page-title", "sys-health-grid-4", "sys-lower-split", "sys-panel-migrations"]
      .map((cls) => document.body.innerHTML.indexOf(cls));
    expect(order.every((pos, i) => i === 0 || pos > order[i - 1])).toBe(true);
    // Right rail carries both panels: needs-attention on top, automations
    // underneath; the ledger stands alone in the left half (equal split).
    const split = document.querySelector(".sys-lower-split")!;
    expect(split.querySelector(".sys-main .system-health-ledger")).toBeTruthy();
    const rail = split.querySelector(".sys-rail")!;
    const panels = Array.from(rail.querySelectorAll(":scope > section"));
    expect(panels.map((p) => p.className)).toEqual([
      expect.stringContaining("sys-attention"),
      expect.stringContaining("sys-automations"),
    ]);
  });

  it("puts tone on the value line only, never on the card", () => {
    render(<SystemHealthView data={health({ gateway: { status: "listening_test", hasSecretKey: true, hasWebhookSecret: true } })} onRefresh={() => {}} />);
    const card = screen.getByText("PayMongo Webhook").closest(".sys-health-card")!;
    // Tone classes on the <article> tinted the name and the whole explanation
    // paragraph — colored body text at 12px, which is both noisy and below AA.
    expect(card.className).not.toMatch(/sys-tone-/);
    expect(card.querySelector(".sys-card-value")!.className).toMatch(/sys-tone-warn/);
  });

  it("shows a compact steady strip instead of an empty attention panel", () => {
    const steady = health({ db: { live: true, latencyMs: 40, checkedAt: "2026-09-24T08:30:00.000Z" }, gateway: { status: "listening_live", hasSecretKey: true, hasWebhookSecret: true }, email: { status: "configured" }, domain: { status: "connected" } as unknown as SystemHealth["domain"], issues: [] });
    render(<SystemHealthView data={steady} onRefresh={() => {}} />);
    expect(document.querySelector(".sys-queue")).toBeNull();
    expect(screen.getByText(/No critical issues/)).toBeTruthy();
  });

  it("links out to Security Configuration without duplicating its controls", () => {
    const goSection = vi.fn();
    render(<SystemHealthView data={health()} onRefresh={() => {}} goSection={goSection} />);
    fireEvent.click(screen.getByRole("button", { name: /Security Configuration/ }));
    expect(goSection).toHaveBeenCalledWith("security_config");
  });

  it("states a not-configured email on its card instead of repeating it as an alert", () => {
    render(<SystemHealthView data={health({ email: { status: "not_configured" } })} onRefresh={() => {}} />);
    const card = screen.getByText("Email Service (Resend)").closest(".sys-health-card")!;
    expect(card.textContent).toMatch(/SMTP configuration is not available — guest email copies are skipped/);
    // The card already carries both the state and its action, so restating it
    // as an alert too is exactly the triplication this page was rebuilt to
    // remove. Only genuinely different-in-kind facts earn a queue row.
    expect(document.querySelector(".sys-queue")!.textContent).not.toMatch(/Email Service|SMTP configuration/);
  });

  it("runs a scheduled automation and reports the trigger through the toast", async () => {
    const notify = vi.fn();
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      render(<SystemHealthView data={health()} onRefresh={() => {}} notify={notify} />);
      fireEvent.click(screen.getByRole("button", { name: /Run Guest reminders now/ }));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/guest-reminders", { method: "POST" }));
      await waitFor(() => expect(notify).toHaveBeenCalledWith("Guest reminders triggered successfully."));
      // No local "did it run" flag: the durable record is the run timestamp the
      // server writes and the panel re-reads on refresh. Keeping a second,
      // weaker copy in local state meant two sources of truth for one fact.
      const row = screen.getByText("Guest reminders").closest(".sys-job")!;
      expect(row.textContent).toMatch(/No sends recorded/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("reports each job's last recorded run, and names what the timestamp means", () => {
    render(<SystemHealthView data={health({ automations: [
      { name: "Guest reminders", schedule: "Daily 01:05 UTC", lastRun: "2026-09-26T01:05:00.000Z", lastRunLabel: "Last send", lastStatus: "succeeded" },
      { name: "Analytics generation", schedule: "Daily 18:35 UTC", lastRun: "2026-09-25T18:35:00.000Z", lastRunLabel: "Last run", lastStatus: "failed" },
    ] })} onRefresh={() => {}} />);
    // The label matters for honesty: the reminder ledger only writes a row on an
    // actual send, so its newest row is the last SEND, not the last attempt.
    const reminders = screen.getByText("Guest reminders").closest(".sys-job")!;
    expect(reminders.textContent).toMatch(/Last send .+\d/);
    expect(reminders.textContent).toMatch(/Succeeded/);
    const analytics = screen.getByText("Analytics generation").closest(".sys-job")!;
    expect(analytics.textContent).toMatch(/Last run .+\d/);
    expect(analytics.textContent).toMatch(/Failed/);
  });

  it("keeps the migration search on the shared input without a toolbar card", () => {
    render(<SystemHealthView data={health()} onRefresh={() => {}} />);
    const search = screen.getByLabelText("Search migrations");
    // Shared HavenSearchInput; no bordered toolbar wrapper around it (D-026).
    expect(search.closest(".haven-data-toolbar,.reservation-filters,.table-tools")).toBeNull();
  });

  it("spins the probe icon while refreshing and notifies on success", async () => {
    let resolveRefresh!: () => void;
    const onRefresh = vi.fn(() => new Promise<void>((resolve) => { resolveRefresh = resolve; }));
    const notify = vi.fn();
    render(<SystemHealthView data={health()} onRefresh={onRefresh} notify={notify} />);
    fireEvent.click(screen.getByRole("button", { name: /Run Health Probes/ }));
    expect(document.querySelector(".sys-spin")).toBeTruthy();
    resolveRefresh();
    await waitFor(() => expect(notify).toHaveBeenCalledWith("System probes refreshed successfully."));
  });

  it("opens the pending-migrations modal from the migrations row action", () => {
    render(<SystemHealthView data={health({ migrations: { applied: [{ version: "20260923010000", name: "stay_extension_exception", appliedAt: null }], appliedCount: 1, localCount: 2, status: "remote_behind", pending: [{ version: "20261017010000", name: "express_checkin", appliedAt: null }] } })} onRefresh={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /View \d+ pending migrations/ }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("20261017010000_express_checkin.sql")).toBeTruthy();
  });

  it("renders the automations rail as a stacked list, with no gateway restatement", () => {
    render(<SystemHealthView data={health()} onRefresh={() => {}} />);
    expect(screen.getByRole("heading", { name: /Scheduled Automations/ })).toBeTruthy();
    expect(screen.getByText("Guest reminders")).toBeTruthy();
    expect(screen.getByText("Analytics generation")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Needs attention/ })).toBeTruthy();
    // Test mode is already the Webhook card's own state and action; repeating
    // it as an alert is the duplication this page was rebuilt to remove.
    expect(screen.queryByText(/Test mode active/)).toBeNull();
    // Rail automations render as a stacked list — no table, no x-scroll wrapper.
    const rail = document.querySelector(".sys-rail .sys-automations")!;
    expect(rail.querySelectorAll(".sys-jobs > li.sys-job")).toHaveLength(2);
    expect(rail.querySelector(".table-scroll")).toBeNull();
  });

  it("renders the migration ledger rows with dates and the applied count", () => {
    render(<SystemHealthView data={health()} onRefresh={() => {}} />);
    expect(migrationRows()).toHaveLength(2);
    expect(screen.getByText("system health ledger")).toBeTruthy();
    expect(screen.getByText("2 / 2")).toBeTruthy();
    expect(screen.getAllByText("Applied", { exact: true })).toHaveLength(2);
    // Date column: exact date renders, approximate rows carry the marker.
    expect(screen.getByRole("columnheader", { name: "Date" })).toBeTruthy();
    expect(document.querySelector('[aria-label="approximate date"]')).toBeTruthy();
  });

  it("names the actor behind each audit-trail action", () => {
    render(<SystemHealthView data={health()} onRefresh={() => {}} />);
    fireEvent.click(screen.getByRole("tab", { name: /Audit Trail/ }));
    expect(screen.getByRole("columnheader", { name: "By" })).toBeTruthy();
    expect(screen.getByText("Ada (System Administrator)")).toBeTruthy();
  });

  it("allots the By column its own width with word-safe wrapping", () => {
    const css = readFileSync(resolve(process.cwd(), "components/admin/system-health.css"), "utf8");
    // By is fixed so actor names never shred mid-word; Entity absorbs slack.
    expect(css).toMatch(/--sys-col-by:\s*220px/);
    expect(css).toMatch(/\.system-health-table--audit \.col-by\{[^}]*width:\s*var\(--sys-col-by\)/);
    const byRule = css.match(/\.system-health-table--audit td:last-child\{[^}]*\}/)![0];
    expect(byRule).toMatch(/overflow-wrap:\s*break-word/);
    expect(byRule).not.toMatch(/anywhere/);
    expect(css).toMatch(/\.system-health-table \.col-by\{[^}]*width:\s*auto/);
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
    // Ledger tab styling is ledger-scoped, detached from the table card.
    expect(list.classList.contains("system-health-tablist")).toBe(true);
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

  it("carries migration drift on its own card, not as a duplicate alert", () => {
    render(<SystemHealthView data={health({ migrations: { applied: [{ version: "20260923010000", name: "stay_extension_exception", appliedAt: null }], appliedCount: 1, localCount: 2, status: "remote_behind" } })} onRefresh={() => {}} />);
    const card = screen.getByText("Migrations Applied").closest(".sys-health-card")!;
    expect(card.textContent).toMatch(/1 \/ 2/);
    expect(card.textContent).toMatch(/1 local migration is not applied to the live database/);
    // The card states the drift and carries the View pending action, so the
    // queue must not repeat it.
    expect(document.querySelector(".sys-queue")!.textContent).not.toMatch(/migration/i);
  });

  it("shows the unreachable alert instead of a drift warning when the DB probe fails", () => {
    render(<SystemHealthView data={health({ db: { live: false, latencyMs: null, checkedAt: "2026-09-24T08:30:00.000Z", error: "connection refused" } })} onRefresh={() => {}} />);
    expect(screen.getByText("Unreachable")).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText(/Database unreachable/)).toBeTruthy();
    expect(document.querySelector(".sys-queue")!.textContent).not.toMatch(/migration/i);
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
    render(<SystemHealthView data={health({ gateway: { status: "not_configured", hasSecretKey: false, hasWebhookSecret: false } })} onRefresh={() => {}} />);
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

  it("renders migration versions as monospace code, not bold body text", () => {
    render(<SystemHealthView data={health()} onRefresh={() => {}} />);
    const cell = screen.getByText("20260924010000");
    expect(cell.tagName).toBe("CODE");
    expect(cell.classList.contains("version-code")).toBe(true);
  });

  it("pairs the ledger search with a live count in a transparent row", () => {
    render(<SystemHealthView data={health()} onRefresh={() => {}} />);
    const row = document.querySelector(".system-health-searchrow")!;
    expect(row.textContent).toMatch(/2 of 2 shown/);
    expect(screen.getByLabelText("Search migrations").closest(".system-health-searchrow")).toBe(row);
  });

  it("keeps pagination on the shared TablePagination primitive", () => {
    render(<SystemHealthView data={health()} onRefresh={() => {}} />);
    expect(document.querySelector(".table-pagination")).toBeTruthy();
    expect(document.querySelector(".sys-pagination-btn")).toBeNull();
  });

  it("scopes ledger table rules to real shell tokens", () => {
    const css = readFileSync(resolve(process.cwd(), "components/admin/system-health.css"), "utf8");
    // No Tailwind palette literals, no invented tokens — the brief's
    // --bg-card/--border-subtle/--text-muted family does not exist here.
    for (const banned of ["bg-emerald-", "text-emerald-", "--bg-card", "--border-subtle", "--text-muted", "--text-main", "--bg-hover", "--bg-subtle"]) {
      expect(css).not.toContain(banned);
    }
    expect(css).toContain(".system-health-table th");
    expect(css).toContain(".system-health-table .version-code");
    expect(css).toContain("var(--font-mono)");
    // Transparent search row: flex layout only, never a bordered card (D-026).
    const searchRule = css.match(/\.system-health-searchrow\{[^}]*\}/)![0];
    expect(searchRule).not.toMatch(/background|border|box-shadow|padding/);
  });

  it("keeps ledger tabs detached from the content card", () => {
    render(<SystemHealthView data={health()} onRefresh={() => {}} />);
    const ledger = document.querySelector(".system-health-ledger")!;
    const tabs = ledger.querySelector(".system-health-ledger-tabs")!;
    const content = ledger.querySelector(".system-health-ledger-content")!;
    expect(tabs.querySelector('[role="tablist"]')).toBeTruthy();
    expect(content.querySelector("#sys-panel-migrations")).toBeTruthy();
    expect(content.querySelector("#sys-panel-payment")).toBeTruthy();
    expect(content.querySelector("#sys-panel-audit")).toBeTruthy();
    // Tables use fixed layout to fit the grid column, so they must not sit in
    // .table-scroll — its global `table{min-width:560px}` floor (responsive.css)
    // would force overflow inside the ledger column.
    expect(ledger.querySelector(".table-scroll")).toBeNull();
  });

  it("never leaks unscoped shell selectors onto the admin app", () => {
    // Both module stylesheets are imported by admin-dashboard-client.tsx, which
    // renders every admin section, so Next.js applies them app-wide. Unscoped
    // .page-title/.panel-heading rules beat the themes' own rules for every other
    // section — keep selectors namespaced to .sys-* / .sec-*.
    const leaks = [
      /^\.page-title h1\{/m,
      /^\.page-title \.title-actions\{/m,
      /^\.panel-heading h3\{/m,
    ];
    for (const file of ["system-health.css", "security-config.css"]) {
      const css = readFileSync(resolve(process.cwd(), "components/admin", file), "utf8");
      for (const leak of leaks) expect(css).not.toMatch(leak);
    }
    // Security Configuration headings carry unwrapped icons and depend on a flex
    // row for the icon/label gap; that rule must live in that module, not leak in.
    expect(readFileSync(resolve(process.cwd(), "components/admin/security-config.css"), "utf8"))
      .toContain(".sec-panel .panel-heading h3");
  });

  it("shares the staff stat grammar: 24px value, tone chip, tactile hover", () => {
    render(<SystemHealthView data={health()} onRefresh={() => {}} />);
    const css = readFileSync(resolve(process.cwd(), "components/admin/system-health.css"), "utf8");
    // 24px stat step (the DESIGN.md §16 30px/24px alternate for dense cards).
    expect(css).toMatch(/\.sys-card-value b\{[^}]*font-size:24px/);
    // Card-name icons carry the card tone as a 10% tint chip.
    const card = screen.getByText("PayMongo Webhook").closest(".sys-health-card")!;
    expect(card.querySelector(".sys-card-name .sys-ico-warn")).toBeTruthy();
    expect(css).toMatch(/\.sys-card-name \.sys-ico-warn\{[^}]*color-mix/);
    // Base-card lift on the tactile curve, gated on reduced motion.
    expect(css).toMatch(/\.sys-health-card:hover\{[^}]*translateY\(-1px\)/);
    expect(css).toMatch(/prefers-reduced-motion/);
  });

  it("names ledger and job states honestly — paid stays a payment word", () => {
    render(<SystemHealthView data={health({
      automations: [
        { name: "Guest reminders", schedule: "Daily 01:05 UTC", lastRun: "2026-09-26T01:05:00.000Z", lastRunLabel: "Last send", lastStatus: "succeeded" },
        { name: "Analytics generation", schedule: "Daily 18:35 UTC", lastRun: "2026-09-25T18:35:00.000Z", lastRunLabel: "Last run", lastStatus: "failed" },
      ],
    })} onRefresh={() => {}} />);
    // Migrations and jobs never borrow the payment-success family.
    for (const cell of screen.getAllByText("Applied", { exact: true })) {
      expect(cell.classList.contains("applied")).toBe(true);
      expect(cell.classList.contains("paid")).toBe(false);
    }
    expect(screen.getByText("Succeeded").className).toMatch(/succeeded/);
    expect(screen.getByText("Failed").className).toMatch(/failed/);
    // Info queue rows ride the info-blue family, not healthy green.
    const infoRow = screen.getByText("Public domain").closest("li")!;
    expect(infoRow.querySelector(".badge.info")).toBeTruthy();
    // New families exist in both themes in the module scope (leak-safe).
    const css = readFileSync(resolve(process.cwd(), "components/admin/system-health.css"), "utf8");
    for (const selector of [
      ".theme-light .system-health-ledger-content .badge.applied",
      ".theme-light .sys-automations .badge.succeeded",
      ".theme-light .sys-automations .badge.failed",
      ".theme-light .sys-queue .badge.info",
    ]) {
      expect(css).toContain(selector);
    }
  });

  it("reserves paid for genuine payment states", () => {
    render(<SystemHealthView data={health({
      payments: {
        status: "Active", accountName: "Haven Hotel", mobileNumber: "+639000000000",
        qrImage: "Configured", configuredBy: "Owner", lastUpdated: "2026-09-24T08:30:00.000Z",
        qrStorage: "Healthy", configuration: "Complete",
      },
    })} onRefresh={() => {}} />);
    fireEvent.click(screen.getByRole("tab", { name: /Payment Configuration/ }));
    const paidBadges = Array.from(document.querySelectorAll(".badge.paid"));
    expect(paidBadges).toHaveLength(1);
    expect(paidBadges[0].textContent).toBe("Active");
  });

  it("wraps pending filenames instead of truncating them", () => {
    const css = readFileSync(resolve(process.cwd(), "components/admin/system-health.css"), "utf8");
    const rule = css.match(/\.sys-pending-file\{[^}]*\}/)![0];
    expect(rule).toMatch(/line-clamp/);
    expect(rule).not.toMatch(/text-overflow/);
  });

  it("owns honest loading and empty states for payment and audit", () => {
    render(<SystemHealthView data={health({ payments: null as unknown as SystemHealth["payments"] })} onRefresh={() => {}} />);
    fireEvent.click(screen.getByRole("tab", { name: /Payment Configuration/ }));
    expect(screen.getByRole("status", { name: "Loading payment configuration" })).toBeTruthy();
    cleanup();
    const onRefresh = vi.fn();
    render(<SystemHealthView data={health({ recentProbes: [] })} onRefresh={onRefresh} />);
    fireEvent.click(screen.getByRole("tab", { name: /Audit Trail/ }));
    expect(screen.getByText("No probe history yet")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Run health probes/ }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
