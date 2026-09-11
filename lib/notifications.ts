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
};

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
    href: row.href
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
