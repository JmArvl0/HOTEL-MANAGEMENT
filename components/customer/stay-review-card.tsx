"use client";

import { useState } from "react";
import { Star, MessageSquareHeart } from "lucide-react";

export type ExistingReview = { rating: number; comment: string } | null;

// Shown only for checked_out stays (the page decides eligibility).
// One review per stay: once saved, the card turns read-only.
export function StayReviewCard({
  reservationId,
  existing,
}: {
  reservationId: string;
  existing: ExistingReview;
}) {
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [comment, setComment] = useState(existing?.comment ?? "");
  const [saved, setSaved] = useState<ExistingReview>(existing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (saved) {
    return (
      <section className="customer-detail-card stay-review" aria-label="Your review">
        <h2><MessageSquareHeart size={16} aria-hidden="true" />Your review</h2>
        <p className="stay-review-stars" role="img" aria-label={`You rated this stay ${saved.rating} out of 5 stars`}>
          {[1, 2, 3, 4, 5].map((star) => (
            <Star key={star} size={17} aria-hidden="true" fill={star <= saved.rating ? "currentColor" : "none"} />
          ))}
        </p>
        <p className="stay-review-comment">{saved.comment}</p>
        <p className="stay-review-note">Thanks — your review appears on our homepage with your first name.</p>
      </section>
    );
  }

  const tooLong = comment.trim().length > 1000;
  const valid = rating >= 1 && comment.trim().length >= 10 && !tooLong;

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/account/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId, rating, comment: comment.trim() }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to save your review.");
      setSaved({ rating, comment: comment.trim() });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save your review.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="customer-detail-card stay-review" aria-label="Review your stay">
      <h2><MessageSquareHeart size={16} aria-hidden="true" />How was your stay?</h2>
      <p className="stay-review-note">One review per stay — it will appear on our homepage.</p>
      <div className="stay-review-stars" role="group" aria-label="Star rating">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            aria-pressed={rating === star}
            aria-label={`Rate ${star} star${star === 1 ? "" : "s"}`}
            className={star <= rating ? "lit" : ""}
            onClick={() => setRating(star)}
          >
            <Star size={24} aria-hidden="true" fill={star <= rating ? "currentColor" : "none"} />
          </button>
        ))}
      </div>
      <label htmlFor="stay-review-comment">Your review</label>
      <textarea
        id="stay-review-comment"
        rows={4}
        maxLength={1000}
        placeholder="Tell future guests what stood out…"
        value={comment}
        onChange={(event) => setComment(event.target.value)}
      />
      {error && <p className="stay-review-error" role="alert">{error}</p>}
      <button type="button" className="btn btn-accent" disabled={!valid || busy} onClick={submit}>
        {busy ? "Saving…" : "Submit review"}
      </button>
    </section>
  );
}
