import { NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import type { Role } from "@/lib/types";

const ROLES: Role[] = ["manager", "owner", "admin"];
const RECEIVE_ROLES: Role[] = ["manager", "housekeeping", "owner", "admin"];

function denied(role: string | undefined, allowed: Role[]) {
  return !allowed.includes(role as Role);
}

export async function submitRoute(id: string, userId: string, version: number) {
  if (!supabase) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  const { data, error } = await supabase.rpc("submit_purchase_order", { p_po_id: id, p_staff_user_id: userId, p_expected_version: version });
  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("PO_STALE")) return NextResponse.json({ error: "Order changed — reload and retry.", code: "PO_STALE" }, { status: 409 });
    if (msg.includes("PO_NOT_DRAFT")) return NextResponse.json({ error: "Only drafts can be submitted." }, { status: 409 });
    if (msg.includes("PO_ITEM_NOT_FOUND")) return NextResponse.json({ error: "An item is no longer in inventory." }, { status: 409 });
    if (msg.includes("FORBIDDEN")) return NextResponse.json({ error: "Submission access required." }, { status: 403 });
    return NextResponse.json({ error: "Unable to submit the purchase order." }, { status: 409 });
  }
  return NextResponse.json({ data });
}

export async function receiveRoute(id: string, userId: string, role: string | undefined, body: unknown) {
  if (denied(role, RECEIVE_ROLES)) return NextResponse.json({ error: "Receiving access required." }, { status: 403 });
  const parsed = z.object({
    version: z.number().int().positive(),
    items: z.array(z.object({ itemId: z.string().min(1), quantity: z.number().min(0).max(100000) })).default([])
  }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Check the received quantities." }, { status: 400 });
  if (!supabase) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  const { data, error } = await supabase.rpc("inventory_receive_purchase_order", {
    p_po_id: id, p_staff_user_id: userId, p_items_received_json: parsed.data.items, p_expected_version: parsed.data.version
  });
  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("PO_STALE")) return NextResponse.json({ error: "Order changed — reload and retry.", code: "PO_STALE" }, { status: 409 });
    if (msg.includes("PO_NOT_APPROVED")) return NextResponse.json({ error: "Only approved orders can be received." }, { status: 409 });
    if (msg.includes("PO_INVALID_RECEIVED_QTY")) return NextResponse.json({ error: "Received quantity exceeds what was ordered." }, { status: 400 });
    if (msg.includes("FORBIDDEN")) return NextResponse.json({ error: "Receiving access required." }, { status: 403 });
    return NextResponse.json({ error: "Unable to receive the purchase order." }, { status: 409 });
  }
  return NextResponse.json({ data });
}

export async function cancelRoute(id: string, userId: string, body: unknown) {
  const parsed = z.object({ version: z.number().int().positive(), reason: z.string().trim().min(3).max(500) }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "A reason (3–500 chars) is required." }, { status: 400 });
  if (!supabase) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  const { data, error } = await supabase.rpc("cancel_purchase_order", {
    p_po_id: id, p_staff_user_id: userId, p_reason: parsed.data.reason, p_expected_version: parsed.data.version
  });
  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("PO_IMMUTABLE")) return NextResponse.json({ error: "Received orders cannot be changed." }, { status: 409 });
    if (msg.includes("PO_STALE")) return NextResponse.json({ error: "Order changed — reload and retry.", code: "PO_STALE" }, { status: 409 });
    return NextResponse.json({ error: "Unable to cancel the purchase order." }, { status: 409 });
  }
  return NextResponse.json({ data });
}

export { ROLES };
