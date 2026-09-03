import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export type OwnerContext = { actorId: string; client: NonNullable<typeof supabase> };
export async function guardOwner(): Promise<OwnerContext | NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "owner") return NextResponse.json({ error: "Owner authority required." }, { status: 403 });
  if (!supabase) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  const { data } = await supabase.from("user_accounts").select("id,role,active,recovery_required").eq("id", session.user.id).maybeSingle();
  if (!data?.active || data.recovery_required || data.role !== "owner") return NextResponse.json({ error: "Owner session is no longer authorized." }, { status: 401 });
  return { actorId: data.id, client: supabase };
}
export const ownerGuardFailed = (value: OwnerContext | NextResponse): value is NextResponse => value instanceof NextResponse;
export function ownerRpcFailure(error: { message: string }, fallback: string) {
  const messages: Record<string, string> = {
    MANAGER_ESCALATION_FORBIDDEN: "Only an active Manager can escalate an exception to Owner.",
    OWNER_ESCALATION_REASON_REQUIRED: "An executive escalation reason is required.",
    OWNER_ESCALATION_REQUIRES_HIGH_RISK: "Only high or critical exceptions require Owner authority.",
    ALREADY_ESCALATED_TO_OWNER: "This exception is already awaiting Owner review.",
    OWNER_AUTHORITY_REQUIRED: "Owner authority required.",
    OWNER_REVIEW_NOT_REQUIRED: "This exception remains within Manager authority.",
    APPROVAL_ALREADY_REVIEWED: "This exception changed or has already been reviewed.",
    SELF_APPROVAL_FORBIDDEN: "The requester cannot approve their own exception.",
    APPROVAL_STALE: "The underlying operation changed; this exception is stale.",
    SAME_TYPE_ROOM_AVAILABLE: "A safe same-type room is available, so an upgrade is unnecessary.",
    UPGRADE_ROOM_UNAVAILABLE: "No safe upgrade room is currently available.",
    MODIFICATION_INVENTORY_UNAVAILABLE: "The requested stay cannot be supported by current inventory.",
    EARLY_CHECKIN_NOT_SAFE: "The room is not ready and serviceable for early check-in.",
    LATE_CHECKOUT_CONFLICT: "Late checkout would conflict with another stay.",
    REFUND_EXCEPTION_EXCEEDS_SETTLED_PAYMENT: "The exception exceeds remaining settled payment.",
    COMPENSATION_EXCEEDS_FOLIO: "The compensation exceeds the current folio obligation."
  };
  const key = Object.keys(messages).find((value) => error.message.includes(value));
  return NextResponse.json({ error: key ? messages[key] : fallback }, { status: /AUTHORITY|FORBIDDEN/.test(error.message) ? 403 : 409 });
}