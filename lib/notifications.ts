import { supabase } from "@/lib/supabase";
import { sendEmail, guestEmailHtml } from "@/lib/email";
import {
  Bell,
  BedDouble,
  Boxes,
  CalendarCheck,
  CalendarClock,
  CalendarX,
  CarTaxiFront,
  CreditCard,
  ClipboardCheck,
  Link2,
  MessageSquare,
  RefreshCw,
  TriangleAlert,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

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
  | "reservation_cancelled"
  | "pre_arrival_reminder"
  | "pre_departure_reminder"
  | "reservation_change_submitted";

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

/** Bell dropdown preview size: recent unread + read, never the whole history. */
export const BELL_PREVIEW_LIMIT = 7;

/** Bell preview set: unread first (newest), then read (newest), capped. */
export function previewNotifications<T extends HistoryItemLike>(items: readonly T[], cap: number = BELL_PREVIEW_LIMIT): T[] {
  const { unread, read } = splitUnreadRead(items);
  return [...unread, ...read].slice(0, Math.max(0, cap));
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

/** Customer-friendly relative time ("2h ago", "Yesterday", "Sep 15"), hotel-day aware. */
export function relativeTime(value: unknown, now: Date = new Date()): string {
  const date = new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = now.getTime() - date.getTime();
  if (diffMs >= 0 && diffMs < 60_000) return "Just now";
  const dayKey = hotelDayKey(date);
  const today = hotelTodayKey(now);
  if (dayKey === today) {
    // Same hotel day is always < 24h old, so minutes/hours cover everything.
    if (diffMs >= 0) return diffMs < 3_600_000 ? `${Math.max(1, Math.floor(diffMs / 60_000))}m ago` : `${Math.floor(diffMs / 3_600_000)}h ago`;
    return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", timeZone: NOTIFICATION_HOTEL_TIME_ZONE }).format(date);
  }
  if (dayKey === resolveNotificationDay("yesterday", today)) return "Yesterday";
  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", timeZone: NOTIFICATION_HOTEL_TIME_ZONE }).format(date);
}

export type NotificationRecencyGroup = "today" | "yesterday" | "week" | "earlier";
export const RECENCY_GROUP_LABELS: Record<NotificationRecencyGroup, string> = {
  today: "Today",
  yesterday: "Yesterday",
  week: "Earlier this week",
  earlier: "Earlier",
};

/** Bucket items into Today / Yesterday / Earlier-this-week / Earlier (hotel days, newest-first preserved). */
export function groupNotificationsByRecency<T extends HistoryItemLike>(
  items: readonly T[],
  todayKey: string = hotelTodayKey()
): { key: NotificationRecencyGroup; items: T[] }[] {
  const buckets: Record<NotificationRecencyGroup, T[]> = { today: [], yesterday: [], week: [], earlier: [] };
  const todayStart = new Date(`${todayKey}T00:00:00Z`).getTime();
  const weekStart = todayStart - 6 * 86_400_000;
  for (const item of items) {
    const key = hotelDayKey(item.createdAt);
    const dayStart = new Date(`${key}T00:00:00Z`).getTime();
    if (!key || Number.isNaN(dayStart)) buckets.earlier.push(item);
    else if (key === todayKey) buckets.today.push(item);
    else if (key === resolveNotificationDay("yesterday", todayKey)) buckets.yesterday.push(item);
    else if (dayStart >= weekStart && dayStart < todayStart) buckets.week.push(item);
    else buckets.earlier.push(item);
  }
  return (Object.keys(buckets) as NotificationRecencyGroup[])
    .filter((key) => buckets[key].length > 0)
    .map((key) => ({ key, items: buckets[key] }));
}

/** One semantic icon per notification type — the single source for the bell dropdown and history modal. */
export const NOTIFICATION_TYPE_ICONS: Record<string, LucideIcon> = {
  reservation_confirmed: CalendarCheck,
  deposit_verified: CreditCard,
  stay_payment_verified: CreditCard,
  deposit_rejected: TriangleAlert,
  stay_payment_rejected: TriangleAlert,
  request_batch_reviewed: MessageSquare,
  transportation_scheduled: CarTaxiFront,
  transportation_cancelled: CarTaxiFront,
  payment_link: Link2,
  pre_arrival_reminder: CalendarClock,
  pre_departure_reminder: CalendarClock,
  reservation_change_submitted: RefreshCw,
  reservation_cancelled: CalendarX,
  reservations: CalendarCheck,
  rooms: BedDouble,
  guests: Users,
  guest_requests: MessageSquare,
  transportation: CarTaxiFront,
  approvals: ClipboardCheck,
  housekeeping_tasks: BedDouble,
  maintenance_orders: Wrench,
  inventory: Boxes,
  invoices: CreditCard,
  payments: CreditCard,
  refunds: RefreshCw,
  transactions: CreditCard,
  folios: CreditCard,
};

export function notificationIcon(type: unknown): LucideIcon {
  return (typeof type === "string" && type in NOTIFICATION_TYPE_ICONS
    ? NOTIFICATION_TYPE_ICONS[type]
    : Bell) as LucideIcon;
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

export async function getCustomerNotifications(userId: string, limit = 50, offset = 0): Promise<CustomerNotification[]> {
  if (!supabase) return [];
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 200) : 50;
  const safeOffset = Number.isFinite(offset) ? Math.max(Math.floor(offset), 0) : 0;
  const query = supabase
    .from("notifications")
    .select("id,type,title,detail,href,read_at,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  // offset>0 pages through the full history for the modal's Load more;
  // offset 0 keeps the plain limit( ) shape every existing caller uses.
  const { data, error } = await (safeOffset > 0
    ? query.range(safeOffset, safeOffset + safeLimit - 1)
    : query.limit(safeLimit));
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

export async function markAllNotificationsRead(userId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null);
  if (error) throw error;
}
