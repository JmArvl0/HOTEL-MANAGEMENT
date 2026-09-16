import { supabase } from "@/lib/supabase";
import { sendEmail, guestEmailHtml } from "@/lib/email";

/**
 * Event-sourced customer notifications. State-changing routes call
 * recordNotification(...) after their RPC succeeds; the portal reads the
 * `notifications` table instead of re-deriving state on every page view.
 *
 * Recording NEVER throws and NEVER blocks the caller's success response:
 * a notification failure is logged and swallowed — the business transaction
 * (which already committed) is the source of truth, not the side channel.
 * Guest email (when RESEND_API_KEY is configured) rides the same guarantee.
 */

export type NotificationType =
  | "deposit_verified"
  | "deposit_rejected"
  | "stay_payment_verified"
  | "stay_payment_rejected"
  | "request_batch_reviewed"
  | "transportation_scheduled"
  | "transportation_cancelled"
  | "payment_link"
  | "reservation_confirmed"
  | "pre_arrival_reminder"
  | "pre_departure_reminder";

export interface NotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  detail?: string;
  href?: string;
}

export interface CustomerNotificationRow {
  id: string;
  type: NotificationType;
  title: string;
  detail: string;
  href: string;
  read_at: string | null;
  created_at: string;
}

/** The shape the portal components already render (customer-shell). */
export type CustomerNotification = {
  id: string;
  title: string;
  detail: string;
  createdAt: string;
  href: string;
  readAt?: string | null;
  type?: NotificationType;
};

/** Authoritative hotel timezone for day-bucketing notification history. */
export const NOTIFICATION_HOTEL_TIME_ZONE = "Asia/Manila";

const hotelDayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: NOTIFICATION_HOTEL_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** YYYY-MM-DD hotel-day key for an ISO timestamp ("" when unparseable). */
export function hotelDayKey(value: unknown): string {
  const date = new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) return "";
  return hotelDayFmt.format(date);
}

/** Today's hotel-day key. */
export function hotelTodayKey(now: Date = new Date()): string {
  return hotelDayFmt.format(now);
}

export type NotificationDayFilter = "today" | "yesterday" | string;

/** Resolve a day-filter selection to a YYYY-MM-DD hotel-day key. */
export function resolveNotificationDay(filter: NotificationDayFilter, todayKey: string): string {
  if (filter === "today") return todayKey;
  if (filter === "yesterday") {
    const date = new Date(`${todayKey}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return todayKey;
    return hotelDayFmt.format(new Date(date.getTime() - 86400000));
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(filter) ? filter : todayKey;
}

export interface HistoryItemLike {
  id: string;
  createdAt?: string | null;
  readAt?: string | null;
}

/** Keep only items created on the given hotel day (missing dates never match). */
export function filterNotificationsByHotelDay<T extends HistoryItemLike>(items: readonly T[], dayKey: string): T[] {
  if (!dayKey) return [];
  return items.filter((item) => hotelDayKey(item.createdAt) === dayKey);
}

function createdTime(value: unknown): number {
  const time = new Date(String(value ?? "")).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/** Split into unread-first / read-second, each newest-first by createdAt. */
export function splitUnreadRead<T extends HistoryItemLike>(items: readonly T[]): { unread: T[]; read: T[] } {
  const unread = items.filter((item) => !item.readAt);
  const read = items.filter((item) => Boolean(item.readAt));
  const newestFirst = (a: T, b: T) => createdTime(b.createdAt) - createdTime(a.createdAt);
  return { unread: [...unread].sort(newestFirst), read: [...read].sort(newestFirst) };
}

export async function recordNotification(input: NotificationInput): Promise<void> {
  if (!supabase) return; // demo mode — no store, no error
  try {
    const { error } = await supabase.from("notifications").insert({
      user_id: input.userId,
      type: input.type,
      title: input.title,
      detail: input.detail ?? "",
      href: input.href ?? ""
    });
    if (error) console.error("notification insert failed", input.type, error.message);
  } catch {
    // ponytail: swallow-and-log is deliberate — the notification is a side
    // channel; failing the already-committed business action here would be
    // worse than a missing bell item.
  }
}

/** Optionally send the guest an email copy; same never-throw contract. */
export async function notifyWithOptionalEmail(
  input: NotificationInput,
  email: string | null | undefined,
  message: { subject: string; heading: string; bodyHtml: string }
): Promise<void> {
  await recordNotification(input);
  if (!email) return;
  const result = await sendEmail({ to: email, subject: message.subject, html: guestEmailHtml(message.heading, message.bodyHtml) });
  if (!result.ok && result.reason === "failed") console.error("guest email failed", input.type, result.message);
}

export async function getCustomerNotifications(userId: string, limit = 50): Promise<CustomerNotification[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("notifications")
    .select("id,type,title,detail,href,read_at,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row: CustomerNotificationRow) => ({
    id: row.id,
    title: row.title,
    detail: row.detail,
    createdAt: row.created_at,
    href: row.href,
    readAt: row.read_at,
    type: row.type
  }));
}

export async function countUnreadNotifications(userId: string): Promise<number> {
  if (!supabase) return 0;
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);
  if (error) return 0;
  return count ?? 0;
}

export async function markNotificationsRead(userId: string, ids: string[]): Promise<void> {
  if (!supabase || !ids.length) return;
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId).in("id", ids);
}
