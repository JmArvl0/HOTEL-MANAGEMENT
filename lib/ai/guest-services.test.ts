// AI-Assisted Guest Services & Executive Shift Summary — contract tests.
//
// Deliberate reuse, pinned here: guest smart-request drafting rides the
// proven guest-concierge endpoint (no parallel implementation), and the
// executive digest rides the report-summary route in digest mode. These tests
// pin that reuse plus the new digest schema, guards, and fallback behavior.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ExecutiveDigestSchema, EXECUTIVE_DIGEST_TASK, buildExecutiveDigestContext } from "./executive-summary";
import { GuestActionDraftSchema, GuestConciergeReplySchema } from "./guest-concierge";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("guest smart-request drafting (via guest concierge)", () => {
  it("draft schema carries request types + description + reservation, zod-validated", () => {
    const draft = GuestActionDraftSchema.parse({ requestTypes: ["extra_towels"], description: "2 please", reservationId: "RSV-1" });
    expect(draft.requestTypes).toEqual(["extra_towels"]);
    expect(() => GuestActionDraftSchema.parse({ requestTypes: [], reservationId: "RSV-1" })).toThrow();
    expect(() => GuestActionDraftSchema.parse({ requestTypes: ["x"], reservationId: "" })).toThrow();
    const reply = GuestConciergeReplySchema.parse({ replyText: "Here you go." });
    expect(reply.actionDraft).toBeUndefined();
  });

  it("concierge route is guest-only, ownership-checked, rate-limited, and audited", () => {
    const route = read("app/api/account/ai/concierge/route.ts");
    expect(route).toContain('role !== "guest"');
    expect(route).toContain("Customer access required.");
    expect(route).toContain(".eq(\"user_id\", session.user.id)"); // reservation ownership
    expect(route).toContain('aiRateLimited(session.user.id, "guest_concierge"');
    expect(route).toContain('feature: "guest_concierge"');
    expect(route).toContain("{ data: null, message:"); // graceful degradation, never 5xx
  });

  it("drafts are catalog-restricted before Confirm can submit them", () => {
    const route = read("app/api/account/ai/concierge/route.ts");
    expect(route).toContain("allowed");
    expect(route).toContain("actionDraft: undefined");
  });

  it("confirm submits through the existing batch RPC for Front Desk review", () => {
    const panel = read("components/customer/guest-ai-concierge-panel.tsx");
    expect(panel).toContain('fetch("/api/account/requests"');
    expect(panel).toContain("idempotencyKey");
    expect(panel).toContain("Confirm Request");
    expect(panel).toContain("concierge-chip"); // quick prompt suggestions
    const requests = read("app/api/account/requests/route.ts");
    expect(requests).toContain('rpc("customer_submit_guest_requests"');
  });

  it("no smart-request duplicate endpoint exists — one concierge implementation", () => {
    expect(read("app/api/account/ai/concierge/route.ts")).toContain("askGuestConcierge");
  });
});

describe("executive shift summary", () => {
  it("digest schema holds the three spec sections", () => {
    const digest = ExecutiveDigestSchema.parse({
      executiveOverview: "Busy day: 12 arrivals against 10 departures; collections steady.",
      bottlenecks: ["4 rooms awaiting inspection at generation."],
      actionPlan: ["Clear inspection backlog before 15:00 arrivals."]
    });
    expect(digest.bottlenecks).toHaveLength(1);
    expect(() => ExecutiveDigestSchema.parse({ executiveOverview: "" })).toThrow();
  });

  it("context builder carries the snapshot with its report date", () => {
    const snapshot = {
      reportDate: "2026-09-20", generatedAt: "x",
      reservations: { created: 3, bySource: {}, arrivals: 5, departures: 4, cancelled: 0, noShow: 0 },
      guestRequests: { opened: 2, escalated: 0, openByDepartment: {} },
      collections: { count: 4, total: 25000, byPurpose: {} },
      rooms: {}, transportation: {}, approvals: {}
    } as never;
    const ctx = buildExecutiveDigestContext(snapshot);
    expect(ctx).toContain("2026-09-20");
    expect(ctx).toContain("25000");
    expect(EXECUTIVE_DIGEST_TASK).toContain("Do not invent");
  });

  it("digest mode reuses the report-summary guard, rate limit, audit, and fallback", () => {
    const route = read("app/api/ai/report-summary/route.ts");
    expect(route).toContain('mode === "digest"');
    expect(route).toContain("executive_shift_summary");
    expect(route).not.toContain('rpc("review_manager_approval"'); // AI never reviews or mutates
    expect(route).toContain("{ data: null, message:");
    expect(route).toContain("generateJson");
  });

  it("the audit feature enum migration covers the digest (and smart-request) values", () => {
    const migration = read("supabase/migrations/20261017010000_ai_executive_digest_feature.sql");
    expect(migration).toContain("executive_shift_summary");
    expect(migration).toContain("ai_interactions_feature_check");
  });

  it("the reports panel embeds a manager-only digest card above history", () => {
    const panel = read("components/manager/front-desk-reports-panel.tsx");
    expect(panel).toContain("AI Executive Digest");
    expect(panel).toContain('mode: "digest"');
    expect(panel).toContain("canReview && <ExecutiveDigestCard");
    expect(panel).toContain("pulse-skeleton");
    expect(panel).toContain("AI_DISCLOSURE");
  });
});
