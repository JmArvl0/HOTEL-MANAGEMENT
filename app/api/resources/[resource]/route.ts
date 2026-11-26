import { getAuthenticatedSession, requirePermission } from "@/lib/authorization";
import { canAccess } from "@/lib/permissions";
import { publicJson } from "@/lib/server-errors";
import { listForRole } from "@/lib/staff-data";
import { supabase } from "@/lib/supabase";
import type { Resource } from "@/lib/types";

type Context = { params: Promise<{ resource: string }> };

export async function GET(_: Request, { params }: Context) {
  const resource = (await params).resource as Resource;
  const auth = await requirePermission(role => canAccess(role, resource), "You don’t have permission to view these records.");
  if (auth.error) return auth.error;
  const { id, role } = auth.session.user;
  try {
    if (role !== "guest") return publicJson({ data: await listForRole(resource, role) });
    if (!supabase) return publicJson({ error: "Guest records are temporarily unavailable." }, { status: 503 });
    if (resource === "reservations") {
      const { data, error } = await supabase.from("reservations")
        .select("id,confirmation_number,room_number,room_type,check_in,check_out,guests,status,source,total,deposit,deposit_required,payment_status,payment_method,special_requests,expected_arrival,cancellation_reason,created_at")
        .eq("user_id", id).order("created_at", { ascending: false });
      if (error) throw error;
      return publicJson({ data });
    }
    // Guest invoices inherit ownership from the linked reservation.
    const { data, error } = await supabase.from("invoices")
      .select("id,reservation_id,amount,paid,balance,status,method,due_date,created_at,reservations!inner(user_id)")
      .eq("reservations.user_id", id).order("created_at", { ascending: false });
    if (error) throw error;
    return publicJson({ data: (data ?? []).map(invoice => ({
      id: invoice.id, reservation_id: invoice.reservation_id, amount: invoice.amount, paid: invoice.paid,
      balance: invoice.balance, status: invoice.status, method: invoice.method, due_date: invoice.due_date,
      created_at: invoice.created_at,
    })) });
  } catch {
    return publicJson({ error: "We couldn’t load these records. Please try again." }, { status: 500 });
  }
}

// Retain the response for older clients while all writes use named workflows.
async function rejectWrite(_: Request, { params }: Context) {
  if (!await getAuthenticatedSession()) return publicJson({ error: "Please sign in to continue." }, { status: 401 });
  const error = (await params).resource === "guest_requests"
    ? "Use the guest request workflow to create or update requests."
    : "Open the relevant module to make this change.";
  return publicJson({ error }, { status: 403 });
}

export async function POST(request: Request, context: Context) {
  return rejectWrite(request, context);
}

export async function PATCH(request: Request, context: Context) {
  return rejectWrite(request, context);
}
