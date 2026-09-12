import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DUMMY_REVIEWS,
  maskGuestName,
  validateReview,
} from "@/lib/stay-reviews";

// Stay-gated guest reviews: 1 review per completed stay, surfaced on the
// landing page with dummy placeholders until the first real review lands.
describe("stay review helpers", () => {
  it("masks guest names to first name + last initial", () => {
    expect(maskGuestName("Maria Santos")).toBe("Maria S.");
    expect(maskGuestName("Jen")).toBe("Jen");
    expect(maskGuestName("  ")).toBe("Guest");
  });

  it("accepts a 1–5 rating with a 10–1000 character comment", () => {
    expect(validateReview(5, "Spotless room and a smooth arrival.")).toBeNull();
    expect(validateReview(1, "Too noisy at night, sadly.")).toBeNull();
  });

  it("rejects out-of-range ratings and too-short or too-long comments", () => {
    expect(validateReview(0, "Spotless room and a smooth arrival.")).not.toBeNull();
    expect(validateReview(6, "Spotless room and a smooth arrival.")).not.toBeNull();
    expect(validateReview(4.5, "Spotless room and a smooth arrival.")).not.toBeNull();
    expect(validateReview(5, "Too short")).not.toBeNull();
    expect(validateReview(5, "x".repeat(1001))).not.toBeNull();
  });

  it("ships dummy placeholders shaped like real reviews", () => {
    expect(DUMMY_REVIEWS.length).toBeGreaterThan(0);
    for (const review of DUMMY_REVIEWS) {
      expect(review.rating).toBeGreaterThanOrEqual(1);
      expect(review.rating).toBeLessThanOrEqual(5);
      expect(review.comment.length).toBeGreaterThan(0);
      expect(review.dummy).toBe(true);
    }
  });
});

describe("stay review migration and surface contract", () => {
  const migration = readFileSync(
    "supabase/migrations/20260935010000_stay_reviews.sql",
    "utf8",
  );
  const route = readFileSync("app/api/account/reviews/route.ts", "utf8");
  const lib = readFileSync("lib/stay-reviews.ts", "utf8");
  const landing = readFileSync("app/(landing-page)/page.tsx", "utf8");
  const detailPage = readFileSync(
    "app/(booking)/(customer)/my-reservations/[id]/page.tsx",
    "utf8",
  );

  it("enforces one review per stay with stay-completion and ownership gates", () => {
    expect(migration).toContain("create table if not exists public.stay_reviews");
    expect(migration).toContain("on public.stay_reviews(reservation_id)");
    expect(migration).toContain("check (rating between 1 and 5)");
    expect(migration).toContain("raise exception 'NOT_BOOKED'");
    expect(migration).toContain("raise exception 'STAY_NOT_COMPLETED'");
    expect(migration).toContain("raise exception 'ALREADY_REVIEWED'");
    expect(migration).toContain("r.status <> 'checked_out'");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain(
      "grant execute on function public.customer_submit_stay_review(uuid, text, integer, text)",
    );
    expect(migration).toContain("to service_role");
  });

  it("keeps the customer route guest-only with friendly rule errors", () => {
    expect(route).toContain('session.user.role!=="guest"');
    expect(route).toContain('rpc("customer_submit_stay_review"');
    expect(route).toContain("STAY_NOT_COMPLETED");
    expect(route).toContain("ALREADY_REVIEWED");
    expect(route).toContain("NOT_BOOKED");
  });

  it("falls back to dummies only when no real review exists", () => {
    expect(lib).toContain("DUMMY_REVIEWS");
    expect(lib).toContain("if (error || !data?.length) return DUMMY_REVIEWS");
  });

  it("renders verified-stay reviews on the landing page past the teaser", () => {
    expect(landing).toContain("getPublishedReviews");
    expect(landing).toContain('id="reviews"');
    expect(landing).toContain("Verified stay");
    expect(landing).not.toContain("Occupancy outlook");
    expect(landing).not.toContain("requiring attention");
  });

  it("offers the review form only on the completed-stay detail page", () => {
    expect(detailPage).toContain("StayReviewCard");
    expect(detailPage).toContain('reservation.status === "checked_out"');
  });
});
