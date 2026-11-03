import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { foundAction, LOST_FOUND_ROLES, type FoundItem, type FoundEvent } from "@/lib/operations";

async function context() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!LOST_FOUND_ROLES.includes(session.user.role)) return NextResponse.json({ error: "Lost & Found access required." }, { status: 403 });
  if (!supabase) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  return { user: session.user, client: supabase };
}
export async function GET() {
  const ctx = await context(); if (ctx instanceof NextResponse) return ctx;
  const fields = "id,description,found_location,found_at,storage_location,status,version,custodian_id" + (ctx.user.role === "housekeeping" ? "" : ",claimant_note");
  const items = await ctx.client.from("lost_found_items").select(fields).order("created_at", { ascending: false }).limit(100);
  if (items.error) return NextResponse.json({ error: "Lost & Found is unavailable. Check pending migrations or try again." }, { status: 503 });
  const ids = (items.data ?? []).map(item => String((item as unknown as { id: string }).id));
  let events = ctx.client.from("lost_found_events").select("id,item_id,action,note,actor_id,created_at").in("item_id", ids).order("created_at", { ascending: false }).limit(1000);
  if (ctx.user.role === "housekeeping") events = events.in("action", ["found", "secure", "take_custody"]);
  const history = ids.length ? await events : { data: [], error: null };
  if (history.error) return NextResponse.json({ error: "Custody history could not be loaded. Try again." }, { status: 503 });
  const rows = (items.data ?? []) as unknown as FoundItem[];
  const eventRows = (history.data ?? []) as FoundEvent[];
  const people = [...new Set([...rows.map(r => r.custodian_id), ...eventRows.map(e => e.actor_id)])];
  const names = people.length ? await ctx.client.from("user_accounts").select("id,name").in("id", people) : { data: [], error: null };
  if (names.error) return NextResponse.json({ error: "Custody staff details are unavailable. Try again." }, { status: 503 });
  const nameById = new Map((names.data ?? []).map(r => [String(r.id), String(r.name)]));
  return NextResponse.json({ data: { items: rows.map(r => ({ ...r, custodian_name: nameById.get(r.custodian_id) ?? "Staff member" })), events: eventRows.map(e => ({ ...e, actor_name: nameById.get(e.actor_id) ?? "Staff member" })) } });
}
export async function POST(request: Request) {
  const ctx = await context(); if (ctx instanceof NextResponse) return ctx;
  const parsed = foundAction.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check item details and enter a note of 3–500 characters." }, { status: 400 });
  const v = parsed.data;
  if (v.action === "record" && ctx.user.role !== "housekeeping") return NextResponse.json({ error: "Housekeeping records found items." }, { status: 403 });
  const { data, error } = v.action === "record"
    ? await ctx.client.rpc("record_found_item", { p_actor: ctx.user.id, p_id: v.id, p_description: v.description, p_location: v.location, p_found_at: v.foundAt })
    : await ctx.client.rpc("act_found_item", { p_actor: ctx.user.id, p_id: v.id, p_version: v.version, p_action: v.action, p_note: v.note, p_identity_verified: v.identityVerified });
  if (error) return NextResponse.json({ error: "Unable to save. Check the item status, your role, and the required confirmation, then refresh." }, { status: error.message.includes("FORBIDDEN") ? 403 : 409 });
  return NextResponse.json({ data });
}
