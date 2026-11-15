import { publicJson } from "@/lib/server-errors";
import { validationBody } from "@/lib/errors";

import { z } from "zod";
import { supabase } from "@/lib/supabase";
import type { Role } from "@/lib/types";

const ROLES: Role[] = ["manager", "owner", "admin"];
const RECEIVE_ROLES: Role[] = ["manager", "housekeeping", "owner", "admin"];

function denied(role: string | undefined, allowed: Role[]) {
  return !allowed.includes(role as Role);
}

export async function submitRoute(id: string, userId: string, version: number) {
  if (!supabase) return publicJson({ error: "This service is temporarily unavailable. Please try again shortly." }, { status: 503 });
  const { data, error } = await supabase.rpc("submit_purchase_order", { p_po_id: id, p_staff_user_id: userId, p_expected_version: version });
  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("PO_STALE")) return publicJson({ error: "Order changed — reload and retry.", code: "PO_STALE" }, { status: 409 });
    if (msg.includes("PO_NOT_DRAFT")) return publicJson({ error: "Only drafts can be submitted." }, { status: 409 });
    if (msg.includes("PO_ITEM_NOT_FOUND")) return publicJson({ error: "An item is no longer in inventory." }, { status: 409 });
    if (msg.includes("FORBIDDEN")) return publicJson({ error: "Submission access required." }, { status: 403 });
    return publicJson({ error: "Unable to submit the purchase order." }, { status: 409 });
  }
  return publicJson({ data });
}

export async function receiveRoute(id: string, userId: string, role: string | undefined, body: unknown) {
  if (denied(role, RECEIVE_ROLES)) return publicJson({ error: "Receiving access required." }, { status: 403 });
  const parsed = z.object({
    version: z.number().int().positive(),
    items: z.array(z.object({ itemId: z.string().min(1), quantity: z.number().int().positive().max(100000) })).min(1).max(100)
  }).safeParse(body);
  if (!parsed.success) return publicJson(validationBody(parsed.error, { error: "Check the received quantities." }), { status: 400 });
  if (!supabase) return publicJson({ error: "This service is temporarily unavailable. Please try again shortly." }, { status: 503 });
  const { data, error } = await supabase.rpc("inventory_receive_purchase_order", {
    p_po_id: id, p_staff_user_id: userId, p_items_received_json: parsed.data.items, p_expected_version: parsed.data.version
  });
  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("PO_STALE")) return publicJson({ error: "Order changed — reload and retry.", code: "PO_STALE" }, { status: 409 });
    if (msg.includes("PO_NOT_APPROVED")) return publicJson({ error: "Only approved or partially received orders can be received." }, { status: 409 });
    if (msg.includes("PO_INVALID_RECEIVED_QTY")) return publicJson({ error: "Enter positive quantities within the outstanding balance." }, { status: 400 });
    if (msg.includes("FORBIDDEN")) return publicJson({ error: "Receiving access required." }, { status: 403 });
    return publicJson({ error: "Unable to receive the purchase order." }, { status: 409 });
  }
  return publicJson({ data });
}

export async function cancelRoute(id: string, userId: string, body: unknown) {
  const parsed = z.object({ version: z.number().int().positive(), reason: z.string().trim().min(3).max(500) }).safeParse(body);
  if (!parsed.success) return publicJson(validationBody(parsed.error, { error: "Please enter a reason with 3 to 500 characters." }), { status: 400 });
  if (!supabase) return publicJson({ error: "This service is temporarily unavailable. Please try again shortly." }, { status: 503 });
  const { data, error } = await supabase.rpc("cancel_purchase_order", {
    p_po_id: id, p_staff_user_id: userId, p_reason: parsed.data.reason, p_expected_version: parsed.data.version
  });
  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("PO_IMMUTABLE")) return publicJson({ error: "Received orders cannot be changed." }, { status: 409 });
    if (msg.includes("PO_STALE")) return publicJson({ error: "Order changed — reload and retry.", code: "PO_STALE" }, { status: 409 });
    return publicJson({ error: "Unable to cancel the purchase order." }, { status: 409 });
  }
  return publicJson({ data });
}

export { ROLES };
