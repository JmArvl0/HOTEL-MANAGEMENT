import { NextResponse } from "next/server";
import { z } from "zod";
import { guardCatalog, adminGuardFailed } from "@/lib/admin-route";

const patchSchema = z.object({
  label: z.string().trim().min(2).max(60).optional(),
  department: z.enum(["front_desk", "housekeeping", "maintenance"]).optional(),
  active: z.boolean().optional(),
  sort_order: z.coerce.number().int().min(0).max(1000).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await guardCatalog();
  if (adminGuardFailed(c)) return c;
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success || !Object.keys(parsed.data).length) return NextResponse.json({ error: parsed.error?.issues[0]?.message ?? "Nothing to update." }, { status: 400 });
  const { data, error } = await c.client.from("guest_request_catalog").update(parsed.data).eq("id", (await params).id).select("id,value,label,department,active,sort_order,created_at").single();
  if (error) return NextResponse.json({ error: "Unable to update the request type." }, { status: error.code === "PGRST116" ? 404 : 409 });
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
