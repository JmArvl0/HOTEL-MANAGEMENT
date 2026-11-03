import { supabase } from "@/lib/supabase";

export type PublishedReview = {
  id: string;
  rating: number;
  comment: string;
  guestName: string;
  roomType: string;
  stayLabel: string;
};

export const REVIEW_COMMENT_MIN = 10;
export const REVIEW_COMMENT_MAX = 1000;
export const LANDING_REVIEW_LIMIT = 6;

// First name + last initial only — the landing page never shows full names.
export function maskGuestName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "Guest";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

export function validateReview(
  rating: unknown,
  comment: unknown,
): string | null {
  if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5)
    return "Choose a rating from 1 to 5 stars.";
  const text = typeof comment === "string" ? comment.trim() : "";
  if (text.length < REVIEW_COMMENT_MIN || text.length > REVIEW_COMMENT_MAX)
    return `Write a review between ${REVIEW_COMMENT_MIN} and ${REVIEW_COMMENT_MAX} characters.`;
  return null;
}

function stayLabel(checkOut: string | null): string {
  if (!checkOut) return "";
  const date = new Date(`${checkOut.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-PH", { month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

// Production testimonials always come from actual completed-stay reviews.
export async function getPublishedReviews(): Promise<PublishedReview[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("stay_reviews")
    .select("id,rating,comment,reservation_id,created_at")
    .order("created_at", { ascending: false })
    .limit(LANDING_REVIEW_LIMIT);
  if (error || !data?.length) return [];
  const ids = data.map((row) => String(row.reservation_id));
  const { data: stays } = await supabase
    .from("reservations")
    .select("id,guest_name,room_type,check_out")
    .in("id", ids);
  const byId = new Map((stays ?? []).map((stay) => [String(stay.id), stay]));
  return data.map((row) => {
    const stay = byId.get(String(row.reservation_id));
    return {
      id: String(row.id),
      rating: Number(row.rating),
      comment: String(row.comment),
      guestName: maskGuestName(String(stay?.guest_name ?? "Guest")),
      roomType: String(stay?.room_type ?? "Haven stay"),
      stayLabel: stayLabel(stay ? String(stay.check_out) : null),
    };
  });
}
