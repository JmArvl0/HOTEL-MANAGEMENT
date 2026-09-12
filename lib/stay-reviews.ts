import { supabase } from "@/lib/supabase";

export type PublishedReview = {
  id: string;
  rating: number;
  comment: string;
  guestName: string;
  roomType: string;
  stayLabel: string;
  dummy?: boolean;
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

// Empty-state placeholders until the first real stay review lands.
export const DUMMY_REVIEWS: PublishedReview[] = [
  {
    id: "dummy-1",
    rating: 5,
    comment:
      "Check-in took minutes and the room was spotless. The airport pickup they arranged made the whole arrival effortless.",
    guestName: "Jen R.",
    roomType: "Deluxe King",
    stayLabel: "Aug 2026",
    dummy: true,
  },
  {
    id: "dummy-2",
    rating: 5,
    comment:
      "Quiet, comfortable, and the staff remembered the little things we asked for. Best sleep we've had on a trip in years.",
    guestName: "Marco D.",
    roomType: "Ocean Suite",
    stayLabel: "Jul 2026",
    dummy: true,
  },
  {
    id: "dummy-3",
    rating: 4,
    comment:
      "Great value for the location. Requests through the guest account were answered fast — fresh towels within the hour.",
    guestName: "Aira M.",
    roomType: "Garden Twin",
    stayLabel: "Jul 2026",
    dummy: true,
  },
];

function stayLabel(checkOut: string | null): string {
  if (!checkOut) return "";
  const date = new Date(`${checkOut.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-PH", { month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

// Latest verified-stay reviews for the landing page. Falls back to the
// dummy set only when no real review exists yet — never mixed.
export async function getPublishedReviews(): Promise<PublishedReview[]> {
  if (!supabase) return DUMMY_REVIEWS;
  const { data, error } = await supabase
    .from("stay_reviews")
    .select("id,rating,comment,reservation_id,created_at")
    .order("created_at", { ascending: false })
    .limit(LANDING_REVIEW_LIMIT);
  if (error || !data?.length) return DUMMY_REVIEWS;
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
