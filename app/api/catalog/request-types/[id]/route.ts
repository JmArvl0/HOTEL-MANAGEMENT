import { NextResponse } from "next/server";
import { z } from "zod";
import { guardCatalog, adminGuardFailed } from "@/lib/admin-route";
import { canConfigurePreArrival } from "@/lib/inventory-request-options";

const patchSchema = z.object({
  label: z.string().trim().min(2).max(60).optional(),
  department: z.enum(["front_desk", "housekeeping", "maintenance"]).optional(),
  active: z.boolean().optional(),
  sort_order: z.coerce.number().int().min(0).max(1000).optional(),
  inventory_item_id: z.string().trim().min(1).max(80).nullable().optional(),
  pre_arrival_requestable: z.boolean().optional(),
});

const PRE_ARRIVAL_KEYS = ["inventory_item_id", "pre_arrival_requestable"] as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await guardCatalog();
  if (adminGuardFailed(c)) return c;
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success || !Object.keys(parsed.data).length) return NextResponse.json({ error: parsed.error?.issues[0]?.message ?? "Nothing to update." }, { status: 400 });
  // Pre-arrival/inventory linkage is Manager-only operational governance: it does
  // NOT inherit the generic catalog administration roles (owner/admin). The DB-
  // verified role (not the session claim) decides.
  if (PRE_ARRIVAL_KEYS.some((key) => parsed.data[key] !== undefined) && !canConfigurePreArrival(c.role)) {
    return NextResponse.json({ error: "Pre-arrival request configuration requires Manager authority." }, { status: 403 });
  }
  const { data, error } = await c.client.from("guest_request_catalog").update(parsed.data).eq("id", (await params).id).select("id,value,label,department,active,sort_order,inventory_item_id,pre_arrival_requestable,created_at").single();
  if (error) {
    if (error.code === "PGRST116") return NextResponse.json({ error: "That request type no longer exists." }, { status: 404 });
    if (/foreign key/i.test(error.message)) return NextResponse.json({ error: "That inventory item no longer exists." }, { status: 409 });
    if (/duplicate key|unique/i.test(error.message)) return NextResponse.json({ error: "That inventory item is already linked to another request type." }, { status: 409 });
    return NextResponse.json({ error: "Unable to update the request type." }, { status: 409 });
  }
  return NextResponse.json({ data });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await guardCatalog();
  if (adminGuardFailed(c)) return c;
  // History is safe: guest_requests.request_type is a plain string, never an
  // FK to the catalog, so deleting a type only removes it from future forms.
  const { error } = await c.client.from("guest_request_catalog").delete().eq("id", (await params).id);
  if (error) return NextResponse.json({ error: "Unable to delete the request type." }, { status: 409 });
  return NextResponse.json({ data: { deleted: true } });
}
